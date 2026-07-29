import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "./api-error";
import { getActivity } from "./api";
import {
  ActivityItemSchema,
  ActivityListSchema,
  ActivityFilterSchema,
  PaginatedActivitySchema,
  TxTypeSchema,
  TxStatusSchema,
} from "./schemas";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

const validItem = {
  id: "act_1",
  txHash: "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
  timestamp: "2026-07-15T12:00:00Z",
  type: "claim",
  status: "confirmed",
  reward: 25,
  challengeId: "c1",
  challengeTitle: "Reverse a string",
  address: "GABC1234EFGH5678",
};

afterEach(() => {
  vi.unstubAllGlobals();
});

// ─── ActivityItemSchema ───────────────────────────────────────────────────────

describe("ActivityItemSchema", () => {
  it("accepts a fully-populated activity item", () => {
    expect(ActivityItemSchema.safeParse(validItem).success).toBe(true);
  });

  it("accepts an item without optional challenge fields", () => {
    const { challengeId, challengeTitle, ...minimal } = validItem;
    expect(ActivityItemSchema.safeParse(minimal).success).toBe(true);
  });

  it("rejects an invalid txType", () => {
    expect(
      ActivityItemSchema.safeParse({ ...validItem, type: "transfer" }).success
    ).toBe(false);
  });

  it("rejects an invalid status", () => {
    expect(
      ActivityItemSchema.safeParse({ ...validItem, status: "unknown" }).success
    ).toBe(false);
  });

  it("rejects a missing required field (txHash)", () => {
    const { txHash, ...rest } = validItem;
    expect(ActivityItemSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects a non-ISO timestamp", () => {
    expect(
      ActivityItemSchema.safeParse({ ...validItem, timestamp: "not-a-date" }).success
    ).toBe(false);
  });

  it("rejects a reward of the wrong type", () => {
    expect(
      ActivityItemSchema.safeParse({ ...validItem, reward: "25" }).success
    ).toBe(false);
  });
});

// ─── TxTypeSchema ─────────────────────────────────────────────────────────────

describe("TxTypeSchema", () => {
  it("accepts all valid tx types", () => {
    for (const v of ["submit", "claim", "other"]) {
      expect(TxTypeSchema.safeParse(v).success).toBe(true);
    }
  });

  it("rejects an unknown tx type", () => {
    expect(TxTypeSchema.safeParse("transfer").success).toBe(false);
  });
});

// ─── TxStatusSchema ───────────────────────────────────────────────────────────

describe("TxStatusSchema", () => {
  it("accepts all valid statuses", () => {
    for (const v of ["confirmed", "failed", "pending"]) {
      expect(TxStatusSchema.safeParse(v).success).toBe(true);
    }
  });

  it("rejects an unknown status", () => {
    expect(TxStatusSchema.safeParse("processing").success).toBe(false);
  });
});

// ─── ActivityListSchema ───────────────────────────────────────────────────────

describe("ActivityListSchema", () => {
  it("accepts an array of valid items", () => {
    expect(ActivityListSchema.safeParse([validItem]).success).toBe(true);
  });

  it("accepts an empty array", () => {
    expect(ActivityListSchema.safeParse([]).success).toBe(true);
  });

  it("rejects a non-array", () => {
    expect(ActivityListSchema.safeParse(validItem).success).toBe(false);
  });
});

// ─── PaginatedActivitySchema ──────────────────────────────────────────────────

describe("PaginatedActivitySchema", () => {
  it("accepts a full paginated response", () => {
    const result = PaginatedActivitySchema.safeParse({
      items: [validItem],
      hasMore: true,
      nextCursor: "cursor_abc",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a last page with null nextCursor", () => {
    expect(
      PaginatedActivitySchema.safeParse({
        items: [],
        hasMore: false,
        nextCursor: null,
      }).success
    ).toBe(true);
  });

  it("accepts an optional total field", () => {
    expect(
      PaginatedActivitySchema.safeParse({
        items: [validItem],
        hasMore: false,
        nextCursor: null,
        total: 42,
      }).success
    ).toBe(true);
  });

  it("rejects a response missing 'hasMore'", () => {
    expect(
      PaginatedActivitySchema.safeParse({
        items: [validItem],
        nextCursor: null,
      }).success
    ).toBe(false);
  });
});

// ─── ActivityFilterSchema ─────────────────────────────────────────────────────

describe("ActivityFilterSchema", () => {
  it("accepts an empty filter", () => {
    expect(ActivityFilterSchema.safeParse({}).success).toBe(true);
  });

  it("accepts a fully-populated filter", () => {
    expect(
      ActivityFilterSchema.safeParse({
        address: "GABC...",
        type: "claim",
        status: "confirmed",
        dateFrom: "2026-01-01",
        dateTo: "2026-12-31",
        cursor: "tok",
        limit: 50,
      }).success
    ).toBe(true);
  });

  it("rejects an invalid type", () => {
    expect(
      ActivityFilterSchema.safeParse({ type: "bogus" }).success
    ).toBe(false);
  });

  it("rejects a non-positive limit", () => {
    expect(
      ActivityFilterSchema.safeParse({ limit: 0 }).success
    ).toBe(false);
  });
});

// ─── getActivity ──────────────────────────────────────────────────────────────

describe("getActivity", () => {
  it("returns a paginated activity page", async () => {
    const page = { items: [validItem], hasMore: true, nextCursor: "tok_1" };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(page)));

    const result = await getActivity({ address: "GABC", limit: 20 });
    expect(result.items).toEqual([validItem]);
    expect(result.hasMore).toBe(true);
    expect(result.nextCursor).toBe("tok_1");
  });

  it("wraps a legacy flat-array response into the paginated shape", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse([validItem])));

    const result = await getActivity();
    expect(result.items).toEqual([validItem]);
    expect(result.hasMore).toBe(false);
    expect(result.nextCursor).toBeNull();
  });

  it("passes filter params as query string", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ items: [], hasMore: false, nextCursor: null })
    );
    vi.stubGlobal("fetch", fetchMock);

    await getActivity({
      address: "GABC",
      type: "claim",
      status: "confirmed",
      dateFrom: "2026-01-01",
      dateTo: "2026-12-31",
      cursor: "cur_1",
      limit: 10,
    });

    const url: string = fetchMock.mock.calls[0][0];
    expect(url).toContain("address=GABC");
    expect(url).toContain("type=claim");
    expect(url).toContain("status=confirmed");
    expect(url).toContain("dateFrom=2026-01-01");
    expect(url).toContain("dateTo=2026-12-31");
    expect(url).toContain("cursor=cur_1");
    expect(url).toContain("limit=10");
  });

  it("omits undefined filter params from the query string", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ items: [], hasMore: false, nextCursor: null })
    );
    vi.stubGlobal("fetch", fetchMock);

    await getActivity({});

    const url: string = fetchMock.mock.calls[0][0];
    expect(url).not.toContain("address=");
    expect(url).not.toContain("type=");
    expect(url).not.toContain("status=");
    expect(url).not.toContain("dateFrom=");
    expect(url).not.toContain("dateTo=");
    expect(url).not.toContain("cursor=");
  });

  it("defaults limit to 20 when not specified", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ items: [], hasMore: false, nextCursor: null })
    );
    vi.stubGlobal("fetch", fetchMock);

    await getActivity();

    expect(fetchMock.mock.calls[0][0]).toContain("limit=20");
  });

  it("throws NETWORK_ERROR when fetch rejects", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));

    const err = await getActivity().catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe("NETWORK_ERROR");
  });

  it("throws HTTP_ERROR on a non-2xx response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ message: "forbidden" }, 403))
    );

    const err = await getActivity({ address: "G123" }).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe("HTTP_ERROR");
    expect(err.status).toBe(403);
  });

  it("throws PARSE_ERROR when the body isn't valid JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => { throw new SyntaxError("Unexpected token"); },
      } as unknown as Response)
    );

    const err = await getActivity().catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe("PARSE_ERROR");
  });

  it("throws VALIDATION_ERROR when the paginated schema doesn't match", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        // hasMore is missing — schema should reject it
        jsonResponse({ items: [validItem], nextCursor: null })
      )
    );

    const err = await getActivity().catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe("VALIDATION_ERROR");
  });

  it("throws VALIDATION_ERROR when a legacy array item is malformed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse([{ ...validItem, reward: "not-a-number" }])
      )
    );

    const err = await getActivity().catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe("VALIDATION_ERROR");
  });

  it("returns empty items and hasMore false on the last page", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({ items: [], hasMore: false, nextCursor: null })
      )
    );

    const result = await getActivity({ cursor: "last_cursor" });
    expect(result.items).toHaveLength(0);
    expect(result.hasMore).toBe(false);
  });

  it("accepts optional total in the response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({ items: [validItem], hasMore: false, nextCursor: null, total: 1 })
      )
    );

    const result = await getActivity();
    expect(result.total).toBe(1);
  });

  it("uses cache: no-store so activity data is always fresh", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ items: [], hasMore: false, nextCursor: null })
    );
    vi.stubGlobal("fetch", fetchMock);

    await getActivity();

    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ cache: "no-store" })
    );
  });
});
