import { ApiError } from "./api-error";

export interface RetryConfig {
  maxRetries?: number;
  baseDelay?: number;
  maxDelay?: number;
  onRetry?: (attempt: number, delay: number, error: Error) => void;
  shouldRetry?: (error: Error) => boolean;
}

export interface RetryState {
  attempt: number;
  nextRetryIn: number;
  isRetrying: boolean;
  isCancelled: boolean;
}

const DEFAULT_CONFIG: Required<Omit<RetryConfig, "onRetry" | "shouldRetry">> = {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 30000,
};

function defaultShouldRetry(error: Error): boolean {
  if (!(error instanceof ApiError)) {
    return true;
  }

  const status = error.status;
  const code = error.code;

  if (code === "NETWORK_ERROR") {
    return true;
  }

  if (code === "HTTP_ERROR") {
    if (!status) return true;
    if (status >= 500) return true;
    if (status === 408 || status === 429) return true;
    if ([400, 422, 401, 403].includes(status)) return false;
  }

  if (code === "PARSE_ERROR") {
    return true;
  }

  if (code === "VALIDATION_ERROR") {
    return false;
  }

  return true;
}

function calculateDelay(
  attempt: number,
  baseDelay: number,
  maxDelay: number
): number {
  const exponentialDelay = baseDelay * Math.pow(2, attempt - 1);
  const jitter = Math.random() * 0.1 * exponentialDelay;
  const delayWithJitter = exponentialDelay + jitter;
  return Math.min(delayWithJitter, maxDelay);
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  config: RetryConfig = {}
): Promise<{ result: T; retryState: RetryState }> {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };
  const retryState: RetryState = {
    attempt: 0,
    nextRetryIn: 0,
    isRetrying: false,
    isCancelled: false,
  };

  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= finalConfig.maxRetries + 1; attempt++) {
    try {
      retryState.attempt = attempt;
      const result = await fn();
      return { result, retryState };
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      lastError = error;

      const shouldRetry =
        attempt <= finalConfig.maxRetries &&
        (config.shouldRetry ?? defaultShouldRetry)(error);

      if (!shouldRetry) {
        throw error;
      }

      if (retryState.isCancelled) {
        throw error;
      }

      const delay = calculateDelay(
        attempt,
        finalConfig.baseDelay,
        finalConfig.maxDelay
      );
      retryState.nextRetryIn = delay;
      retryState.isRetrying = true;

      config.onRetry?.(attempt, delay, error);

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError || new Error("Retry exhausted");
}

export function calculateRetryDelay(
  attempt: number,
  baseDelay: number = DEFAULT_CONFIG.baseDelay,
  maxDelay: number = DEFAULT_CONFIG.maxDelay
): number {
  return calculateDelay(attempt, baseDelay, maxDelay);
}
