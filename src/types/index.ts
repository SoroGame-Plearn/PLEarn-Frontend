// These types are inferred from the Zod schemas in src/lib/schemas.ts, which
// is the source of truth for API response shapes. Re-exported here so
// existing `@/types` imports keep working.
export type {
  Challenge,
  ChallengeList,
  Difficulty,
  LeaderboardEntry,
  LeaderboardList,
  PaginatedChallengeList,
  PaginatedLeaderboard,
  PaginationParams,
  SubmissionResponse,
  UserProgress,
} from "@/lib/schemas";
