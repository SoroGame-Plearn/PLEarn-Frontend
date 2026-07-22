import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "./api-error";
import {
  getChallenge,
  getChallenges,
  getLeaderboard,
  getProgress,
  submitSolution,
} from "./api";

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

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getChallenges", () => {
  it("returns parsed data when the response matches the schema", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse([validChallenge])));
    const result = await getChallenges();
    expect(result).toEqual([validChallenge]);
  });

  it("throws a VALIDATION_ERROR ApiError when the schema doesn't match", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse([{ ...validChallenge, reward: "ten" }]))
    );
    await expect(getChallenges()).rejects.toMatchObject({
      name: "ApiError",
      code: "VALIDATION_ERROR",
    });
  });

  it("appends the difficulty query param when not 'all'", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse([]));
    vi.stubGlobal("fetch", fetchMock);
    await getChallenges("beginner");
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/challenges?difficulty=beginner"),
      expect.anything()
    );
  });
});

describe("getChallenge", () => {
  it("throws an HTTP_ERROR ApiError with status on a 404", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ message: "not found" }, 404))
    );
    const err = await getChallenge("missing").catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe("HTTP_ERROR");
    expect(err.status).toBe(404);
  });

  it("throws a NETWORK_ERROR ApiError when fetch rejects", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    const err = await getChallenge("c1").catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe("NETWORK_ERROR");
  });

  it("throws a PARSE_ERROR ApiError when the body isn't valid JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => {
          throw new SyntaxError("Unexpected token");
        },
      } as unknown as Response)
    );
    const err = await getChallenge("c1").catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe("PARSE_ERROR");
  });
});

describe("getLeaderboard", () => {
  it("returns parsed leaderboard entries", async () => {
    const entries = [{ address: "GABC", solved: 3, totalRewards: 30 }];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(entries)));
    await expect(getLeaderboard()).resolves.toEqual(entries);
  });
});

describe("getProgress", () => {
  it("returns parsed user progress", async () => {
    const progress = {
      address: "GABC",
      solved: 1,
      totalRewards: 10,
      completedChallenges: [
        { id: "c1", title: "Reverse a string", difficulty: "beginner", reward: 10 },
      ],
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(progress)));
    await expect(getProgress()).resolves.toEqual(progress);
  });
});

describe("submitSolution", () => {
  it("posts to /submit and returns the parsed response", async () => {
    const response = { id: "sub_1", status: "pending", challengeId: "c1" };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(response));
    vi.stubGlobal("fetch", fetchMock);

    const result = await submitSolution("c1", "GADDR", "signed-xdr");

    expect(result).toEqual(response);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/submit"),
      expect.objectContaining({ method: "POST" })
    );
  });

  it("throws a VALIDATION_ERROR ApiError when the submission response is malformed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ id: "sub_1", status: "unknown-status" }))
    );
    await expect(submitSolution("c1", "GADDR", "signed-xdr")).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
  });
});
