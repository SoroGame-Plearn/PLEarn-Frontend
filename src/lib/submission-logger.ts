/**
 * Submission Logging Utility
 *
 * Provides structured logging for submission attempts, retries, and failures.
 * Useful for debugging and monitoring submission reliability.
 */

export interface SubmissionError {
  attempt: number;
  error: string;
  code?: string;
  status?: number;
}

export interface SubmissionLog {
  id: string;
  timestamp: string;
  address: string;
  challengeId: string;
  attempts: number;
  errors: SubmissionError[];
}

/**
 * Generate a unique submission ID for tracking
 */
export function generateSubmissionId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Create a new submission log entry
 */
export function createSubmissionLog(
  address: string,
  challengeId: string,
  submissionId?: string
): SubmissionLog {
  return {
    id: submissionId || generateSubmissionId(),
    timestamp: new Date().toISOString(),
    address,
    challengeId,
    attempts: 0,
    errors: [],
  };
}

/**
 * Mask wallet address for logging (show only first 8 chars)
 */
export function maskAddress(address?: string): string {
  if (!address) return "unknown";
  return address.slice(0, 8) + "...";
}

/**
 * Log a retry attempt
 */
export function logRetryAttempt(
  submissionId: string,
  attempt: number,
  delayMs: number,
  error: {
    message: string;
    code?: string;
    status?: number;
  },
  context: {
    challengeId: string;
    address?: string;
  }
): void {
  console.warn(
    `[SubmitSolution] Retry attempt ${attempt} of 3 (${submissionId})`,
    {
      challengeId: context.challengeId,
      address: maskAddress(context.address),
      error: error.message,
      code: error.code,
      status: error.status,
      waitMs: delayMs,
    }
  );
}

/**
 * Log successful submission
 */
export function logSubmissionSuccess(
  submissionId: string,
  successfulAttempt: number,
  totalRetries: number,
  totalErrors: number,
  context: {
    challengeId: string;
    address?: string;
  }
): void {
  console.info(`[SubmitSolution] Submission successful (${submissionId})`, {
    challengeId: context.challengeId,
    address: maskAddress(context.address),
    successfulAttempt,
    totalRetries,
    totalErrors,
  });
}

/**
 * Log submission cancellation by user
 */
export function logSubmissionCancelled(
  submissionId: string,
  totalAttempts: number,
  context: {
    challengeId: string;
    address?: string;
  }
): void {
  console.info(
    `[SubmitSolution] Submission cancelled by user (${submissionId})`,
    {
      challengeId: context.challengeId,
      address: maskAddress(context.address),
      attempts: totalAttempts,
    }
  );
}

/**
 * Log final submission failure after all retries exhausted
 */
export function logSubmissionFailure(
  submissionId: string,
  totalAttempts: number,
  errors: SubmissionError[],
  context: {
    challengeId: string;
    address?: string;
  }
): void {
  console.error(
    `[SubmitSolution] Submission failed after ${totalAttempts - 1} retries (${submissionId})`,
    {
      challengeId: context.challengeId,
      address: maskAddress(context.address),
      totalAttempts,
      errors,
    }
  );
}

/**
 * Log unexpected error during submission
 */
export function logUnexpectedError(
  submissionId: string,
  totalAttempts: number,
  errors: SubmissionError[],
  context: {
    challengeId: string;
    address?: string;
  }
): void {
  console.error(`[SubmitSolution] Unexpected error (${submissionId})`, {
    challengeId: context.challengeId,
    address: maskAddress(context.address),
    totalAttempts,
    errors,
  });
}

/**
 * Export submission log as JSON for debugging
 * Can be used to send logs to a monitoring service
 */
export function exportSubmissionLog(log: SubmissionLog): string {
  return JSON.stringify(log, null, 2);
}

/**
 * Analyze submission log for insights
 */
export function analyzeSubmissionLog(log: SubmissionLog): {
  success: boolean;
  totalRetries: number;
  errorCodes: string[];
  errorStatuses: (number | undefined)[];
  averageErrorCount: number;
} {
  return {
    success: log.errors.length < log.attempts + 1,
    totalRetries: log.attempts,
    errorCodes: log.errors
      .map((e) => e.code)
      .filter((code) => code !== undefined) as string[],
    errorStatuses: log.errors
      .map((e) => e.status)
      .filter((status) => status !== undefined),
    averageErrorCount: log.errors.length > 0 ? log.errors.length / (log.attempts + 1) : 0,
  };
}
