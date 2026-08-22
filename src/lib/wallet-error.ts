export type WalletErrorCode =
  | "NOT_INSTALLED"
  | "NOT_CONNECTED"
  | "CONNECTION_REJECTED"
  | "SIGN_REJECTED"
  | "TIMEOUT"
  | "DUPLICATE_REQUEST"
  | "NETWORK_MISMATCH"
  | "INTEGRITY_ERROR"
  | "UNKNOWN";

export interface WalletErrorOptions {
  code: WalletErrorCode;
  cause?: unknown;
  /** Operation that failed, used by the recovery UI to pick an action. */
  operation?: WalletOperation;
}

export type WalletOperation = "connect" | "sign";

/**
 * Thrown by src/lib/wallet.ts for every wallet failure mode: a missing
 * extension, a user declining a prompt, a prompt that never came back, a
 * duplicate signing request, a wallet pointed at the wrong network, or a
 * tampered Freighter API. Always branch on `code` rather than parsing
 * `message`, because the underlying extension wording is not stable.
 */
export class WalletError extends Error {
  readonly code: WalletErrorCode;
  readonly operation?: WalletOperation;

  constructor(message: string, options: WalletErrorOptions) {
    super(message, { cause: options.cause });
    this.name = "WalletError";
    this.code = options.code;
    this.operation = options.operation;

    // Restore the prototype chain so `instanceof WalletError` works when this
    // class is transpiled down for older targets.
    Object.setPrototypeOf(this, WalletError.prototype);
  }
}

/** User-facing copy, keyed by code. Never surface raw extension errors. */
export const WALLET_ERROR_COPY: Record<WalletErrorCode, string> = {
  NOT_INSTALLED:
    "Freighter isn't installed in this browser. Install the extension, then reload and try again.",
  NOT_CONNECTED: "Your wallet isn't connected. Connect it and try again.",
  CONNECTION_REJECTED:
    "You declined the connection request. Approve it in Freighter to continue.",
  SIGN_REJECTED: "You cancelled the signature request. Nothing was submitted.",
  TIMEOUT:
    "Freighter didn't respond in time. Check the extension window, then try again.",
  DUPLICATE_REQUEST:
    "This transaction is already waiting for your signature in Freighter.",
  NETWORK_MISMATCH:
    "Your wallet is on a different Stellar network than this app. Switch networks in Freighter and try again.",
  INTEGRITY_ERROR:
    "We couldn't verify the wallet extension on this page. Reload over HTTPS and disable other wallet extensions before trying again.",
  UNKNOWN: "Something went wrong while talking to your wallet.",
};

/** Codes the user can clear themselves without reloading the page. */
const RECOVERABLE: ReadonlySet<WalletErrorCode> = new Set<WalletErrorCode>([
  "NOT_CONNECTED",
  "CONNECTION_REJECTED",
  "SIGN_REJECTED",
  "TIMEOUT",
  "DUPLICATE_REQUEST",
  "NETWORK_MISMATCH",
  "UNKNOWN",
]);

export function isRecoverable(error: WalletError): boolean {
  return RECOVERABLE.has(error.code);
}

// Freighter has no error codes. It rejects with plain strings whose wording
// changes between releases, so match loosely on intent.
const REJECTION_PATTERN = /declin|reject|denied|cancel|dismiss/i;
const NOT_INSTALLED_PATTERN = /not (installed|detected|available)|no freighter|undefined/i;

function messageOf(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  if (err && typeof err === "object" && "message" in err) {
    return String((err as { message: unknown }).message);
  }
  return "";
}

/**
 * Normalises anything thrown by the Freighter API into a WalletError.
 * Pass-through for values that are already WalletErrors so codes raised
 * deliberately (timeout, dedup) survive the wrapping.
 */
export function toWalletError(
  err: unknown,
  operation: WalletOperation
): WalletError {
  if (err instanceof WalletError) return err;

  const message = messageOf(err);

  if (REJECTION_PATTERN.test(message)) {
    return new WalletError(message || "Request declined", {
      code: operation === "connect" ? "CONNECTION_REJECTED" : "SIGN_REJECTED",
      cause: err,
      operation,
    });
  }

  if (NOT_INSTALLED_PATTERN.test(message)) {
    return new WalletError(message || "Freighter not installed", {
      code: "NOT_INSTALLED",
      cause: err,
      operation,
    });
  }

  return new WalletError(message || "Wallet request failed", {
    code: "UNKNOWN",
    cause: err,
    operation,
  });
}
