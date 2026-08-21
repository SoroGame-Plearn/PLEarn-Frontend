import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RealtimeConnection } from "./websocket";
import type { WsServerMessage } from "./schemas";

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

/** Minimal WebSocket stand-in with the parts RealtimeConnection uses. */
class MockWebSocket {
  static instances: MockWebSocket[] = [];
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  readyState: number = MockWebSocket.CONNECTING;
  url: string;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.();
  }

  /** Simulate the server accepting the connection. */
  open(): void {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.();
  }

  /** Simulate the server pushing a JSON message. */
  receive(payload: unknown): void {
    this.onmessage?.({ data: JSON.stringify(payload) });
  }
}

function submissionMessage(overrides: Record<string, unknown> = {}): WsServerMessage {
  return {
    type: "submission.update",
    data: {
      submissionId: "sub_1",
      challengeId: "c1",
      status: "pending",
      timestamp: "2026-07-15T10:00:00Z",
      ...overrides,
    },
  } as WsServerMessage;
}

const ACTIVITY_ITEM = {
  id: "sub_1",
  txHash: "tx_hash_1",
  timestamp: "2026-07-15T10:00:00Z",
  type: "submit",
  status: "confirmed",
  reward: 10,
  challengeId: "c1",
  challengeTitle: "Reverse a string",
  address: "GADDR",
};

beforeEach(() => {
  MockWebSocket.instances = [];
  vi.stubGlobal("WebSocket", MockWebSocket);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("RealtimeConnection — connection lifecycle", () => {
  it("connects, subscribes with the wallet address, and reports status", () => {
    const conn = new RealtimeConnection({ heartbeatMs: 0 });
    const statuses: string[] = [];
    conn.on("status", (s) => statuses.push(s));

    conn.connect("GADDR");

    expect(MockWebSocket.instances).toHaveLength(1);
    expect(conn.getStatus()).toBe("connecting");
    expect(statuses).toContain("connecting");

    MockWebSocket.instances[0].open();

    expect(conn.getStatus()).toBe("connected");
    expect(statuses).toContain("connected");
    expect(MockWebSocket.instances[0].sent).toContain(
      JSON.stringify({ type: "subscribe", address: "GADDR" })
    );
  });

  it("derives the ws:// URL from the backend URL", () => {
    const conn = new RealtimeConnection({ backendUrl: "http://api.example.com:4000" });
    conn.connect("GADDR");
    expect(MockWebSocket.instances[0].url).toBe("ws://api.example.com:4000/");
  });

  it("prefers an explicit wsUrl", () => {
    const conn = new RealtimeConnection({ wsUrl: "wss://rt.example.com/ws" });
    conn.connect("GADDR");
    expect(MockWebSocket.instances[0].url).toBe("wss://rt.example.com/ws");
  });

  it("re-subscribes when the wallet address changes", () => {
    const conn = new RealtimeConnection({ heartbeatMs: 0 });
    conn.connect("GADDR_A");
    const ws1 = MockWebSocket.instances[0];
    ws1.open();

    conn.connect("GADDR_B");

    expect(MockWebSocket.instances).toHaveLength(2);
    expect(ws1.readyState).toBe(MockWebSocket.CLOSED);
    const ws2 = MockWebSocket.instances[1];
    ws2.open();
    expect(ws2.sent).toContain(
      JSON.stringify({ type: "subscribe", address: "GADDR_B" })
    );
  });

  it("is idempotent when reconnecting to the same healthy address", () => {
    const conn = new RealtimeConnection({ heartbeatMs: 0 });
    conn.connect("GADDR");
    MockWebSocket.instances[0].open();
    conn.connect("GADDR");
    expect(MockWebSocket.instances).toHaveLength(1);
  });

  it("unsubscribes cleanly (no leaked listeners)", () => {
    const conn = new RealtimeConnection({ heartbeatMs: 0 });
    const received: string[] = [];
    const off = conn.on("submission", (s) => received.push(s.status));

    conn.connect("GADDR");
    const ws = MockWebSocket.instances[0];
    ws.open();
    ws.receive(submissionMessage({ status: "validating" }));

    off();
    ws.receive(submissionMessage({ status: "accepted" }));

    expect(received).toEqual(["validating"]);
  });
});

describe("RealtimeConnection — message handling", () => {
  it("emits parsed submission updates", () => {
    const conn = new RealtimeConnection({ heartbeatMs: 0 });
    const received: unknown[] = [];
    conn.on("submission", (s) => received.push(s));

    conn.connect("GADDR");
    const ws = MockWebSocket.instances[0];
    ws.open();
    ws.receive(
      submissionMessage({
        status: "accepted",
        txHash: "tx123",
        reward: 25,
      })
    );

    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({
      submissionId: "sub_1",
      challengeId: "c1",
      status: "accepted",
      txHash: "tx123",
      reward: 25,
    });
  });

  it("deduplicates repeated updates (by eventId and by submissionId+status)", () => {
    const conn = new RealtimeConnection({ heartbeatMs: 0 });
    const received: string[] = [];
    conn.on("submission", (s) => received.push(`${s.submissionId}:${s.status}`));

    conn.connect("GADDR");
    const ws = MockWebSocket.instances[0];
    ws.open();

    ws.receive(submissionMessage({ eventId: "e1", status: "pending" }));
    ws.receive(submissionMessage({ eventId: "e1", status: "pending" })); // dup by eventId
    ws.receive(submissionMessage({ status: "validating" })); // no eventId
    ws.receive(submissionMessage({ status: "validating" })); // dup by id+status
    ws.receive(submissionMessage({ status: "accepted" })); // new status → emitted

    expect(received).toEqual(["sub_1:pending", "sub_1:validating", "sub_1:accepted"]);
  });

  it("still emits a later status for the same submission", () => {
    const conn = new RealtimeConnection({ heartbeatMs: 0 });
    const received: string[] = [];
    conn.on("submission", (s) => received.push(s.status));

    conn.connect("GADDR");
    const ws = MockWebSocket.instances[0];
    ws.open();

    ws.receive(submissionMessage({ status: "validating" }));
    ws.receive(submissionMessage({ status: "validating" })); // dup
    ws.receive(submissionMessage({ status: "rewarded", reward: 10 }));

    expect(received).toEqual(["validating", "rewarded"]);
  });

  it("ignores non-JSON payloads and flags invalid shapes as errors", () => {
    const conn = new RealtimeConnection({ heartbeatMs: 0 });
    const submissions: unknown[] = [];
    const errors: string[] = [];
    conn.on("submission", (s) => submissions.push(s));
    conn.on("error", (e) => errors.push(e.message));

    conn.connect("GADDR");
    const ws = MockWebSocket.instances[0];
    ws.open();

    ws.onmessage?.({ data: "{broken json" }); // not JSON → silently ignored
    ws.receive({ type: "unknown-type" }); // invalid shape → error
    ws.receive({ type: "error", message: "server says no" }); // server error → error

    expect(submissions).toHaveLength(0);
    expect(errors).toEqual([
      "Received an invalid message from the realtime server.",
      "server says no",
    ]);
  });
});

describe("RealtimeConnection — reconnection", () => {
  it("reconnects after an unexpected close and re-subscribes", () => {
    vi.useFakeTimers();
    const conn = new RealtimeConnection({
      baseDelayMs: 100,
      maxDelayMs: 400,
      maxRetries: 10,
      heartbeatMs: 0,
    });
    const statuses: string[] = [];
    conn.on("status", (s) => statuses.push(s));

    conn.connect("GADDR");
    MockWebSocket.instances[0].open();
    expect(statuses).toEqual(["connecting", "connected"]);

    // Unexpected close → first reconnect after 100ms.
    MockWebSocket.instances[0].close();
    expect(statuses).toContain("reconnecting");
    expect(MockWebSocket.instances).toHaveLength(1);

    vi.advanceTimersByTime(99);
    expect(MockWebSocket.instances).toHaveLength(1); // not yet

    vi.advanceTimersByTime(1);
    expect(MockWebSocket.instances).toHaveLength(2); // reconnected at 100ms
    MockWebSocket.instances[1].open();
    expect(MockWebSocket.instances[1].sent).toContain(
      JSON.stringify({ type: "subscribe", address: "GADDR" })
    );
    expect(conn.getStatus()).toBe("connected");
  });

  it("doubles the backoff on consecutive failed attempts", () => {
    vi.useFakeTimers();
    const conn = new RealtimeConnection({
      baseDelayMs: 100,
      maxDelayMs: 400,
      maxRetries: 10,
      heartbeatMs: 0,
    });

    conn.connect("GADDR");
    MockWebSocket.instances[0].open();

    // Attempt 1 fails → retry after 100ms.
    MockWebSocket.instances[0].close();
    vi.advanceTimersByTime(100);
    expect(MockWebSocket.instances).toHaveLength(2);

    // Attempt 2 fails without ever opening → retry after 200ms (doubled).
    MockWebSocket.instances[1].close();
    vi.advanceTimersByTime(100);
    expect(MockWebSocket.instances).toHaveLength(2); // 200ms not reached
    vi.advanceTimersByTime(100);
    expect(MockWebSocket.instances).toHaveLength(3);
  });

  it("gives up after max retries, reports error, and falls back to polling", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ items: [ACTIVITY_ITEM], hasMore: false, nextCursor: null })
    );
    vi.stubGlobal("fetch", fetchMock);

    const conn = new RealtimeConnection({
      baseDelayMs: 50,
      maxRetries: 2,
      heartbeatMs: 0,
      pollIntervalMs: 100,
    });
    const errors: string[] = [];
    const received: string[] = [];
    conn.on("error", (e) => errors.push(e.message));
    conn.on("submission", (s) => received.push(`${s.submissionId}:${s.status}`));

    conn.connect("GADDR");
    const ws1 = MockWebSocket.instances[0];
    ws1.open();

    // Attempt 1: close → backoff 50ms.
    ws1.close();
    vi.advanceTimersByTime(50);
    // Attempt 2: socket created but never opens (connection refused).
    MockWebSocket.instances[1].close();
    vi.advanceTimersByTime(100);
    // Attempt 3: socket created but never opens → retries exhausted.
    MockWebSocket.instances[2].close();

    expect(conn.getStatus()).toBe("error");
    expect(conn.getMode()).toBe("polling");
    expect(errors.some((m) => m.includes("after 2 reconnect attempts"))).toBe(true);

    // Polling fallback immediately derives an update from GET /activity.
    await vi.advanceTimersByTimeAsync(0);
    expect(received).toEqual(["sub_1:rewarded"]);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/activity"),
      expect.anything()
    );

    // A later poll emits nothing new (deduplicated).
    await vi.advanceTimersByTimeAsync(100);
    expect(received).toEqual(["sub_1:rewarded"]);
  });

  it("sends heartbeat pings and force-closes a stale link", () => {
    vi.useFakeTimers();
    const conn = new RealtimeConnection({
      heartbeatMs: 100,
      baseDelayMs: 100,
      maxRetries: 5,
    });

    conn.connect("GADDR");
    const ws = MockWebSocket.instances[0];
    ws.open();

    vi.advanceTimersByTime(100);
    expect(ws.sent).toContain(JSON.stringify({ type: "ping" }));

    // No server traffic for 2+ intervals → the link is considered dead.
    vi.advanceTimersByTime(200);
    expect(ws.readyState).toBe(MockWebSocket.CLOSED);
    expect(conn.getStatus()).toBe("reconnecting");
  });
});

describe("RealtimeConnection — polling fallback", () => {
  it("falls back to polling when WebSocket is unavailable", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("WebSocket", undefined);
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        items: [{ ...ACTIVITY_ITEM, status: "pending", reward: 0 }],
        hasMore: false,
        nextCursor: null,
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const conn = new RealtimeConnection({ heartbeatMs: 0, pollIntervalMs: 100 });
    const errors: string[] = [];
    const received: string[] = [];
    conn.on("error", (e) => errors.push(e.message));
    conn.on("submission", (s) => received.push(`${s.submissionId}:${s.status}`));

    conn.connect("GADDR");
    await vi.advanceTimersByTimeAsync(0);

    expect(conn.getMode()).toBe("polling");
    expect(conn.getStatus()).toBe("connected");
    expect(errors.some((m) => m.includes("falling back to polling"))).toBe(true);
    expect(received).toEqual(["sub_1:pending"]);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/activity"),
      expect.anything()
    );
  });

  it("maps activity records to submission statuses (failed → rejected)", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("WebSocket", undefined);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          items: [{ ...ACTIVITY_ITEM, status: "failed", reward: 0 }],
          hasMore: false,
          nextCursor: null,
        })
      )
    );

    const conn = new RealtimeConnection({ heartbeatMs: 0, pollIntervalMs: 100 });
    const received: string[] = [];
    conn.on("submission", (s) => received.push(`${s.submissionId}:${s.status}`));

    conn.connect("GADDR");
    await vi.advanceTimersByTimeAsync(0);

    expect(received).toEqual(["sub_1:rejected"]);
  });
});
