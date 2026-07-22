import { z } from "zod";

/**
 * Single source of truth for the shape of data returned by the backend.
 * Every response the API layer receives is parsed through one of these
 * schemas before it reaches UI code — see src/lib/api.ts.
 *
 * TypeScript types below are inferred from the schemas (`z.infer`), so the
 * runtime validation and the compile-time types can never drift apart.
 */

export const DifficultySchema = z.enum(["beginner", "intermediate", "advanced"]);

export const ChallengeSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  instructions: z.string(),
  difficulty: DifficultySchema,
  reward: z.number(),
  solved: z.boolean(),
});

export const ChallengeListSchema = z.array(ChallengeSchema);

export const CompletedChallengeSchema = ChallengeSchema.pick({
  id: true,
  title: true,
  difficulty: true,
  reward: true,
});

export const LeaderboardEntrySchema = z.object({
  address: z.string(),
  solved: z.number(),
  totalRewards: z.number(),
});

export const LeaderboardListSchema = z.array(LeaderboardEntrySchema);

export const UserStatsSchema = z.object({
  address: z.string(),
  solved: z.number(),
  totalRewards: z.number(),
  completedChallenges: z.array(CompletedChallengeSchema),
});

export const SubmissionResponseSchema = z.object({
  id: z.string(),
  status: z.enum(["pending", "confirmed", "rejected"]),
  challengeId: z.string(),
  txHash: z.string().optional(),
  reward: z.number().optional(),
});

export type Difficulty = z.infer<typeof DifficultySchema>;
export type Challenge = z.infer<typeof ChallengeSchema>;
export type ChallengeList = z.infer<typeof ChallengeListSchema>;
export type LeaderboardEntry = z.infer<typeof LeaderboardEntrySchema>;
export type LeaderboardList = z.infer<typeof LeaderboardListSchema>;
export type UserProgress = z.infer<typeof UserStatsSchema>;
export type SubmissionResponse = z.infer<typeof SubmissionResponseSchema>;
