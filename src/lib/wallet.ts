import {
  WalletError,
  toWalletError,
  type WalletOperation,
} from "./wallet-error";

/**
 * Wallet transport layer: every call into Freighter goes through here.
 *
 * The context (src/context/WalletContext.tsx) owns React state; this module
 * owns the rules that make talking to a browser extension safe:
 *
 *   - Every request is bounded by a timeout, so a dismissed or hung extension
 *     popup can never leave the UI waiting forever.
 *   - Requests are serialised: Freighter shows one popup at a time, so
 *     concurrent callers queue instead of racing.
 *   - Requests are deduplicated by transaction hash, so double-clicking a
 *     submit button cannot produce two signatures of the same transaction.
 *   - Signed XDR is never stored in module state, and hashes (not signatures)
 *     are what the dedup cache keeps.
 *   - The extension surface is integrity-checked before a signature is
 *     requested (secure context, unpatched API, matching network).
 *
 * See docs/WALLET_SECURITY.md for the threat model behind these rules.
 */

// === Constants

/** Default ceiling for a signature prompt. */
export const SIGN_TIMEOUT_MS = 30_000;

/** Connection prompts include install/unlock steps, so they get longer. */
export const CONNECT_TIMEOUT_MS = 60_000;

/**
 * Ceiling for calls that need no user interaction. Freighter answers these
 * over a page message channel, so silence means the extension is not there
 * and waiting the full connect timeout would just hang the UI.
 */
export const PROBE_TIMEOUT_MS = 3_000;

export const MAINNET_PASSPHRASE = "Public Global Stellar Network ; September 2015";
export const TESTNET_PASSPHRASE = "Test SDF Network ; September 2015";

export function networkPassphrase(
  network: string | undefined = process.env.NEXT_PUBLIC_STELLAR_NETWORK
): string {
  return network === "mainnet" ? MAINNET_PASSPHRASE : TESTNET_PASSPHRASE;
}

// === Types

/**
 * The slice of @stellar/freighter-api this app uses. Declared structurally so
 * tests can inject a fake and never load the real extension bridge.
 */
export interface FreighterApi {
  isConnected: () => Promise<boolean>;
  getPublicKey: () => Promise<string>;
  signTransaction: (
    xdr: string,
    opts: { networkPassphrase: string }
  ) => Promise<string>;
  getNetworkDetails?: () => Promise<{ networkPassphrase?: string }>;
}

export interface WalletClientOptions {
  /** Injected in tests; production resolves the real extension bridge. */
  api?: FreighterApi | (() => Promise<FreighterApi>);
  networkPassphrase?: string;
  signTimeoutMs?: number;
  connectTimeoutMs?: number;
  probeTimeoutMs?: number;
}

export interface SignOptions {
  /**
   * What to do when the same transaction is already awaiting a signature.
   * "reject" (default) surfaces DUPLICATE_REQUEST; "share" resolves with the
   * in-flight prompt's result instead of opening a second popup.
   */
  onDuplicate?: "reject" | "share";
  /** Overrides the client-wide timeout for this request. */
  timeoutMs?: number;
}

export interface IntegrityReport {
  ok: boolean;
  /** Extension bridges are only trustworthy on https / localhost. */
  secureContext: boolean;
  /** Every method the app needs is present and callable. */
  apiAvailable: boolean;
  /** No method was swapped out after the module first captured the API. */
  apiIntact: boolean;
  /** null when the wallet doesn't expose network details. */
  networkMatches: boolean | null;
  issues: string[];
}

// === Helpers

/**
 * Rejects with a TIMEOUT WalletError if `promise` hasn't settled in `ms`.
 * The original promise is left with a no-op catch: it stays pending inside
 * the extension, and its late rejection must not surface as an unhandled
 * rejection once we've stopped waiting on it.
 */
export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  operation: WalletOperation
): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;

  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(
        new WalletError(`Wallet ${operation} request timed out after ${ms}ms`, {
          code: "TIMEOUT",
          operation,
        })
      );
    }, ms);
  });

  promise.catch(() => {});

  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function fallbackHash(value: string): string {
  // FNV-1a. Only used where SubtleCrypto is unavailable (insecure origins);
  // this is a dedup key, never a security boundary.
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `fnv1a-${hash.toString(16).padStart(8, "0")}`;
}

/** Stable dedup key for a transaction. SHA-256 of the XDR when available. */
export async function hashTransaction(xdr: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return fallbackHash(xdr);

  try {
    const digest = await subtle.digest("SHA-256", new TextEncoder().encode(xdr));
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    return fallbackHash(xdr);
  }
}

let defaultApi: Promise<FreighterApi> | null = null;

function loadDefaultApi(): Promise<FreighterApi> {
  // Imported lazily so the extension bridge is never pulled into a server
  // render or a node test run.
  defaultApi ??= (import("@stellar/freighter-api").then((mod) => ({
    isConnected: mod.isConnected,
    getPublicKey: mod.getPublicKey,
    signTransaction: mod.signTransaction,
    getNetworkDetails: mod.getNetworkDetails,
  })) as Promise<FreighterApi>).catch((err) => {
    // Do not cache the failure: the user may install the extension and retry
    // without reloading.
    defaultApi = null;
    throw err;
  });
  return defaultApi;
}

// === Client

export class WalletClient {
  private readonly resolveApi: () => Promise<FreighterApi>;
  private readonly passphrase: string;
  private readonly signTimeoutMs: number;
  private readonly connectTimeoutMs: number;
  private readonly probeTimeoutMs: number;

  /** hash -> in-flight signature promise. Cleared in a finally block. */
  private readonly inFlight = new Map<string, Promise<string>>();
  /** Hashes already signed this session. Holds no signature material. */
  private readonly signed = new Set<string>();
  /** Tail of the request chain, which serialises extension popups. */
  private queue: Promise<unknown> = Promise.resolve();
  /** API methods captured on first use, compared on every integrity check. */
  private snapshot: FreighterApi | null = null;

  constructor(options: WalletClientOptions = {}) {
    const { api } = options;
    this.resolveApi =
      typeof api === "function"
        ? api
        : api
          ? () => Promise.resolve(api)
          : loadDefaultApi;
    this.passphrase = options.networkPassphrase ?? networkPassphrase();
    this.signTimeoutMs = options.signTimeoutMs ?? SIGN_TIMEOUT_MS;
    this.connectTimeoutMs = options.connectTimeoutMs ?? CONNECT_TIMEOUT_MS;
    this.probeTimeoutMs = options.probeTimeoutMs ?? PROBE_TIMEOUT_MS;
  }

  /** Number of signature prompts currently open or queued. */
  get pending(): number {
    return this.inFlight.size;
  }

  isPending(hash: string): boolean {
    return this.inFlight.has(hash);
  }

  hasSigned(hash: string): boolean {
    return this.signed.has(hash);
  }

  /**
   * Clears dedup bookkeeping so a recovered session can re-sign a
   * transaction that previously failed downstream. Never clears an in-flight
   * entry, because that would let a second popup open for the same transaction.
   */
  release(hash: string): void {
    this.signed.delete(hash);
  }

  reset(): void {
    this.signed.clear();
  }

  private async api(): Promise<FreighterApi> {
    const api = await this.resolveApi();
    this.snapshot ??= { ...api };
    return api;
  }

  /**
   * Verifies the page and the extension bridge before trusting them with a
   * transaction: a secure origin, a complete API surface, methods that
   * haven't been swapped out since first load, and a wallet sitting on the
   * network this app builds transactions for.
   */
  async checkIntegrity(): Promise<IntegrityReport> {
    const issues: string[] = [];

    const secureContext =
      typeof globalThis.isSecureContext === "boolean"
        ? globalThis.isSecureContext
        : true;
    if (!secureContext) issues.push("Page is not a secure context");

    let api: FreighterApi | null = null;
    try {
      api = await this.api();
    } catch (err) {
      issues.push(`Freighter API unavailable: ${String(err)}`);
    }

    const required = ["isConnected", "getPublicKey", "signTransaction"] as const;
    const apiAvailable =
      !!api && required.every((key) => typeof api?.[key] === "function");
    if (!apiAvailable) issues.push("Freighter API is missing required methods");

    const apiIntact =
      !!api &&
      !!this.snapshot &&
      required.every((key) => api?.[key] === this.snapshot?.[key]);
    if (apiAvailable && !apiIntact) {
      issues.push("Freighter API methods changed after page load");
    }

    let networkMatches: boolean | null = null;
    if (api?.getNetworkDetails) {
      try {
        const details = await withTimeout(
          api.getNetworkDetails(),
          this.probeTimeoutMs,
          "sign"
        );
        if (details?.networkPassphrase) {
          networkMatches = details.networkPassphrase === this.passphrase;
          if (!networkMatches) issues.push("Wallet is on a different network");
        }
      } catch {
        // Network details are advisory. A wallet that can't report them
        // still signs, and the network mismatch surfaces on submit.
      }
    }

    return {
      ok: issues.length === 0,
      secureContext,
      apiAvailable,
      apiIntact,
      networkMatches,
      issues,
    };
  }

  /** Resolves the connected public key, or throws a typed WalletError. */
  async connect(): Promise<string> {
    return this.enqueue(async () => {
      let api: FreighterApi;
      try {
        api = await this.api();
      } catch (err) {
        throw new WalletError("Freighter not installed", {
          code: "NOT_INSTALLED",
          cause: err,
          operation: "connect",
        });
      }

      let installed: boolean;
      try {
        installed = await withTimeout(api.isConnected(), this.probeTimeoutMs, "connect");
      } catch (err) {
        const error = toWalletError(err, "connect");
        // Nothing answered the probe, so there is no extension to answer it.
        if (error.code === "TIMEOUT") {
          throw new WalletError("Freighter did not respond to the probe", {
            code: "NOT_INSTALLED",
            cause: err,
            operation: "connect",
          });
        }
        throw error;
      }

      if (!installed) {
        throw new WalletError("Freighter not installed", {
          code: "NOT_INSTALLED",
          operation: "connect",
        });
      }

      let publicKey: string;
      try {
        publicKey = await withTimeout(
          api.getPublicKey(),
          this.connectTimeoutMs,
          "connect"
        );
      } catch (err) {
        throw toWalletError(err, "connect");
      }

      // Freighter resolves with an empty string when the user dismisses the
      // approval prompt rather than rejecting the promise.
      if (!publicKey) {
        throw new WalletError("Connection request was declined", {
          code: "CONNECTION_REJECTED",
          operation: "connect",
        });
      }

      return publicKey;
    });
  }

  /**
   * Signs `xdr`, enforcing the timeout, the one-popup-at-a-time queue, and
   * hash deduplication. Resolves with the signed XDR, and the only place that
   * value is ever held is the caller's own stack frame.
   */
  async sign(xdr: string, options: SignOptions = {}): Promise<string> {
    const hash = await hashTransaction(xdr);
    const onDuplicate = options.onDuplicate ?? "reject";
    const timeoutMs = options.timeoutMs ?? this.signTimeoutMs;

    const existing = this.inFlight.get(hash);
    if (existing) {
      if (onDuplicate === "share") return existing;
      throw new WalletError("This transaction is already awaiting signature", {
        code: "DUPLICATE_REQUEST",
        operation: "sign",
      });
    }

    if (this.signed.has(hash)) {
      throw new WalletError("This transaction has already been signed", {
        code: "DUPLICATE_REQUEST",
        operation: "sign",
      });
    }

    const request = this.enqueue(async () => {
      const integrity = await this.checkIntegrity();
      if (!integrity.apiAvailable || !integrity.secureContext || !integrity.apiIntact) {
        throw new WalletError(integrity.issues.join("; ") || "Wallet integrity check failed", {
          code: "INTEGRITY_ERROR",
          operation: "sign",
        });
      }
      if (integrity.networkMatches === false) {
        throw new WalletError("Wallet network does not match the app network", {
          code: "NETWORK_MISMATCH",
          operation: "sign",
        });
      }

      const api = await this.api();
      let signed: string;
      try {
        signed = await withTimeout(
          api.signTransaction(xdr, { networkPassphrase: this.passphrase }),
          timeoutMs,
          "sign"
        );
      } catch (err) {
        throw toWalletError(err, "sign");
      }

      if (!signed) {
        throw new WalletError("Signature request was declined", {
          code: "SIGN_REJECTED",
          operation: "sign",
        });
      }

      this.signed.add(hash);
      return signed;
    });

    this.inFlight.set(hash, request);
    try {
      return await request;
    } finally {
      // Drop the promise as soon as it settles: keeping it would retain the
      // signed XDR in module scope for as long as the client lives.
      this.inFlight.delete(hash);
    }
  }

  /**
   * Runs `task` after every earlier task has settled. Freighter renders one
   * popup at a time, so overlapping requests would otherwise silently drop.
   */
  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task, task);
    // The chain must never reject, or every later task inherits the failure.
    this.queue = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }
}

/** Shared client for the app. Tests construct their own with a fake API. */
export const walletClient = new WalletClient();
