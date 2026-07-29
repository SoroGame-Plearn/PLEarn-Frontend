import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "./api-error";
import { getChallengesPaginated, getLeaderboardPaginated } from "./api";

// ─── Helpers ────────────────────────────────────────────────────────────────

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

const validChallenge = {
  id: "c1",
  title: "Reverse a string",
  description: "Write a function that reverses a string.",
  instructions: "Implement reverse(str).",
  difficulty: "beginner",
  reward: 10,
  solved: false,
};

const validEntry = { address: "GABC1234EFGH", solved: 5, totalRewards: 50 };

afterEach(() => {
  vi.unstubAllGlobals();
});

// ─── getChallengesPaginated ──────────────────────────────────────────────────

describe("getChallengesPaginated", () => {
  it("returns the paginated shape when the backend returns the new format", async () => {
    const page = {
      items: [validChallenge],
      nextCursor: "cursor_abc",
      hasMore: true,
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(page)));

    const result = await getChallengesPaginated({ limit: 20, difficulty: "all" });

    expect(result.items).toEqual([validChallenge]);
    expect(result.nextCursor).toBe("cursor_abc");
    expect(result.hasMore).toBe(true);
  });

  it("wraps a legacy flat-array response into the paginated shape", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse([validChallenge])));

    const result = await getChallengesPaginated();

    expect(result.items).toEqual([validChallenge]);
    expect(result.hasMore).toBe(false);
    expect(result.nextCursor).toBeNull();
  });

  it("passes cursor and limit as query params", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ items: [], hasMore: false, nextCursor: null })
    );
    vi.stubGlobal("fetch", fetchMock);

    await getChallengesPaginated({ cursor: "tok123", limit: 10 });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("cursor=tok123"),
      expect.anything()
    );
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("limit=10"),
      expect.anything()
    );
  });

  it("passes the difficulty filter as a query param when not 'all'", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ items: [], hasMore: false, nextCursor: null })
    );
    vi.stubGlobal("fetch", fetchMock);

    await getChallengesPaginated({ difficulty: "intermediate" });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("difficulty=intermediate"),
      expect.anything()
    );
  });

  it("does NOT pass difficulty param when set to 'all'", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ items: [], hasMore: false, nextCursor: null })
    );
    vi.stubGlobal("fetch", fetchMock);

    await getChallengesPaginated({ difficulty: "all" });

    const calledUrl: string = fetchMock.mock.calls[0][0];
    expect(calledUrl).not.toContain("difficulty");
  });

  it("throws NETWORK_ERROR when fetch rejects", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));

    const err = await getChallengesPaginated().catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe("NETWORK_ERROR");
  });

  it("throws HTTP_ERROR on a non-2xx response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ message: "not found" }, 404))
    );

    const err = await getChallengesPaginated().catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe("HTTP_ERROR");
    expect(err.status).toBe(404);
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

    const err = await getChallengesPaginated().catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe("PARSE_ERROR");
  });

  it("throws VALIDATION_ERROR when the paginated schema doesn't match", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({ items: [{ ...validChallenge, reward: "oops" }], hasMore: false })
      )
    );

    const err = await getChallengesPaginated().catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe("VALIDATION_ERROR");
  });

  it("returns hasMore: false and nextCursor: null when the last page is reached", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({ items: [validChallenge], hasMore: false, nextCursor: null })
      )
    );

    const result = await getChallengesPaginated({ cursor: "last-cursor" });
    expect(result.hasMore).toBe(false);
    expect(result.nextCursor).toBeNull();
  });

  it("returns an empty items array when there are no challenges", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({ items: [], hasMore: false, nextCursor: null })
      )
    );

    const result = await getChallengesPaginated();
    expect(result.items).toHaveLength(0);
    expect(result.hasMore).toBe(false);
  });

  it("accepts an optional total field in the response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({ items: [validChallenge], hasMore: false, nextCursor: null, total: 42 })
      )
    );

    const result = await getChallengesPaginated();
    expect(result.total).toBe(42);
  });
});

// ─── getLeaderboardPaginated ─────────────────────────────────────────────────

describe("getLeaderboardPaginated", () => {
  it("returns paginated leaderboard entries", async () => {
    const page = { items: [validEntry], nextCursor: "tok_1", hasMore: true };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(page)));

    const result = await getLeaderboardPaginated({ limit: 20 });

    expect(result.items).toEqual([validEntry]);
    expect(result.hasMore).toBe(true);
    expect(result.nextCursor).toBe("tok_1");
  });

  it("wraps a legacy flat-array leaderboard response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse([validEntry])));

    const result = await getLeaderboardPaginated();

    expect(result.items).toEqual([validEntry]);
    expect(result.hasMore).toBe(false);
    expect(result.nextCursor).toBeNull();
  });

  it("throws NETWORK_ERROR when fetch rejects", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("failed")));

    const err = await getLeaderboardPaginated().catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe("NETWORK_ERROR");
  });

  it("throws HTTP_ERROR on a 500 response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ error: "internal" }, 500))
    );

    const err = await getLeaderboardPaginated().catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe("HTTP_ERROR");
    expect(err.status).toBe(500);
  });

  it("passes cursor and limit in the query string", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ items: [], hasMore: false, nextCursor: null })
    );
    vi.stubGlobal("fetch", fetchMock);

    await getLeaderboardPaginated({ cursor: "tok_99", limit: 5 });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("cursor=tok_99"),
      expect.anything()
    );
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("limit=5"),
      expect.anything()
    );
  });

  it("returns empty items on the last page", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({ items: [], hasMore: false, nextCursor: null })
      )
    );

    const result = await getLeaderboardPaginated({ cursor: "final" });
    expect(result.items).toHaveLength(0);
    expect(result.hasMore).toBe(false);
  });

  it("accepts an optional total field", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({ items: [validEntry], hasMore: false, nextCursor: null, total: 100 })
      )
    );

    const result = await getLeaderboardPaginated();
    expect(result.total).toBe(100);
  });
});

// ─── Pagination schema tests ─────────────────────────────────────────────────

describe("PaginatedSchema (via schema tests)", () => {
  // These tests exercise the schema-level validation indirectly through the
  // API functions — the schemas themselves are tested directly in schemas.test.ts.

  it("rejects a paginated challenges response that is missing 'hasMore'", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({ items: [validChallenge], nextCursor: null })
      )
    );

    const err = await getChallengesPaginated().catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe("VALIDATION_ERROR");
  });

  it("rejects a paginated leaderboard response with a wrong item shape", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          items: [{ address: "G1", solved: "five", totalRewards: 10 }],
          hasMore: false,
          nextCursor: null,
        })
      )
    );

    const err = await getLeaderboardPaginated().catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe("VALIDATION_ERROR");
  });
});
