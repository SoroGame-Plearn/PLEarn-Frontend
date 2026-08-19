# Real-time submission status (WebSocket)

The frontend opens a WebSocket to the backend so submission status changes
(`pending → validating → accepted → rewarded`) appear instantly instead of
requiring a refresh or manual polling. This document defines the wire
contract for **backend developers** and how the frontend behaves around it.

- [Endpoint](#endpoint)
- [Connection lifecycle](#connection-lifecycle)
- [Client → server messages](#client--server-messages)
- [Server → client messages](#server--client-messages)
- [Message deduplication](#message-deduplication)
- [Reconnection & backoff](#reconnection--backoff)
- [Polling fallback](#polling-fallback)
- [Implementation notes](#implementation-notes)

---

## Endpoint

The frontend connects to `NEXT_PUBLIC_WS_URL` when set, otherwise it derives
the URL from `NEXT_PUBLIC_BACKEND_URL` by swapping `http(s)://` for
`ws(s)://` (the path is preserved). Example:

```bash
NEXT_PUBLIC_BACKEND_URL=http://localhost:3001
NEXT_PUBLIC_WS_URL=ws://localhost:3001/ws
```

The backend should accept WebSocket upgrades at this endpoint (e.g. `ws://localhost:3001/ws`).

---

## Connection lifecycle

1. When the user connects their wallet, the frontend opens the socket and
   immediately sends a `subscribe` message with the wallet address.
2. The backend pushes a `submission.update` message each time a submission's
   status changes for that address.
3. The frontend sends a `ping` every 30s; the backend replies with `pong`.
4. If the socket drops, the frontend reconnects automatically with
   exponential backoff (see below) and re-subscribes on open.
5. When the user disconnects their wallet, the frontend closes the socket.

The connection is owned by a module-scope manager
(`src/lib/websocket.ts`) and survives client-side page navigation.

---

## Client → server messages

```jsonc
// Sent immediately after the socket opens, and again after every reconnect.
{ "type": "subscribe", "address": "GADDR...PUBLICKEY" }

// Sent every 30 seconds while connected (heartbeat).
{ "type": "ping" }
```

---

## Server → client messages

### `submission.update`

```jsonc
{
  "type": "submission.update",
  // Optional server-assigned id used by the client to drop replays.
  "eventId": "evt_01",
  "data": {
    "submissionId": "sub_123",        // matches POST /submit response id
    "challengeId": "ch_1",
    "status": "validating",           // pending | validating | accepted | rewarded | rejected
    "txHash": "abc123...",            // optional — set once broadcast
    "reward": 25,                     // optional — set once distributed
    "timestamp": "2026-07-15T10:00:00Z" // ISO-8601 with offset
  }
}
```

**Status semantics** (the client renders these as a stepper):

| Status      | Meaning                                            |
|-------------|----------------------------------------------------|
| `pending`   | Received by the backend, waiting in the queue      |
| `validating`| Solution is being checked against the challenge    |
| `accepted`  | Validation passed, transaction broadcast on-chain  |
| `rewarded`  | Reward tokens distributed (terminal success)       |
| `rejected`  | Validation failed (terminal failure)               |

> **Guidance:** emit an update on **every** transition, including repeats of
> the same status (e.g. retrying validation). The client deduplicates, so
> over-emitting is safe — under-emitting (skipping `validating`, for example)
> just means the user sees fewer intermediate steps.

### `pong`

```jsonc
{ "type": "pong" }
```

Replies to the client's heartbeat ping. Any inbound message (including an
update) also counts as proof of life, so a busy backend doesn't strictly need
to send `pong`.

### `error`

```jsonc
{ "type": "error", "message": "human readable description" }
```

Used for protocol-level failures (e.g. an unknown subscription address).

---

## Message deduplication

The client drops updates it has already seen. Dedup keys are, in order:

1. `eventId` when the server provides one — use this if you want to guard
   against at-least-once delivery at the source;
2. otherwise `submissionId:status` — a repeated status for the same submission
   is ignored, but a **new** status always goes through.

This is why re-sending the current status is safe: it's the natural way to
resync after a reconnect.

---

## Reconnection & backoff

- Reconnect delays are exponential: `500ms`, `1s`, `2s`, `4s`, … capped at
  `15s` (configurable via `baseDelayMs` / `maxDelayMs`).
- After **5 consecutive failed attempts** (`maxRetries`) the connection is
  marked `error` and the frontend degrades to polling (below).
- A successful open resets the attempt counter.
- The heartbeat force-closes a socket that hasn't received anything for two
  intervals, so dead links (airplane mode, closed laptop) are detected
  without waiting for a browser close event.

---

## Polling fallback

If `WebSocket` is unavailable (old browser / unsupported environment) or keeps
failing, the frontend falls back to polling `GET /activity?address=…&type=submit&limit=5`
every 5 seconds and maps the records to submission updates:

| Activity status | Submission status |
|-----------------|-------------------|
| `pending`       | `pending`         |
| `confirmed` + reward > 0 | `rewarded` |
| `confirmed` + reward = 0 | `accepted` |
| `failed`        | `rejected`        |

The UI shows a "Polling updates" indicator when this mode is active.

---

## Implementation notes

- All message shapes are validated client-side with Zod in
  `src/lib/schemas.ts` (`WsClientMessageSchema`, `WsServerMessageSchema`) —
  the types in `src/types` are inferred from them. If you change the wire
  contract, update those schemas and the tests in `src/lib/websocket.test.ts`.
- Integration tests use a mocked `WebSocket` and cover subscribe, dedup,
  backoff, max-retry degradation, and the polling fallback.
