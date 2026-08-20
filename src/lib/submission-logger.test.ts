import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  generateSubmissionId,
  createSubmissionLog,
  maskAddress,
  logRetryAttempt,
  logSubmissionSuccess,
  logSubmissionCancelled,
  logSubmissionFailure,
  logUnexpectedError,
  exportSubmissionLog,
  analyzeSubmissionLog,
} from "./submission-logger";

describe("Submission Logger", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("generateSubmissionId", () => {
    it("should generate unique submission IDs", () => {
      const id1 = generateSubmissionId();
      const id2 = generateSubmissionId();

      expect(id1).toBeTruthy();
      expect(id2).toBeTruthy();
      expect(id1).not.toBe(id2);
    });

    it("should include timestamp and random component", () => {
      const id = generateSubmissionId();
      expect(id).toMatch(/^\d+-[a-z0-9]+$/);
    });
  });

  describe("createSubmissionLog", () => {
    it("should create a new submission log with correct structure", () => {
      const log = createSubmissionLog(
        "GTEST123456789",
        "challenge-1"
      );

      expect(log).toHaveProperty("id");
      expect(log).toHaveProperty("timestamp");
      expect(log.address).toBe("GTEST123456789");
      expect(log.challengeId).toBe("challenge-1");
      expect(log.attempts).toBe(0);
      expect(log.errors).toEqual([]);
    });

    it("should use provided submission ID if given", () => {
      const customId = "custom-id-123";
      const log = createSubmissionLog(
        "GTEST123456789",
        "challenge-1",
        customId
      );

      expect(log.id).toBe(customId);
    });

    it("should generate submission ID if not provided", () => {
      const log = createSubmissionLog(
        "GTEST123456789",
        "challenge-1"
      );

      expect(log.id).toMatch(/^\d+-[a-z0-9]+$/);
    });
  });

  describe("maskAddress", () => {
    it("should mask wallet address to first 8 chars", () => {
      const masked = maskAddress("GTEST123456789ABCDEF");
      expect(masked).toBe("GTEST123...");
    });

    it("should return unknown for undefined address", () => {
      const masked = maskAddress(undefined);
      expect(masked).toBe("unknown");
    });

    it("should return unknown for empty address", () => {
      const masked = maskAddress("");
      expect(masked).toBe("unknown");
    });

    it("should handle short addresses gracefully", () => {
      const masked = maskAddress("GTX");
      expect(masked).toBe("GTX...");
    });
  });

  describe("logging functions", () => {
    it("should call console.warn for retry attempts", () => {
      const warnSpy = vi.spyOn(console, "warn");

      logRetryAttempt(
        "sub-123",
        1,
        1000,
        { message: "Network error", code: "NETWORK_ERROR" },
        { challengeId: "challenge-1", address: "GTEST123456789" }
      );

      expect(warnSpy).toHaveBeenCalledWith(
        "[SubmitSolution] Retry attempt 1 of 3 (sub-123)",
        expect.any(Object)
      );

      warnSpy.mockRestore();
    });

    it("should call console.info for submission success", () => {
      const infoSpy = vi.spyOn(console, "info");

      logSubmissionSuccess(
        "sub-123",
        2,
        1,
        1,
        { challengeId: "challenge-1", address: "GTEST123456789" }
      );

      expect(infoSpy).toHaveBeenCalledWith(
        "[SubmitSolution] Submission successful (sub-123)",
        expect.any(Object)
      );

      infoSpy.mockRestore();
    });

    it("should call console.info for submission cancellation", () => {
      const infoSpy = vi.spyOn(console, "info");

      logSubmissionCancelled("sub-123", 2, {
        challengeId: "challenge-1",
        address: "GTEST123456789",
      });

      expect(infoSpy).toHaveBeenCalledWith(
        "[SubmitSolution] Submission cancelled by user (sub-123)",
        expect.any(Object)
      );

      infoSpy.mockRestore();
    });

    it("should call console.error for submission failure", () => {
      const errorSpy = vi.spyOn(console, "error");

      logSubmissionFailure(
        "sub-123",
        3,
        [
          { attempt: 1, error: "Server error", status: 500 },
          { attempt: 2, error: "Server error", status: 500 },
        ],
        { challengeId: "challenge-1", address: "GTEST123456789" }
      );

      expect(errorSpy).toHaveBeenCalledWith(
        "[SubmitSolution] Submission failed after 2 retries (sub-123)",
        expect.any(Object)
      );

      errorSpy.mockRestore();
    });

    it("should call console.error for unexpected errors", () => {
      const errorSpy = vi.spyOn(console, "error");

      logUnexpectedError(
        "sub-123",
        1,
        [{ attempt: 1, error: "Unknown error" }],
        { challengeId: "challenge-1", address: "GTEST123456789" }
      );

      expect(errorSpy).toHaveBeenCalledWith(
        "[SubmitSolution] Unexpected error (sub-123)",
        expect.any(Object)
      );

      errorSpy.mockRestore();
    });
  });

  describe("exportSubmissionLog", () => {
    it("should export log as JSON string", () => {
      const log = createSubmissionLog("GTEST123456789", "challenge-1");
      log.attempts = 2;
      log.errors = [
        { attempt: 1, error: "Server error", status: 500 },
      ];

      const exported = exportSubmissionLog(log);
      const parsed = JSON.parse(exported);

      expect(parsed).toEqual(log);
    });

    it("should format JSON with proper indentation", () => {
      const log = createSubmissionLog("GTEST123456789", "challenge-1");
      const exported = exportSubmissionLog(log);

      expect(exported).toContain("\n");
      expect(exported).toContain("  ");
    });
  });

  describe("analyzeSubmissionLog", () => {
    it("should mark log as successful when errors < total attempts", () => {
      const log = createSubmissionLog("GTEST123456789", "challenge-1");
      log.attempts = 2; // 2 retries = 3 total attempts
      log.errors = [
        { attempt: 1, error: "Error 1" },
        { attempt: 2, error: "Error 2" },
      ]; // 2 errors means 1 success

      const analysis = analyzeSubmissionLog(log);
      expect(analysis.success).toBe(true); // 2 errors < 3 total attempts (attempts + 1)
    });

    it("should extract error codes and statuses", () => {
      const log = createSubmissionLog("GTEST123456789", "challenge-1");
      log.attempts = 2;
      log.errors = [
        { attempt: 1, error: "Error 1", code: "NETWORK_ERROR", status: 500 },
        { attempt: 2, error: "Error 2", code: "HTTP_ERROR", status: 503 },
      ];

      const analysis = analyzeSubmissionLog(log);
      expect(analysis.errorCodes).toContain("NETWORK_ERROR");
      expect(analysis.errorCodes).toContain("HTTP_ERROR");
      expect(analysis.errorStatuses).toContain(500);
      expect(analysis.errorStatuses).toContain(503);
    });

    it("should calculate average error count", () => {
      const log = createSubmissionLog("GTEST123456789", "challenge-1");
      log.attempts = 2;
      log.errors = [
        { attempt: 1, error: "Error 1" },
        { attempt: 2, error: "Error 2" },
      ];

      const analysis = analyzeSubmissionLog(log);
      expect(analysis.averageErrorCount).toBe(2 / 3);
    });

    it("should return 0 average error count when no errors", () => {
      const log = createSubmissionLog("GTEST123456789", "challenge-1");
      log.attempts = 0;
      log.errors = [];

      const analysis = analyzeSubmissionLog(log);
      expect(analysis.averageErrorCount).toBe(0);
    });

    it("should return total retries from attempts", () => {
      const log = createSubmissionLog("GTEST123456789", "challenge-1");
      log.attempts = 2;

      const analysis = analyzeSubmissionLog(log);
      expect(analysis.totalRetries).toBe(2);
    });
  });
});
