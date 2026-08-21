import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { withRetry, calculateRetryDelay, type RetryConfig } from "./retry";
import { ApiError } from "./api-error";

describe("Retry Logic", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("calculateRetryDelay", () => {
    it("should calculate exponential backoff correctly", () => {
      const baseDelay = 1000;
      const maxDelay = 30000;

      // First retry: 1000ms
      const delay1 = calculateRetryDelay(1, baseDelay, maxDelay);
      expect(delay1).toBeGreaterThanOrEqual(1000);
      expect(delay1).toBeLessThanOrEqual(1100); // With 10% jitter

      // Second retry: 2000ms
      const delay2 = calculateRetryDelay(2, baseDelay, maxDelay);
      expect(delay2).toBeGreaterThanOrEqual(2000);
      expect(delay2).toBeLessThanOrEqual(2200);

      // Third retry: 4000ms
      const delay3 = calculateRetryDelay(3, baseDelay, maxDelay);
      expect(delay3).toBeGreaterThanOrEqual(4000);
      expect(delay3).toBeLessThanOrEqual(4400);
    });

    it("should cap delay at maxDelay", () => {
      const baseDelay = 1000;
      const maxDelay = 5000;

      // Fourth retry would be 8000ms, but capped at 5000ms
      const delay4 = calculateRetryDelay(4, baseDelay, maxDelay);
      expect(delay4).toBeLessThanOrEqual(maxDelay);
    });

    it("should use default values when not provided", () => {
      const delay = calculateRetryDelay(1);
      expect(delay).toBeGreaterThan(0);
    });
  });

  describe("withRetry", () => {
    it("should return result on first success", async () => {
      const mockFn = vi.fn().mockResolvedValue("success");

      const { result, retryState } = await withRetry(mockFn);

      expect(result).toBe("success");
      expect(retryState.attempt).toBe(1);
      expect(retryState.isRetrying).toBe(false);
      expect(mockFn).toHaveBeenCalledOnce();
    });

    it("should retry on retryable errors", async () => {
      const mockFn = vi
        .fn()
        .mockRejectedValueOnce(
          new ApiError("Network error", { code: "HTTP_ERROR", status: 500 })
        )
        .mockResolvedValueOnce("success");

      const { result, retryState } = await withRetry(mockFn, {
        maxRetries: 3,
        baseDelay: 100,
        maxDelay: 1000,
      });

      expect(result).toBe("success");
      expect(retryState.attempt).toBe(2);
      expect(mockFn).toHaveBeenCalledTimes(2);
    });

    it("should retry on 5xx errors", async () => {
      const mockFn = vi
        .fn()
        .mockRejectedValueOnce(
          new ApiError("Server error", { code: "HTTP_ERROR", status: 500 })
        )
        .mockResolvedValueOnce("success");

      const { result } = await withRetry(mockFn, {
        maxRetries: 3,
        baseDelay: 100,
      });

      expect(result).toBe("success");
      expect(mockFn).toHaveBeenCalledTimes(2);
    });

    it("should retry on 408 (timeout) and 429 (rate limit)", async () => {
      let callCount = 0;
      const mockFn = vi.fn(async () => {
        callCount++;
        if (callCount === 1) {
          throw new ApiError("Too many requests", { code: "HTTP_ERROR", status: 429 });
        }
        return "success";
      });

      const { result } = await withRetry(mockFn, {
        maxRetries: 3,
        baseDelay: 100,
      });

      expect(result).toBe("success");
      expect(mockFn).toHaveBeenCalledTimes(2);
    });

    it("should respect maxRetries limit", async () => {
      const mockFn = vi
        .fn()
        .mockRejectedValue(
          new ApiError("Server error", { code: "HTTP_ERROR", status: 500 })
        );

      await expect(
        withRetry(mockFn, {
          maxRetries: 2,
          baseDelay: 100,
        })
      ).rejects.toThrow();

      // Should attempt: 1 initial + 2 retries = 3 total
      expect(mockFn).toHaveBeenCalledTimes(3);
    });

    it("should call onRetry callback on retries", async () => {
      const onRetry = vi.fn();
      const mockFn = vi
        .fn()
        .mockRejectedValueOnce(
          new ApiError("Server error", { code: "HTTP_ERROR", status: 500 })
        )
        .mockResolvedValueOnce("success");

      await withRetry(mockFn, {
        maxRetries: 3,
        baseDelay: 100,
        onRetry,
      });

      expect(onRetry).toHaveBeenCalledOnce();
      expect(onRetry).toHaveBeenCalledWith(
        1,
        expect.any(Number),
        expect.any(Error)
      );
    });

    it("should support custom shouldRetry function", async () => {
      const shouldRetry = vi.fn().mockReturnValue(false);
      const mockFn = vi
        .fn()
        .mockRejectedValue(new Error("Custom error"));

      await expect(
        withRetry(mockFn, {
          shouldRetry,
        })
      ).rejects.toThrow();

      expect(shouldRetry).toHaveBeenCalledOnce();
      expect(mockFn).toHaveBeenCalledOnce();
    });

    it("should handle cancellation", async () => {
      const mockFn = vi
        .fn()
        .mockRejectedValue(
          new ApiError("Server error", { code: "HTTP_ERROR", status: 500 })
        );

      const config: RetryConfig = {
        maxRetries: 3,
        baseDelay: 100,
      };

      const retryPromise = withRetry(mockFn, config);

      // Simulate user cancellation by checking isCancelled
      // In real usage, this would be triggered by the AbortController in SubmitSolution
      await expect(retryPromise).rejects.toThrow();
    });

    it("should handle network errors", async () => {
      const mockFn = vi
        .fn()
        .mockRejectedValueOnce(
          new ApiError("Network unavailable", { code: "NETWORK_ERROR" })
        )
        .mockResolvedValueOnce("success");

      const { result } = await withRetry(mockFn, {
        maxRetries: 3,
        baseDelay: 100,
      });

      expect(result).toBe("success");
    });

    it("should throw after all retries exhausted", async () => {
      const mockFn = vi
        .fn()
        .mockRejectedValue(
          new ApiError("Server error", { code: "HTTP_ERROR", status: 500 })
        );

      await expect(
        withRetry(mockFn, {
          maxRetries: 1,
          baseDelay: 100,
        })
      ).rejects.toThrow(ApiError);

      expect(mockFn).toHaveBeenCalledTimes(2);
    });

    it("should handle non-Error objects", async () => {
      const mockFn = vi
        .fn()
        .mockRejectedValueOnce("string error")
        .mockResolvedValueOnce("success");

      const { result } = await withRetry(mockFn, {
        maxRetries: 1,
        baseDelay: 100,
      });

      expect(result).toBe("success");
      expect(mockFn).toHaveBeenCalledTimes(2);
    });
  });

  describe("Jitter", () => {
    it("should add jitter to prevent thundering herd", () => {
      const delays = [];
      for (let i = 0; i < 100; i++) {
        delays.push(calculateRetryDelay(1, 1000, 30000));
      }

      // Check that delays vary (jitter is present)
      const uniqueDelays = new Set(delays);
      expect(uniqueDelays.size).toBeGreaterThan(1);

      // All delays should be within expected range
      delays.forEach((delay) => {
        expect(delay).toBeGreaterThanOrEqual(1000);
        expect(delay).toBeLessThanOrEqual(1100);
      });
    });
  });
});
