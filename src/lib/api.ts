import type { ZodType } from "zod";
import { ApiError } from "./api-error";
import {
  ChallengeListSchema,
  ChallengeSchema,
  LeaderboardListSchema,
  PaginatedChallengeListSchema,
  PaginatedLeaderboardSchema,
  SubmissionResponseSchema,
  UserStatsSchema,
  type Challenge,
  type ChallengeList,
  type LeaderboardList,
  type PaginatedChallengeList,
  type PaginatedLeaderboard,
  type PaginationParams,
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

/**
 * Build a query string from PaginationParams, omitting undefined/null values.
 */
function buildPaginationQS(params: PaginationParams & { limit: number }): string {
  const qs = new URLSearchParams();
  if (params.difficulty && params.difficulty !== "all") {
    qs.set("difficulty", params.difficulty);
  }
  if (params.cursor) qs.set("cursor", params.cursor);
  qs.set("limit", String(params.limit));
  return qs.toString();
}

/**
 * Fetches a single page of challenges with cursor-based pagination.
 * Pass `cursor` from the previous response's `nextCursor` to load the next page.
 * Falls back gracefully if the backend returns the legacy flat array: wraps it
 * into the paginated shape so callers always receive a uniform object.
 */
export const getChallengesPaginated = async (
  params: PaginationParams = {}
): Promise<PaginatedChallengeList> => {
  const qs = buildPaginationQS({ ...params, limit: params.limit ?? 20 });
  const path = `/challenges/paginated?${qs}`;

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, DEFAULT_GET_INIT);
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

  // Legacy flat-array fallback — promote to paginated shape.
  if (Array.isArray(body)) {
    const parsed = ChallengeListSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(`Response from ${path} did not match the expected schema`, {
        code: "VALIDATION_ERROR",
        status: res.status,
        details: parsed.error.flatten(),
      });
    }
    return { items: parsed.data, hasMore: false, nextCursor: null };
  }

  const parsed = PaginatedChallengeListSchema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError(`Response from ${path} did not match the expected schema`, {
      code: "VALIDATION_ERROR",
      status: res.status,
      details: parsed.error.flatten(),
    });
  }
  return parsed.data;
};

/**
 * Fetches a single page of leaderboard entries with cursor-based pagination.
 */
export const getLeaderboardPaginated = async (
  params: PaginationParams = {}
): Promise<PaginatedLeaderboard> => {
  const qs = buildPaginationQS({ ...params, limit: params.limit ?? 20 });
  const path = `/leaderboard/paginated?${qs}`;

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, DEFAULT_GET_INIT);
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
    const parsed = LeaderboardListSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(`Response from ${path} did not match the expected schema`, {
        code: "VALIDATION_ERROR",
        status: res.status,
        details: parsed.error.flatten(),
      });
    }
    return { items: parsed.data, hasMore: false, nextCursor: null };
  }

  const parsed = PaginatedLeaderboardSchema.safeParse(body);
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
export type { PaginatedChallengeList, PaginatedLeaderboard, PaginationParams };
