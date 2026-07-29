// These types are inferred from the Zod schemas in src/lib/schemas.ts, which
// is the source of truth for API response shapes. Re-exported here so
// existing `@/types` imports keep working.
export type {
  ActivityFilter,
  ActivityItem,
  ActivityList,
  Challenge,
  ChallengeList,
  Difficulty,
  LeaderboardEntry,
  LeaderboardList,
  PaginatedActivity,
  SubmissionResponse,
  TxStatus,
  TxType,
  UserProgress,
} from "@/lib/schemas";
