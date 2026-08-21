import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CONNECT_TIMEOUT_MS,
  PROBE_TIMEOUT_MS,
  SIGN_TIMEOUT_MS,
  TESTNET_PASSPHRASE,
  WalletClient,
  hashTransaction,
  type FreighterApi,
} from "./wallet";
import { WalletError, type WalletErrorCode } from "./wallet-error";

// === Fixtures

const PASSPHRASE: string = TESTNET_PASSPHRASE;
const OTHER_PASSPHRASE: string = "Public Global Stellar Network ; September 2015";

const XDR_A: string = "AAAAAgAAAAA-transaction-alpha";
const XDR_B: string = "AAAAAgAAAAA-transaction-beta";

// Deliberately distinctive so a substring scan of the client can prove the
// signed payload was not retained anywhere on the instance.
const SIGNED_A: string = "SIGNED-XDR-ALPHA-8f21c0d4e7b9";
const SIGNED_B: string = "SIGNED-XDR-BETA-1a77f3c2b6de";

const PUBLIC_KEY: string = "GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRS";

// === Helpers

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

interface FakeApiOptions {
  connected?: boolean;
  publicKey?: string | (() => Promise<string>);
  /** undefined omits getNetworkDetails entirely, as older wallets do. */
  networkPassphrase?: string | undefined;
  sign?: (xdr: string) => Promise<string>;
}

interface FakeApi extends FreighterApi {
  signCalls: string[];
  connectCalls: number;
}

function fakeApi(options: FakeApiOptions = {}): FakeApi {
  const signCalls: string[] = [];
  let connectCalls = 0;

  const base: FreighterApi = {
    isConnected: async () => options.connected ?? true,
    getPublicKey: async () => {
      connectCalls += 1;
      const pk = options.publicKey ?? PUBLIC_KEY;
      return typeof pk === "function" ? pk() : pk;
    },
    signTransaction: async (xdr: string) => {
      signCalls.push(xdr);
      if (options.sign) return options.sign(xdr);
      return xdr === XDR_B ? SIGNED_B : SIGNED_A;
    },
  };

  // Non-enumerable so the client's `{ ...api }` integrity snapshot copies the
  // extension surface only, never the test's own bookkeeping.
  const api = base as FakeApi;
  Object.defineProperty(api, "signCalls", { value: signCalls, enumerable: false });
  Object.defineProperty(api, "connectCalls", {
    enumerable: false,
    get: () => connectCalls,
  });

  if ("networkPassphrase" in options) {
    const reported = options.networkPassphrase;
    api.getNetworkDetails = async () => ({ networkPassphrase: reported });
  } else {
    api.getNetworkDetails = async () => ({ networkPassphrase: PASSPHRASE });
  }

  return api;
}

/**
 * Yields to the real event loop. Timer faking in this file is scoped to
 * setTimeout, so setImmediate keeps working while a timeout is being driven
 * forward by hand.
 */
function tick(): Promise<void> {
  return new Promise<void>((resolve) => setImmediate(resolve));
}

async function waitFor(predicate: () => boolean, attempts = 200): Promise<void> {
  for (let i = 0; i < attempts; i++) {
    if (predicate()) return;
    await tick();
  }
  throw new Error("Condition was not met before the attempt budget ran out");
}

async function codeOf(promise: Promise<unknown>): Promise<WalletErrorCode> {
  try {
    await promise;
  } catch (err) {
    expect(err).toBeInstanceOf(WalletError);
    return (err as WalletError).code;
  }
  throw new Error("Expected the promise to reject with a WalletError");
}

/**
 * Every string reachable from an object graph, following Maps and Sets that
 * plain JSON traversal would render as `{}`.
 */
function reachableStrings(
  value: unknown,
  seen: Set<unknown> = new Set<unknown>(),
  out: string[] = []
): string[] {
  if (typeof value === "string") {
    out.push(value);
    return out;
  }
  if (typeof value !== "object" || value === null) return out;
  if (seen.has(value)) return out;
  seen.add(value);

  if (value instanceof Map) {
    for (const [key, entry] of value) {
      reachableStrings(key, seen, out);
      reachableStrings(entry, seen, out);
    }
    return out;
  }
  if (value instanceof Set) {
    for (const entry of value) reachableStrings(entry, seen, out);
    return out;
  }
  if (Array.isArray(value)) {
    for (const entry of value) reachableStrings(entry, seen, out);
    return out;
  }
  for (const entry of Object.values(value)) reachableStrings(entry, seen, out);
  return out;
}

beforeEach(() => {
  // The real SubtleCrypto resolves off the libuv thread pool, so two hashes
  // started microseconds apart can finish out of order. Dedup ordering is
  // what several of these tests assert, so hash on the microtask queue and
  // keep the digest itself a genuine SHA-256.
  vi.spyOn(globalThis.crypto.subtle, "digest").mockImplementation(
    (_algorithm: unknown, data: BufferSource): Promise<ArrayBuffer> => {
      const bytes = ArrayBuffer.isView(data)
        ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
        : new Uint8Array(data);
      const digest = createHash("sha256").update(bytes).digest();
      return Promise.resolve(
        digest.buffer.slice(
          digest.byteOffset,
          digest.byteOffset + digest.byteLength
        ) as ArrayBuffer
      );
    }
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  delete (globalThis as { isSecureContext?: boolean }).isSecureContext;
});

// === Key material

describe("WalletClient: key material", () => {
  it("retains no signed XDR on the instance once sign resolves", async () => {
    const api = fakeApi();
    const client = new WalletClient({ api, networkPassphrase: PASSPHRASE });

    const signed = await client.sign(XDR_A);
    expect(signed).toBe(SIGNED_A);

    const strings = reachableStrings(client);
    expect(strings.some((s) => s.includes(SIGNED_A))).toBe(false);
    expect(strings.some((s) => s.includes("SIGNED-XDR"))).toBe(false);
    expect(JSON.stringify(client)).not.toContain(SIGNED_A);

    // The dedup record is a hash, never the transaction or the signature.
    const hash = await hashTransaction(XDR_A);
    expect(client.hasSigned(hash)).toBe(true);
    expect(strings).toContain(hash);
    expect(strings.some((s) => s.includes(XDR_A))).toBe(false);
  });

  it("clears the in-flight record so no promise keeps the signature alive", async () => {
    const api = fakeApi();
    const client = new WalletClient({ api, networkPassphrase: PASSPHRASE });
    const hash = await hashTransaction(XDR_A);

    await client.sign(XDR_A);

    expect(client.pending).toBe(0);
    expect(client.isPending(hash)).toBe(false);
  });

  it("clears the in-flight record when the signature is rejected too", async () => {
    const api = fakeApi({ sign: async () => "" });
    const client = new WalletClient({ api, networkPassphrase: PASSPHRASE });

    expect(await codeOf(client.sign(XDR_A))).toBe("SIGN_REJECTED");
    expect(client.pending).toBe(0);
    expect(reachableStrings(client).some((s) => s.includes("SIGNED-XDR"))).toBe(
      false
    );
  });

  it("never asks the extension for secret material", async () => {
    const api = fakeApi();
    const client = new WalletClient({ api, networkPassphrase: PASSPHRASE });

    await client.connect();
    await client.sign(XDR_A);

    expect(Object.keys(api).some((key) => /secret|private|seed/i.test(key))).toBe(
      false
    );
  });
});

// === Signature handling

describe("WalletClient: signature handling", () => {
  it("returns exactly what the extension returned", async () => {
    const api = fakeApi({ sign: async () => SIGNED_B });
    const client = new WalletClient({ api, networkPassphrase: PASSPHRASE });

    await expect(client.sign(XDR_A)).resolves.toBe(SIGNED_B);
    expect(api.signCalls).toEqual([XDR_A]);
  });

  it("passes the configured network passphrase to the extension", async () => {
    const api = fakeApi();
    const spy = vi.spyOn(api, "signTransaction");
    const client = new WalletClient({ api, networkPassphrase: PASSPHRASE });

    await client.sign(XDR_A);

    expect(spy).toHaveBeenCalledWith(XDR_A, { networkPassphrase: PASSPHRASE });
  });

  it("treats an empty signature as a declined prompt", async () => {
    const api = fakeApi({ sign: async () => "" });
    const client = new WalletClient({ api, networkPassphrase: PASSPHRASE });

    expect(await codeOf(client.sign(XDR_A))).toBe("SIGN_REJECTED");
  });

  it("maps extension decline wording to SIGN_REJECTED", async () => {
    const api = fakeApi({
      sign: async () => {
        throw new Error("User declined access");
      },
    });
    const client = new WalletClient({ api, networkPassphrase: PASSPHRASE });

    expect(await codeOf(client.sign(XDR_A))).toBe("SIGN_REJECTED");
  });

  it("maps a thrown string rejection to SIGN_REJECTED", async () => {
    const api = fakeApi({
      sign: async () => {
        throw "User rejected the transaction";
      },
    });
    const client = new WalletClient({ api, networkPassphrase: PASSPHRASE });

    expect(await codeOf(client.sign(XDR_A))).toBe("SIGN_REJECTED");
  });

  it("maps the same wording to CONNECTION_REJECTED during connect", async () => {
    const api = fakeApi({
      publicKey: async () => {
        throw new Error("User declined access");
      },
    });
    const client = new WalletClient({ api, networkPassphrase: PASSPHRASE });

    expect(await codeOf(client.connect())).toBe("CONNECTION_REJECTED");
  });

  it("treats an empty public key as a declined connection", async () => {
    const api = fakeApi({ publicKey: "" });
    const client = new WalletClient({ api, networkPassphrase: PASSPHRASE });

    expect(await codeOf(client.connect())).toBe("CONNECTION_REJECTED");
  });

  it("reports NOT_INSTALLED when the extension bridge cannot be loaded", async () => {
    const client = new WalletClient({
      api: () => Promise.reject(new Error("module not found")),
      networkPassphrase: PASSPHRASE,
    });

    expect(await codeOf(client.connect())).toBe("NOT_INSTALLED");
  });

  it("reports NOT_INSTALLED when the extension is absent", async () => {
    const api = fakeApi({ connected: false });
    const client = new WalletClient({ api, networkPassphrase: PASSPHRASE });

    expect(await codeOf(client.connect())).toBe("NOT_INSTALLED");
  });

  it("returns the public key on a successful connect", async () => {
    const api = fakeApi();
    const client = new WalletClient({ api, networkPassphrase: PASSPHRASE });

    await expect(client.connect()).resolves.toBe(PUBLIC_KEY);
  });
});

// === Timeouts

describe("WalletClient: timeout enforcement", () => {
  it("defaults to 30s for signing and 60s for connecting", () => {
    expect(SIGN_TIMEOUT_MS).toBe(30_000);
    expect(CONNECT_TIMEOUT_MS).toBe(60_000);
    expect(PROBE_TIMEOUT_MS).toBe(3_000);
  });

  it("treats a silent isConnected probe as NOT_INSTALLED", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });

    const api = fakeApi();
    // No extension answers the probe, so the promise never settles.
    api.isConnected = () => new Promise<boolean>(() => {});
    const client = new WalletClient({ api, networkPassphrase: PASSPHRASE });

    const result = client.connect().catch((err: unknown) => err);

    await vi.advanceTimersByTimeAsync(PROBE_TIMEOUT_MS);
    const err = await result;

    expect(err).toBeInstanceOf(WalletError);
    expect((err as WalletError).code).toBe("NOT_INSTALLED");
    expect(api.connectCalls).toBe(0);
  });

  it("rejects with TIMEOUT after the default sign timeout elapses", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });

    const gate = deferred<string>();
    const api = fakeApi({ sign: () => gate.promise });
    const client = new WalletClient({ api, networkPassphrase: PASSPHRASE });

    let settled = false;
    const result = client.sign(XDR_A).catch((err: unknown) => {
      settled = true;
      return err;
    });

    await waitFor(() => api.signCalls.length === 1);

    await vi.advanceTimersByTimeAsync(SIGN_TIMEOUT_MS - 1);
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    const err = await result;

    expect(err).toBeInstanceOf(WalletError);
    expect((err as WalletError).code).toBe("TIMEOUT");
    expect((err as WalletError).operation).toBe("sign");
    expect(client.pending).toBe(0);

    gate.resolve(SIGNED_A);
  });

  it("honours a per-client sign timeout override", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });

    const gate = deferred<string>();
    const api = fakeApi({ sign: () => gate.promise });
    const client = new WalletClient({
      api,
      networkPassphrase: PASSPHRASE,
      signTimeoutMs: 5_000,
    });

    const result = client.sign(XDR_A).catch((err: unknown) => err);
    await waitFor(() => api.signCalls.length === 1);

    await vi.advanceTimersByTimeAsync(5_000);

    expect(((await result) as WalletError).code).toBe("TIMEOUT");
    gate.resolve(SIGNED_A);
  });

  it("honours a per-request timeout override", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });

    const gate = deferred<string>();
    const api = fakeApi({ sign: () => gate.promise });
    const client = new WalletClient({
      api,
      networkPassphrase: PASSPHRASE,
      signTimeoutMs: 30_000,
    });

    const result = client.sign(XDR_A, { timeoutMs: 1_000 }).catch((e: unknown) => e);
    await waitFor(() => api.signCalls.length === 1);

    await vi.advanceTimersByTimeAsync(1_000);

    expect(((await result) as WalletError).code).toBe("TIMEOUT");
    gate.resolve(SIGNED_A);
  });

  it("swallows a late extension rejection that arrives after the timeout", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });

    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown): void => {
      unhandled.push(reason);
    };
    process.on("unhandledRejection", onUnhandled);

    try {
      const gate = deferred<string>();
      const api = fakeApi({ sign: () => gate.promise });
      const client = new WalletClient({
        api,
        networkPassphrase: PASSPHRASE,
        signTimeoutMs: 1_000,
      });

      const result = client.sign(XDR_A).catch((err: unknown) => err);
      await waitFor(() => api.signCalls.length === 1);

      await vi.advanceTimersByTimeAsync(1_000);
      expect(((await result) as WalletError).code).toBe("TIMEOUT");

      gate.reject(new Error("extension answered long after we gave up"));
      for (let i = 0; i < 10; i++) await tick();

      expect(unhandled).toEqual([]);
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
  });

  it("keeps the queue usable after a timeout", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });

    const gate = deferred<string>();
    const api = fakeApi({
      sign: (xdr: string) => (xdr === XDR_A ? gate.promise : Promise.resolve(SIGNED_B)),
    });
    const client = new WalletClient({
      api,
      networkPassphrase: PASSPHRASE,
      signTimeoutMs: 1_000,
    });

    const first = client.sign(XDR_A).catch((err: unknown) => err);
    await waitFor(() => api.signCalls.length === 1);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(((await first) as WalletError).code).toBe("TIMEOUT");

    const second = client.sign(XDR_B);
    await waitFor(() => api.signCalls.length === 2);
    await expect(second).resolves.toBe(SIGNED_B);

    gate.resolve(SIGNED_A);
  });
});

// === Concurrency

describe("WalletClient: concurrent requests", () => {
  it("serialises signatures for different transactions", async () => {
    const gate = deferred<string>();
    const api = fakeApi({
      sign: (xdr: string) => (xdr === XDR_A ? gate.promise : Promise.resolve(SIGNED_B)),
    });
    const client = new WalletClient({ api, networkPassphrase: PASSPHRASE });

    const first = client.sign(XDR_A);
    const second = client.sign(XDR_B);

    await waitFor(() => client.pending === 2);
    await waitFor(() => api.signCalls.length === 1);

    // Only one popup may be open, so the queued request must still be waiting.
    for (let i = 0; i < 10; i++) await tick();
    expect(api.signCalls).toHaveLength(1);

    gate.resolve(SIGNED_A);

    await expect(first).resolves.toBe(SIGNED_A);
    await expect(second).resolves.toBe(SIGNED_B);
    expect(api.signCalls).toHaveLength(2);
    expect(api.signCalls).toContain(XDR_A);
    expect(api.signCalls).toContain(XDR_B);
    expect(client.pending).toBe(0);
  });

  it("rejects a concurrent duplicate of the same transaction by default", async () => {
    const gate = deferred<string>();
    const api = fakeApi({ sign: () => gate.promise });
    const client = new WalletClient({ api, networkPassphrase: PASSPHRASE });

    const first = client.sign(XDR_A);
    await waitFor(() => client.pending === 1);

    expect(await codeOf(client.sign(XDR_A))).toBe("DUPLICATE_REQUEST");

    gate.resolve(SIGNED_A);
    await expect(first).resolves.toBe(SIGNED_A);
    expect(api.signCalls).toHaveLength(1);
  });

  it("shares one prompt between duplicates when onDuplicate is share", async () => {
    const gate = deferred<string>();
    const api = fakeApi({ sign: () => gate.promise });
    const client = new WalletClient({ api, networkPassphrase: PASSPHRASE });

    const first = client.sign(XDR_A, { onDuplicate: "share" });
    await waitFor(() => client.pending === 1);
    const second = client.sign(XDR_A, { onDuplicate: "share" });

    // The duplicate hashes its XDR before it can consult the in-flight map, so
    // let it reach that check while the first prompt is still open.
    for (let i = 0; i < 5; i++) await tick();

    gate.resolve(SIGNED_A);

    await expect(first).resolves.toBe(SIGNED_A);
    await expect(second).resolves.toBe(SIGNED_A);
    expect(api.signCalls).toHaveLength(1);
    expect(client.pending).toBe(0);
  });

  it("refuses to sign the same transaction twice until it is released", async () => {
    const api = fakeApi();
    const client = new WalletClient({ api, networkPassphrase: PASSPHRASE });
    const hash = await hashTransaction(XDR_A);

    await expect(client.sign(XDR_A)).resolves.toBe(SIGNED_A);
    expect(await codeOf(client.sign(XDR_A))).toBe("DUPLICATE_REQUEST");
    expect(api.signCalls).toHaveLength(1);

    client.release(hash);
    expect(client.hasSigned(hash)).toBe(false);

    await expect(client.sign(XDR_A)).resolves.toBe(SIGNED_A);
    expect(api.signCalls).toHaveLength(2);
  });

  it("reset clears every dedup record", async () => {
    const api = fakeApi();
    const client = new WalletClient({ api, networkPassphrase: PASSPHRASE });

    await client.sign(XDR_A);
    await client.sign(XDR_B);
    expect(await codeOf(client.sign(XDR_A))).toBe("DUPLICATE_REQUEST");

    client.reset();

    await expect(client.sign(XDR_A)).resolves.toBe(SIGNED_A);
    await expect(client.sign(XDR_B)).resolves.toBe(SIGNED_B);
  });

  it("release never revives an in-flight prompt into a second popup", async () => {
    const gate = deferred<string>();
    const api = fakeApi({ sign: () => gate.promise });
    const client = new WalletClient({ api, networkPassphrase: PASSPHRASE });
    const hash = await hashTransaction(XDR_A);

    const first = client.sign(XDR_A);
    await waitFor(() => client.pending === 1);

    client.release(hash);
    expect(await codeOf(client.sign(XDR_A))).toBe("DUPLICATE_REQUEST");

    gate.resolve(SIGNED_A);
    await expect(first).resolves.toBe(SIGNED_A);
    expect(api.signCalls).toHaveLength(1);
  });
});

// === Integrity

describe("WalletClient: integrity checks", () => {
  it("refuses to sign on an insecure origin", async () => {
    (globalThis as { isSecureContext?: boolean }).isSecureContext = false;

    const api = fakeApi();
    const client = new WalletClient({ api, networkPassphrase: PASSPHRASE });

    expect(await codeOf(client.sign(XDR_A))).toBe("INTEGRITY_ERROR");
    expect(api.signCalls).toHaveLength(0);
  });

  it("signs normally on a secure origin", async () => {
    (globalThis as { isSecureContext?: boolean }).isSecureContext = true;

    const api = fakeApi();
    const client = new WalletClient({ api, networkPassphrase: PASSPHRASE });

    await expect(client.sign(XDR_A)).resolves.toBe(SIGNED_A);
  });

  it("refuses to sign after an API method is swapped out", async () => {
    const api = fakeApi();
    const client = new WalletClient({ api, networkPassphrase: PASSPHRASE });

    await expect(client.sign(XDR_A)).resolves.toBe(SIGNED_A);

    const impostor = vi.fn(async () => "SIGNED-BY-IMPOSTOR");
    api.signTransaction = impostor;

    expect(await codeOf(client.sign(XDR_B))).toBe("INTEGRITY_ERROR");
    expect(impostor).not.toHaveBeenCalled();
  });

  it("reports a missing method as an unavailable API", async () => {
    const api = fakeApi();
    const client = new WalletClient({ api, networkPassphrase: PASSPHRASE });

    delete (api as Partial<FreighterApi>).getPublicKey;

    const report = await client.checkIntegrity();
    expect(report.ok).toBe(false);
    expect(report.apiAvailable).toBe(false);
    expect(await codeOf(client.sign(XDR_A))).toBe("INTEGRITY_ERROR");
  });

  it("refuses to sign when the wallet is on another network", async () => {
    const api = fakeApi({ networkPassphrase: OTHER_PASSPHRASE });
    const client = new WalletClient({ api, networkPassphrase: PASSPHRASE });

    expect(await codeOf(client.sign(XDR_A))).toBe("NETWORK_MISMATCH");
    expect(api.signCalls).toHaveLength(0);
  });

  it("signs when the wallet cannot report its network", async () => {
    const api = fakeApi({ networkPassphrase: undefined });
    const client = new WalletClient({ api, networkPassphrase: PASSPHRASE });

    const report = await client.checkIntegrity();
    expect(report.networkMatches).toBeNull();
    await expect(client.sign(XDR_A)).resolves.toBe(SIGNED_A);
  });

  it("reports a clean bill of health for a well behaved extension", async () => {
    const api = fakeApi();
    const client = new WalletClient({ api, networkPassphrase: PASSPHRASE });

    const report = await client.checkIntegrity();

    expect(report).toMatchObject({
      ok: true,
      secureContext: true,
      apiAvailable: true,
      apiIntact: true,
      networkMatches: true,
    });
    expect(report.issues).toEqual([]);
  });
});

// === Transaction hashing

describe("hashTransaction", () => {
  it("is stable for the same input", async () => {
    const first = await hashTransaction(XDR_A);
    const second = await hashTransaction(XDR_A);

    expect(first).toBe(second);
    expect(first).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is distinct for different inputs", async () => {
    const a = await hashTransaction(XDR_A);
    const b = await hashTransaction(XDR_B);
    const nearly = await hashTransaction(`${XDR_A} `);

    expect(a).not.toBe(b);
    expect(a).not.toBe(nearly);
  });

  it("never echoes the transaction back inside the key", async () => {
    const hash = await hashTransaction(XDR_A);
    expect(hash).not.toContain(XDR_A);
  });
});
