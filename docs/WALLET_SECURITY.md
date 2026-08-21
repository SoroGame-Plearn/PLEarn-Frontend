# Wallet integration security

PLEarn signs Stellar transactions with [Freighter](https://www.freighter.app/),
a browser extension that holds the user's keys. This document states what the
frontend guarantees, what it deliberately does not, and what an operator has to
provide for those guarantees to hold.

The rules described here live in `src/lib/wallet.ts` (transport and policy),
`src/lib/wallet-error.ts` (error taxonomy), and are covered by
`src/lib/wallet.test.ts`.

- [Threat model and trust boundaries](#threat-model-and-trust-boundaries)
- [What the frontend guarantees](#what-the-frontend-guarantees)
- [What the frontend does not do](#what-the-frontend-does-not-do)
- [Timeout policy](#timeout-policy)
- [Deduplication](#deduplication)
- [Request serialisation](#request-serialisation)
- [Integrity checks](#integrity-checks)
- [Error taxonomy](#error-taxonomy)
- [Residual risks and operator responsibilities](#residual-risks-and-operator-responsibilities)

---

## Threat model and trust boundaries

Four parties touch a signature. Each sits behind a boundary the others cannot
cross.

| Party | Trusted with | Not trusted with |
|-------|--------------|------------------|
| **Freighter extension** | Secret keys, the signing prompt, the user's approval decision | Nothing the app depends on for correctness beyond a signed XDR it returns |
| **Page origin (this app)** | Building the transaction, showing what is being signed, submitting the result | Any secret material at all |
| **Backend** | Validating submissions, broadcasting transactions, reward accounting | Signing on the user's behalf |
| **User** | Reading the Freighter prompt and approving or declining it | Not applicable |

The adversaries this design takes seriously:

- **A hostile or buggy extension surface.** Another extension, or a script
  injected into the page, can replace `window.freighterApi` methods after load
  and try to capture a transaction or return a substituted one.
- **A downgraded origin.** The page served over plain HTTP, where an on-path
  attacker can rewrite the transaction before the user ever sees the prompt.
- **A wrong-network wallet.** The user's wallet pointed at mainnet while the
  app builds testnet transactions, or the reverse, which risks a real-value
  transaction being signed by mistake.
- **Duplicate submissions.** A double-clicked button, a retried request, or a
  reconnect producing two signatures of the same transaction.
- **A hung prompt.** A dismissed or crashed extension window that leaves the UI
  waiting forever and the user unable to retry.

Explicitly out of scope: a compromised Freighter build, a compromised browser,
and malware on the user's machine. Any of those already owns the keys, and no
amount of page-side checking recovers from it.

---

## What the frontend guarantees

- Every wallet call is bounded by a timeout, so no prompt can hang the UI.
- Only one extension prompt is open at a time; concurrent callers queue.
- The same transaction is never sent for signature twice, whether the second
  attempt arrives while the first is open or after it has been signed.
- No signature is requested from an insecure origin, from an extension API
  whose methods changed after page load, or from a wallet reporting a different
  network passphrase than the app builds for.
- A signed XDR is handed to the caller and is not stored in module state. The
  dedup bookkeeping keeps hashes only.
- Extension error strings are never rendered raw. Every failure is normalised
  into a `WalletError` with a stable `code`, and the UI copy is keyed by that
  code (`WALLET_ERROR_COPY`).

---

## What the frontend does not do

- **It never sees, handles, requests, or stores a private key or seed phrase.**
  Freighter holds the key material and returns only a signed XDR. There is no
  code path in this app that could ask for a secret, and the `FreighterApi`
  interface in `src/lib/wallet.ts` deliberately declares only
  `isConnected`, `getPublicKey`, `signTransaction`, and `getNetworkDetails`.
- **It does not zero memory.** JavaScript strings are immutable, so "clearing"
  a signed XDR is not a thing the language allows. What the client does instead
  is drop references promptly: the in-flight map entry is deleted in a `finally`
  block the moment a request settles, so the only place a signature lives is the
  caller's own stack frame until the garbage collector reclaims it. Treat this
  as reducing lifetime, not as guaranteeing erasure.
- **It does not verify the contents of the signed XDR.** The client returns
  what the extension returned. Validation that the signed transaction is the one
  the user was shown is the backend's job at submit time.
- **It does not authenticate the user.** A public key is an identifier, not a
  credential. Anything that needs proof of control must be a challenge signed
  and verified server-side.
- **It does not defend against a compromised extension.** The integrity checks
  detect a swapped API surface on the page, not a malicious Freighter build.

---

## Timeout policy

| Operation | Constant | Default |
|-----------|----------|---------|
| Signature prompt | `SIGN_TIMEOUT_MS` | 30 seconds |
| Connection prompt | `CONNECT_TIMEOUT_MS` | 60 seconds |
| Non interactive probe | `PROBE_TIMEOUT_MS` | 3 seconds |

Connecting gets the longer budget because it can include installing, unlocking,
and picking an account, while signing is a single approve or decline.

Calls that need no user interaction (`isConnected`, `getNetworkDetails`) are
held to the short probe budget instead. Freighter answers them over a page
message channel, so silence means no extension is listening. A probe that times
out during `connect()` is reported as `NOT_INSTALLED` rather than `TIMEOUT`,
which is both the accurate diagnosis and the difference between a 3 second
answer and a minute of spinner.

A timeout rejects the caller with `code: "TIMEOUT"`. The underlying extension
promise is left pending with a no-op catch attached: the popup may still be
open, and its eventual answer must not surface as an unhandled rejection after
the app has stopped waiting. A timed-out transaction is not recorded as signed,
so the user can retry it immediately.

Per-request overrides are available through `sign(xdr, { timeoutMs })` for flows
that legitimately need longer, and the whole client can be constructed with
different budgets for tests.

---

## Deduplication

Every transaction is keyed by the **SHA-256 hash of its XDR**, computed through
`crypto.subtle`. Two states are tracked per key:

- **In flight.** A prompt is currently open for this transaction. A second
  request rejects with `DUPLICATE_REQUEST` by default. Callers that legitimately
  want to join the existing prompt rather than open a second one pass
  `{ onDuplicate: "share" }` and receive the same result from a single
  extension call.
- **Signed.** A signature was already produced this session. Re-signing rejects
  with `DUPLICATE_REQUEST` until `release(hash)` clears that one entry or
  `reset()` clears them all, which is what a recovery flow does when a
  submission failed downstream and genuinely needs a new signature.

Two properties matter here. The key is a hash, so the dedup cache holds neither
the transaction nor the signature. And `release()` only ever clears the signed
set, never an in-flight entry, so it cannot be used to force a second popup for
a transaction that is already awaiting approval.

On origins without `crypto.subtle` the client falls back to an FNV-1a hash.
That is a collision-resistance downgrade and is used purely as a cache key.
Signing is refused on those origins anyway, because they are not secure
contexts.

---

## Request serialisation

Freighter renders one popup at a time. Overlapping requests would leave the
extra prompts silently dropped, so the client chains every operation onto a
single queue: a request starts only after the previous one has settled, success
or failure alike. The queue itself never rejects, so one declined signature does
not poison every request behind it.

The visible consequence is that a second signature request waits for the first
prompt to be answered, rather than racing it.

---

## Integrity checks

`checkIntegrity()` runs before every signature and reports four facts.

| Check | Question | On failure |
|-------|----------|------------|
| Secure context | Is `globalThis.isSecureContext` true, meaning HTTPS or localhost? | `INTEGRITY_ERROR` |
| API available | Are `isConnected`, `getPublicKey`, and `signTransaction` all present and callable? | `INTEGRITY_ERROR` |
| API intact | Are those methods still the exact function references captured on first use? | `INTEGRITY_ERROR` |
| Network match | Does the wallet's reported `networkPassphrase` equal the app's? | `NETWORK_MISMATCH` |

The intact check is the interesting one: the client snapshots the API surface
the first time it resolves it and compares references on every later call. A
script or a second wallet extension that swaps `signTransaction` after page load
fails this check, and no transaction is handed to the replacement.

The network check is advisory in one direction only. A wallet that cannot report
its network at all (older builds have no `getNetworkDetails`) yields
`networkMatches: null` and is allowed to sign, because the mismatch would then
surface as a rejected submission on the backend. A wallet that reports a
*different* passphrase is refused outright.

---

## Error taxonomy

Branch on `WalletError.code`. Never parse the message: Freighter rejects with
plain strings whose wording changes between releases, which is why
`toWalletError` matches loosely on intent rather than on exact text.

| Code | Cause | Recovery offered to the user |
|------|-------|------------------------------|
| `NOT_INSTALLED` | No extension bridge on the page, or `isConnected` reported false | Install Freighter, reload, retry |
| `NOT_CONNECTED` | An action needed a wallet before one was connected | Connect the wallet, then retry |
| `CONNECTION_REJECTED` | User declined the connection prompt, or dismissed it and Freighter returned an empty public key | Retry and approve in the extension |
| `SIGN_REJECTED` | User declined the signature prompt, or dismissed it and Freighter returned an empty XDR | Retry; nothing was submitted |
| `TIMEOUT` | No answer within the sign or connect budget | Check the extension window, then retry |
| `DUPLICATE_REQUEST` | The same transaction is already awaiting signature, or was already signed this session | Wait for the open prompt, or start a fresh transaction |
| `NETWORK_MISMATCH` | Wallet passphrase differs from the app's network | Switch networks in Freighter, then retry |
| `INTEGRITY_ERROR` | Insecure origin, missing API methods, or an API surface swapped after load | Reload over HTTPS, disable conflicting extensions |
| `UNKNOWN` | Anything unrecognised from the extension | Generic retry |

`isRecoverable(error)` marks the codes a user can clear without reloading the
page. `NOT_INSTALLED` and `INTEGRITY_ERROR` are excluded: both need a change to
the browser or the page itself before a retry could succeed.

---

## Residual risks and operator responsibilities

The page-side rules above only hold if the deployment supports them.
`next.config.js` ships a baseline set of headers for every route
(`X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`,
`Referrer-Policy`, `Permissions-Policy`, and HSTS), because anything that can
frame or inject into this origin can also reach the injected wallet bridge.
`src/middleware.ts` adds a per-request nonce based Content-Security-Policy on
top: `script-src` accepts only that request's nonce plus `strict-dynamic`, and
`connect-src` is derived from `NEXT_PUBLIC_BACKEND_URL` and
`NEXT_PUBLIC_WS_URL`, so a deployment that talks to other origins has to name
them there. Two consequences worth knowing: the root layout reads the nonce
through `headers()`, which makes every route dynamically rendered, and the
inline theme script in `src/app/layout.tsx` carries the nonce explicitly.
Freighter is unaffected, since scripts injected by a browser extension are
exempt from the page policy.

- **Serve over HTTPS, everywhere.** On an insecure origin the client refuses to
  sign, so an HTTP deployment does not degrade quietly, it stops working. HSTS
  keeps a downgrade from being offered in the first place.
- **Keep the Content-Security-Policy strict.** The integrity snapshot detects a
  method swapped after page load; it cannot detect a hostile script that ran
  before the first API resolution. The nonce policy in `src/middleware.ts` is
  what keeps that script off the page, so review any addition to it,
  particularly anything that would reintroduce `unsafe-inline` or a wildcard
  script source. `style-src` still allows `unsafe-inline`, because Next and
  Tailwind inject style tags at runtime and styles cannot reach the wallet.
- **Pin `@stellar/freighter-api`.** The dependency is imported lazily, but a
  compromised release still executes in the page's origin. Pin the exact
  version, review lockfile changes to it, and treat a bump as a security
  review rather than a routine upgrade.
- **Validate server-side.** The frontend cannot tell whether the signed XDR
  matches what the user was shown. The backend must re-derive the expected
  transaction, verify the signature against the claimed account, and reject
  anything else.
- **Rate-limit submissions.** Hash deduplication is per client instance and per
  session. A page reload clears it, so the backend needs its own replay
  protection.
- **Accept what stays out of reach.** A compromised extension, browser, or
  operating system defeats every check here. So does a user approving a prompt
  they did not read, which is why the transaction summary shown before signing
  matters as much as any of the code described above.
