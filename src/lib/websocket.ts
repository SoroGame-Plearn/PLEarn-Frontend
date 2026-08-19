import { getActivity } from "./api";
import {
  WsServerMessageSchema,
  type RealtimeSubmission,
  type WsClientMessage,
} from "./schemas";

/**
 * Real-time connection manager for submission status updates.
 *
 * The app talks to the backend over a WebSocket (see `docs/WEBSOCKET.md` for
 * the event schema). This manager owns a single connection per wallet address
 * and exposes it as a tiny typed event emitter:
 *
 *   - `status`      — transport health (`ConnectionStatus`)
 *   - `mode`        — which transport is active (`"ws"` or `"polling"`)
 *   - `submission`  — a parsed, deduplicated `RealtimeSubmission`
 *   - `error`       — transport-level failures
 *
 * Design notes:
 *   - Reconnects automatically with exponential backoff up to `maxRetries`.
 *   - Deduplicates replayed/duplicated updates so consumers never see the same
 *     status twice.
 *   - Sends a heartbeat ping and force-closes stale links so a dead connection
 *     (e.g. airplane mode) is detected without waiting for a close event.
 *   - Falls back to polling `GET /activity` when WebSocket is unavailable or
 *     keeps failing, so users still get updates (with more latency).
 *   - The exported `realtimeConnection` singleton lives at module scope and
 *     therefore survives client-side page navigation without disconnecting.
 */

export type RealtimeMode = "ws" | "polling";

export type ConnectionStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected"
  | "error";

export interface RealtimeOptions {
  /** Backend base URL — the WS URL is derived from it unless `wsUrl` is set. */
  backendUrl?: string;
  /** Explicit WebSocket URL; overrides derivation from `backendUrl`. */
  wsUrl?: string;
  /** First reconnect delay in ms (doubles each attempt). Default 500. */
  baseDelayMs?: number;
  /** Upper bound for the backoff delay in ms. Default 15000. */
  maxDelayMs?: number;
  /** Consecutive failed attempts before giving up. Default 5. */
  maxRetries?: number;
  /** Polling interval in ms when degraded to polling. Default 5000. */
  pollIntervalMs?: number;
  /** Heartbeat interval in ms; 0 disables the heartbeat. Default 30000. */
  heartbeatMs?: number;
}

export interface RealtimeEvents {
  status: ConnectionStatus;
  mode: RealtimeMode;
  submission: RealtimeSubmission;
  error: Error;
}

type Listener<T> = (payload: T) => void;

// WebSocket.readyState numeric values — kept local so tests can stub the
// global WebSocket with a minimal mock that doesn't define the statics.
const CONNECTING = 0;
const OPEN = 1;

const DEFAULT_BASE_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:3001";

const DEFAULT_WS_URL = process.env.NEXT_PUBLIC_WS_URL;

const DEFAULT_OPTIONS: Required<Omit<RealtimeOptions, "backendUrl" | "wsUrl">> = {
  baseDelayMs: 500,
  maxDelayMs: 15_000,
  maxRetries: 5,
  pollIntervalMs: 5_000,
  heartbeatMs: 30_000,
};

/** Options after applying defaults — URL overrides stay optional. */
type ResolvedRealtimeOptions = Required<
  Omit<RealtimeOptions, "backendUrl" | "wsUrl">
> &
  Pick<RealtimeOptions, "backendUrl" | "wsUrl">;

/** Derive the WebSocket URL from the backend URL by swapping the protocol. */
function deriveWsUrl(backendUrl: string): string {
  const url = new URL(backendUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}

/**
 * Bounded set of seen message keys. Used to drop replayed or duplicated
 * status updates; oldest entries are evicted once the cap is reached.
 */
class DedupStore {
  private readonly keys = new Map<string, true>();
  private readonly max: number;

  constructor(max = 500) {
    this.max = max;
  }

  has(key: string): boolean {
    return this.keys.has(key);
  }

  add(key: string): void {
    this.keys.set(key, true);
    if (this.keys.size > this.max) {
      const oldest = this.keys.keys().next().value;
      if (oldest !== undefined) this.keys.delete(oldest);
    }
  }
}

export class RealtimeConnection {
  private ws: WebSocket | null = null;
  private address: string | null = null;
  private status: ConnectionStatus = "idle";
  private mode: RealtimeMode = "ws";
  private retries = 0;
  private intentionallyClosed = false;
  private lastMessageAt = 0;

  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  private readonly dedup = new DedupStore();
  private readonly listeners = new Map<
    keyof RealtimeEvents,
    Set<(payload: unknown) => void>
  >();
  private readonly opts: ResolvedRealtimeOptions;

  constructor(options: RealtimeOptions = {}) {
    this.opts = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Open (or re-open) the realtime feed for `address`. Idempotent when the
   * address is unchanged and the connection is already healthy.
   */
  connect(address: string): void {
    if (this.address === address && this.status === "connected") return;

    const addressChanged = this.address !== address;
    this.address = address;
    this.intentionallyClosed = false;
    this.retries = 0;

    // A different account means a different subscription — drop the old socket.
    if (addressChanged && this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }

    if (this.mode === "polling") {
      this.startPolling();
      return;
    }
    this.open();
  }

  /** Tear the connection down. No reconnect is attempted afterwards. */
  disconnect(): void {
    this.intentionallyClosed = true;
    this.address = null;
    this.clearTimers();
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
    this.stopPolling();
    this.setStatus("disconnected");
  }

  getStatus(): ConnectionStatus {
    return this.status;
  }

  getMode(): RealtimeMode {
    return this.mode;
  }

  /** Subscribe to an event. Returns an unsubscribe function (call it on cleanup). */
  on<K extends keyof RealtimeEvents>(
    event: K,
    listener: Listener<RealtimeEvents[K]>
  ): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    const wrapped = listener as (payload: unknown) => void;
    set.add(wrapped);
    return () => {
      set.delete(wrapped);
    };
  }

  // ─── Transport ─────────────────────────────────────────────────────────────

  private get url(): string {
    const explicit = this.opts.wsUrl ?? DEFAULT_WS_URL;
    if (explicit) return explicit;
    return deriveWsUrl(this.opts.backendUrl ?? DEFAULT_BASE_URL);
  }

  private open(): void {
    const existing = this.ws;
    if (existing && (existing.readyState === CONNECTING || existing.readyState === OPEN)) {
      return;
    }

    this.setStatus(this.retries === 0 ? "connecting" : "reconnecting");

    let ws: WebSocket;
    try {
      ws = new WebSocket(this.url);
    } catch (err) {
      // WebSocket unsupported or the URL is unusable — degrade to polling.
      this.emit(
        "error",
        new Error(
          `WebSocket unavailable (${err instanceof Error ? err.message : String(err)}) — falling back to polling.`
        )
      );
      this.setMode("polling");
      this.startPolling();
      return;
    }

    this.ws = ws;
    ws.onopen = () => this.handleOpen();
    ws.onmessage = (ev: MessageEvent) => this.handleMessage(ev);
    ws.onclose = () => this.handleClose();
    ws.onerror = () => {
      this.emit("error", new Error("WebSocket connection error."));
    };
  }

  private handleOpen(): void {
    this.retries = 0;
    this.lastMessageAt = Date.now();
    this.setStatus("connected");
    this.sendSubscribe();
    this.startHeartbeat();
  }

  private handleClose(): void {
    this.stopHeartbeat();
    this.ws = null;

    if (this.intentionallyClosed || !this.address) return;

    if (this.retries >= this.opts.maxRetries) {
      this.setStatus("error");
      this.emit(
        "error",
        new Error(
          `WebSocket connection failed after ${this.opts.maxRetries} reconnect attempts — switching to polling.`
        )
      );
      this.setMode("polling");
      this.startPolling();
      return;
    }

    this.retries += 1;
    // Exponential backoff: baseDelay, 2×, 4×, … capped at maxDelayMs.
    const delay = Math.min(
      this.opts.maxDelayMs,
      this.opts.baseDelayMs * 2 ** (this.retries - 1)
    );
    this.setStatus("reconnecting");
    this.scheduleReconnect(delay);
  }

  private scheduleReconnect(delay: number): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.intentionallyClosed || !this.address) return;
      this.open();
    }, delay);
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    if (this.opts.heartbeatMs <= 0) return;

    this.heartbeatTimer = setInterval(() => {
      const ws = this.ws;
      if (!ws || ws.readyState !== OPEN) return;
      // No inbound traffic (ping, pong, or update) for 2 intervals means the
      // link is dead — force a close so handleClose() kicks off reconnection.
      if (Date.now() - this.lastMessageAt > this.opts.heartbeatMs * 2) {
        ws.close();
        return;
      }
      this.send({ type: "ping" });
    }, this.opts.heartbeatMs);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
  }

  // ─── Messages ──────────────────────────────────────────────────────────────

  private handleMessage(ev: MessageEvent): void {
    this.lastMessageAt = Date.now();

    let raw: unknown;
    try {
      raw = JSON.parse(String(ev.data));
    } catch {
      return; // Not JSON — ignore silently.
    }

    const parsed = WsServerMessageSchema.safeParse(raw);
    if (!parsed.success) {
      this.emit("error", new Error("Received an invalid message from the realtime server."));
      return;
    }

    const msg = parsed.data;
    if (msg.type === "submission.update") {
      const key = msg.eventId ?? `${msg.data.submissionId}:${msg.data.status}`;
      if (this.dedup.has(key)) return;
      this.dedup.add(key);
      this.emit("submission", msg.data);
    } else if (msg.type === "error") {
      this.emit("error", new Error(msg.message));
    }
    // "pong" needs no explicit handling — lastMessageAt was already refreshed.
  }

  private send(message: WsClientMessage): void {
    const ws = this.ws;
    if (ws && ws.readyState === OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  private sendSubscribe(): void {
    if (this.address) this.send({ type: "subscribe", address: this.address });
  }

  // ─── Polling fallback ──────────────────────────────────────────────────────

  private startPolling(): void {
    this.setMode("polling");
    this.stopPolling();
    // Keep an explicit error status sticky so the UI can show that realtime
    // degraded — polling still emits updates underneath.
    if (this.status !== "error") this.setStatus("connected");
    this.poll();
    this.pollTimer = setInterval(() => this.poll(), this.opts.pollIntervalMs);
  }

  private stopPolling(): void {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = null;
  }

  /** Best-effort fallback: derive submission updates from GET /activity. */
  private async poll(): Promise<void> {
    if (!this.address || this.intentionallyClosed) return;

    try {
      const page = await getActivity({
        address: this.address,
        type: "submit",
        limit: 5,
      });

      for (const item of page.items) {
        const status =
          item.status === "confirmed"
            ? item.reward > 0
              ? "rewarded"
              : "accepted"
            : item.status === "failed"
              ? "rejected"
              : "pending";

        const key = `poll:${item.id}:${item.status}`;
        if (this.dedup.has(key)) continue;
        this.dedup.add(key);

        this.emit("submission", {
          submissionId: item.id,
          challengeId: item.challengeId ?? "",
          status,
          txHash: item.txHash,
          reward: item.reward,
          timestamp: item.timestamp,
        });
      }
    } catch (err) {
      this.emit(
        "error",
        err instanceof Error ? err : new Error("Realtime polling failed.")
      );
    }
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private clearTimers(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.stopHeartbeat();
  }

  private setStatus(status: ConnectionStatus): void {
    if (this.status === status) return;
    this.status = status;
    this.emit("status", status);
  }

  private setMode(mode: RealtimeMode): void {
    if (this.mode === mode) return;
    this.mode = mode;
    this.emit("mode", mode);
  }

  private emit<K extends keyof RealtimeEvents>(
    event: K,
    payload: RealtimeEvents[K]
  ): void {
    this.listeners.get(event)?.forEach((listener) => {
      try {
        (listener as Listener<RealtimeEvents[K]>)(payload);
      } catch {
        // A throwing listener must not break the connection or other listeners.
      }
    });
  }
}

/**
 * App-wide singleton. Module scope means it survives client-side page
 * navigation, so the socket stays open as users move between routes.
 */
export const realtimeConnection = new RealtimeConnection();
