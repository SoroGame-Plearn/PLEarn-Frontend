import { z } from "zod";

/**
 * Single source of truth for the shape of data returned by the backend.
 * Every response the API layer receives is parsed through one of these
 * schemas before it reaches UI code — see src/lib/api.ts.
 *
 * TypeScript types below are inferred from the schemas (`z.infer`), so the
 * runtime validation and the compile-time types can never drift apart.
 */

// ─── Generic cursor-based paginated response wrapper ────────────────────────

/**
 * Generic cursor-based paginated response wrapper.
 * `nextCursor` is absent (or null) when there are no more pages.
 */
export function PaginatedSchema<T extends z.ZodTypeAny>(itemSchema: T) {
  return z.object({
    items: z.array(itemSchema),
    nextCursor: z.string().nullable().optional(),
    hasMore: z.boolean(),
    total: z.number().optional(),
  });
}

// ─── Challenge schemas ───────────────────────────────────────────────────────

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

// ─── Leaderboard schemas ─────────────────────────────────────────────────────

export const LeaderboardEntrySchema = z.object({
  address: z.string(),
  solved: z.number(),
  totalRewards: z.number(),
});

export const LeaderboardListSchema = z.array(LeaderboardEntrySchema);

/** Cursor-paginated challenge list — see `PaginatedSchema`. */
export const PaginatedChallengeListSchema = PaginatedSchema(ChallengeSchema);

/** Cursor-paginated leaderboard list — see `PaginatedSchema`. */
export const PaginatedLeaderboardListSchema = PaginatedSchema(LeaderboardEntrySchema);

// ─── User / progress schemas ─────────────────────────────────────────────────

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

// ─── Activity / Transaction schemas ─────────────────────────────────────────

/** Broad category of on-chain operation visible in the activity explorer. */
export const TxTypeSchema = z.enum(["submit", "claim", "other"]);

/** Settled status of a transaction as tracked by the backend. */
export const TxStatusSchema = z.enum(["confirmed", "failed", "pending"]);

/**
 * A single on-chain activity record returned by GET /activity.
 * `challengeId` / `challengeTitle` are optional — some transactions (e.g. raw
 * PLN transfers) may not be associated with a specific challenge.
 */
export const ActivityItemSchema = z.object({
  /** Unique backend-assigned record id. */
  id: z.string(),
  /** Stellar transaction hash — links to the block explorer. */
  txHash: z.string(),
  /** ISO-8601 timestamp when the transaction was ledger-confirmed. */
  timestamp: z.string().datetime({ offset: true }),
  type: TxTypeSchema,
  status: TxStatusSchema,
  /** PLN reward amount credited (0 for non-claim transactions). */
  reward: z.number(),
  challengeId: z.string().optional(),
  challengeTitle: z.string().optional(),
  /** Stellar account that initiated the transaction. */
  address: z.string(),
});

export const ActivityListSchema = z.array(ActivityItemSchema);

export const PaginatedActivitySchema = PaginatedSchema(ActivityItemSchema);

/**
 * Filter parameters accepted by GET /activity.
 * All fields are optional — omitting them returns the full unfiltered history.
 */
export const ActivityFilterSchema = z.object({
  address: z.string().optional(),
  type: TxTypeSchema.optional(),
  status: TxStatusSchema.optional(),
  /** ISO-8601 date string, inclusive lower bound (e.g. "2026-01-01"). */
  dateFrom: z.string().optional(),
  /** ISO-8601 date string, inclusive upper bound (e.g. "2026-12-31"). */
  dateTo: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.number().int().positive().optional(),
});

// ─── WebSocket / realtime schemas ─────────────────────────────────────────────

/**
 * Lifecycle of a solution submission as reported over the WebSocket.
 *
 *   pending     → backend received the submission, waiting in the queue
 *   validating  → solution is being checked against the challenge
 *   accepted    → solution passed validation, transaction broadcast
 *   rewarded    → reward tokens distributed on-chain (terminal)
 *   rejected    → solution failed validation (terminal)
 */
export const SubmissionStatusSchema = z.enum([
  "pending",
  "validating",
  "accepted",
  "rewarded",
  "rejected",
]);

/** A single submission status update pushed by the backend over the WebSocket. */
export const RealtimeSubmissionSchema = z.object({
  /** Backend-assigned submission id — matches `SubmissionResponse.id`. */
  submissionId: z.string(),
  challengeId: z.string(),
  status: SubmissionStatusSchema,
  /** Stellar transaction hash once the submission has been broadcast. */
  txHash: z.string().optional(),
  /** PLN reward amount once the reward has been distributed. */
  reward: z.number().optional(),
  /** ISO-8601 timestamp of when this status was recorded by the backend. */
  timestamp: z.string().datetime({ offset: true }),
});

/** Messages the client sends to the backend. */
export const WsClientMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("subscribe"),
    /** Stellar public key whose submission updates should be pushed. */
    address: z.string(),
  }),
  z.object({ type: z.literal("ping") }),
]);

/** Messages the backend sends to the client. */
export const WsServerMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("submission.update"),
    data: RealtimeSubmissionSchema,
    /** Optional server-assigned id used for client-side deduplication. */
    eventId: z.string().optional(),
  }),
  z.object({ type: z.literal("pong") }),
  z.object({ type: z.literal("error"), message: z.string() }),
]);

// ─── Inferred TypeScript types ───────────────────────────────────────────────

export type Difficulty = z.infer<typeof DifficultySchema>;
export type Challenge = z.infer<typeof ChallengeSchema>;
export type ChallengeList = z.infer<typeof ChallengeListSchema>;
export type PaginatedChallengeList = z.infer<typeof PaginatedChallengeListSchema>;
export type LeaderboardEntry = z.infer<typeof LeaderboardEntrySchema>;
export type PaginatedLeaderboardList = z.infer<typeof PaginatedLeaderboardListSchema>;
export type LeaderboardList = z.infer<typeof LeaderboardListSchema>;
export type UserProgress = z.infer<typeof UserStatsSchema>;
export type SubmissionResponse = z.infer<typeof SubmissionResponseSchema>;

export type TxType = z.infer<typeof TxTypeSchema>;
export type TxStatus = z.infer<typeof TxStatusSchema>;
export type ActivityItem = z.infer<typeof ActivityItemSchema>;
export type ActivityList = z.infer<typeof ActivityListSchema>;
export type PaginatedActivity = z.infer<typeof PaginatedActivitySchema>;
export type ActivityFilter = z.infer<typeof ActivityFilterSchema>;

export type SubmissionStatus = z.infer<typeof SubmissionStatusSchema>;
export type RealtimeSubmission = z.infer<typeof RealtimeSubmissionSchema>;
export type WsClientMessage = z.infer<typeof WsClientMessageSchema>;
export type WsServerMessage = z.infer<typeof WsServerMessageSchema>;
