export type ApiErrorCode =
  | "NETWORK_ERROR"
  | "HTTP_ERROR"
  | "PARSE_ERROR"
  | "VALIDATION_ERROR";

export interface ApiErrorOptions {
  code: ApiErrorCode;
  status?: number;
  details?: unknown;
  cause?: unknown;
}

/**
 * Thrown by src/lib/api.ts for every failure mode: the network request
 * itself failing, a non-2xx HTTP status, an unparsable response body, or a
 * response that doesn't match its Zod schema. Always inspect `code` rather
 * than parsing `message` to branch on the failure type.
 */
export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status?: number;
  readonly details?: unknown;

  constructor(message: string, options: ApiErrorOptions) {
    super(message, { cause: options.cause });
    this.name = "ApiError";
    this.code = options.code;
    this.status = options.status;
    this.details = options.details;

    // Restore the prototype chain so `instanceof ApiError` works when this
    // class is transpiled down for older targets.
    Object.setPrototypeOf(this, ApiError.prototype);
  }
}
