import type { ZodType } from "zod";
import { ApiError } from "./api-error";
import {
  ActivityListSchema,
  ChallengeListSchema,
  ChallengeSchema,
  LeaderboardListSchema,
  PaginatedActivitySchema,
  SubmissionResponseSchema,
  UserStatsSchema,
  type ActivityFilter,
  type ActivityItem,
  type Challenge,
  type ChallengeList,
  type LeaderboardList,
  type PaginatedActivity,
  type SubmissionResponse,
  type UserProgress,
} from "./schemas";

const BASE = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:3001";

const DEFAULT_GET_INIT: RequestInit = { next: { revalidate: 60 } };

/**
 * Fetches `path`, then validates the JSON body against `schema` before
 * returning it. Every failure mode — network failure, non-2xx status,
 * unparsable body, schema mismatch — surfaces as a typed ApiError so
 * callers can branch on `error.code` instead of parsing messages.
 */
async function request<T>(
  path: string,
  schema: ZodType<T>,
  init: RequestInit = DEFAULT_GET_INIT
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, init);
  } catch (err) {
    throw new ApiError(`Network error while requesting ${path}`, {
      code: "NETWORK_ERROR",
      cause: err,
    });
  }

  if (!res.ok) {
    let details: unknown;
    try {
      details = await res.json();
    } catch {
      // Response body wasn't JSON (or was empty) — nothing more to attach.
    }
    throw new ApiError(`API request to ${path} failed with status ${res.status}`, {
      code: "HTTP_ERROR",
      status: res.status,
      details,
    });
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch (err) {
    throw new ApiError(`Failed to parse JSON response from ${path}`, {
      code: "PARSE_ERROR",
      status: res.status,
      cause: err,
    });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError(`Response from ${path} did not match the expected schema`, {
      code: "VALIDATION_ERROR",
      status: res.status,
      details: parsed.error.flatten(),
    });
  }

  return parsed.data;
}

export const getChallenges = (difficulty = "all") =>
  request<ChallengeList>(
    `/challenges${difficulty !== "all" ? `?difficulty=${difficulty}` : ""}`,
    ChallengeListSchema
  );

export const getChallenge = (id: string) =>
  request<Challenge>(`/challenges/${id}`, ChallengeSchema);

export const getLeaderboard = () =>
  request<LeaderboardList>("/leaderboard", LeaderboardListSchema);

export const getProgress = (address?: string) =>
  request<UserProgress>(
    `/progress${address ? `?address=${address}` : ""}`,
    UserStatsSchema
  );

export const submitSolution = (
  challengeId: string,
  address: string,
  signedXdr: string
) =>
  request<SubmissionResponse>("/submit", SubmissionResponseSchema, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ challengeId, address, signedXdr }),
  });

// ─── Activity ────────────────────────────────────────────────────────────────

/**
 * Build a query string from ActivityFilter params.
 * Only appends keys that are explicitly provided (no undefined noise).
 */
function buildActivityQS(filter: ActivityFilter & { limit?: number }): string {
  const qs = new URLSearchParams();
  if (filter.address) qs.set("address", filter.address);
  if (filter.type) qs.set("type", filter.type);
  if (filter.status) qs.set("status", filter.status);
  if (filter.dateFrom) qs.set("dateFrom", filter.dateFrom);
  if (filter.dateTo) qs.set("dateTo", filter.dateTo);
  if (filter.cursor) qs.set("cursor", filter.cursor);
  qs.set("limit", String(filter.limit ?? 20));
  return qs.toString();
}

/**
 * Fetches a paginated page of on-chain activity records from GET /activity.
 *
 * All filter fields are optional. Pass `cursor` from a previous response's
 * `nextCursor` to load the next page.
 *
 * Includes a legacy flat-array fallback: if the backend returns a plain
 * `ActivityItem[]` it is wrapped into the paginated envelope so callers always
 * receive a uniform `PaginatedActivity` object.
 */
export const getActivity = async (
  filter: ActivityFilter = {}
): Promise<PaginatedActivity> => {
  const qs = buildActivityQS(filter);
  const path = `/activity?${qs}`;

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, { cache: "no-store" });
  } catch (err) {
    throw new ApiError(`Network error while requesting ${path}`, {
      code: "NETWORK_ERROR",
      cause: err,
    });
  }

  if (!res.ok) {
    let details: unknown;
    try { details = await res.json(); } catch { /* empty */ }
    throw new ApiError(`API request to ${path} failed with status ${res.status}`, {
      code: "HTTP_ERROR",
      status: res.status,
      details,
    });
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch (err) {
    throw new ApiError(`Failed to parse JSON response from ${path}`, {
      code: "PARSE_ERROR",
      status: res.status,
      cause: err,
    });
  }

  // Legacy flat-array fallback.
  if (Array.isArray(body)) {
    const parsed = ActivityListSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(`Response from ${path} did not match the expected schema`, {
        code: "VALIDATION_ERROR",
        status: res.status,
        details: parsed.error.flatten(),
      });
    }
    return { items: parsed.data, hasMore: false, nextCursor: null };
  }

  const parsed = PaginatedActivitySchema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError(`Response from ${path} did not match the expected schema`, {
      code: "VALIDATION_ERROR",
      status: res.status,
      details: parsed.error.flatten(),
    });
  }
  return parsed.data;
};

export { ApiError };
export type { ApiErrorCode } from "./api-error";
export type { ActivityFilter, ActivityItem, PaginatedActivity };
