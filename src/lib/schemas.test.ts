import { describe, expect, it } from "vitest";
import {
  ChallengeListSchema,
  ChallengeSchema,
  LeaderboardEntrySchema,
  LeaderboardListSchema,
  SubmissionResponseSchema,
  UserStatsSchema,
} from "./schemas";

const validChallenge = {
  id: "c1",
  title: "Reverse a string",
  description: "Write a function that reverses a string.",
  instructions: "Implement reverse(str).",
  difficulty: "beginner",
  reward: 10,
  solved: false,
};

describe("ChallengeSchema", () => {
  it("accepts a well-formed challenge", () => {
    const result = ChallengeSchema.safeParse(validChallenge);
    expect(result.success).toBe(true);
  });

  it("rejects an invalid difficulty", () => {
    const result = ChallengeSchema.safeParse({ ...validChallenge, difficulty: "expert" });
    expect(result.success).toBe(false);
  });

  it("rejects a missing required field", () => {
    const { title, ...rest } = validChallenge;
    const result = ChallengeSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects a reward of the wrong type", () => {
    const result = ChallengeSchema.safeParse({ ...validChallenge, reward: "10" });
    expect(result.success).toBe(false);
  });
});

describe("ChallengeListSchema", () => {
  it("accepts an array of valid challenges", () => {
    const result = ChallengeListSchema.safeParse([validChallenge]);
    expect(result.success).toBe(true);
  });

  it("rejects a non-array payload", () => {
    const result = ChallengeListSchema.safeParse(validChallenge);
    expect(result.success).toBe(false);
  });

  it("rejects an array containing one invalid entry", () => {
    const result = ChallengeListSchema.safeParse([
      validChallenge,
      { ...validChallenge, reward: "not-a-number" },
    ]);
    expect(result.success).toBe(false);
  });
});

describe("LeaderboardEntrySchema", () => {
  it("accepts a well-formed entry", () => {
    const result = LeaderboardEntrySchema.safeParse({
      address: "GABC...",
      solved: 4,
      totalRewards: 120,
    });
    expect(result.success).toBe(true);
  });

  it("rejects a negative-looking string as solved", () => {
    const result = LeaderboardEntrySchema.safeParse({
      address: "GABC...",
      solved: "4",
      totalRewards: 120,
    });
    expect(result.success).toBe(false);
  });
});

describe("LeaderboardListSchema", () => {
  it("accepts an empty leaderboard", () => {
    const result = LeaderboardListSchema.safeParse([]);
    expect(result.success).toBe(true);
  });
});

describe("UserStatsSchema", () => {
  it("accepts a valid progress payload", () => {
    const result = UserStatsSchema.safeParse({
      address: "GABC...",
      solved: 2,
      totalRewards: 20,
      completedChallenges: [
        { id: "c1", title: "Reverse a string", difficulty: "beginner", reward: 10 },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects a completed challenge missing a required field", () => {
    const result = UserStatsSchema.safeParse({
      address: "GABC...",
      solved: 2,
      totalRewards: 20,
      completedChallenges: [{ id: "c1", difficulty: "beginner", reward: 10 }],
    });
    expect(result.success).toBe(false);
  });
});

describe("SubmissionResponseSchema", () => {
  it("accepts a minimal valid submission response", () => {
    const result = SubmissionResponseSchema.safeParse({
      id: "sub_1",
      status: "pending",
      challengeId: "c1",
    });
    expect(result.success).toBe(true);
  });

  it("accepts optional txHash and reward", () => {
    const result = SubmissionResponseSchema.safeParse({
      id: "sub_1",
      status: "confirmed",
      challengeId: "c1",
      txHash: "abcd1234",
      reward: 10,
    });
    expect(result.success).toBe(true);
  });

  it("rejects an unknown status", () => {
    const result = SubmissionResponseSchema.safeParse({
      id: "sub_1",
      status: "processing",
      challengeId: "c1",
    });
    expect(result.success).toBe(false);
  });
});
