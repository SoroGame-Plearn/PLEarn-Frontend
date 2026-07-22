import type { ZodType } from "zod";
import { ApiError } from "./api-error";
import {
  ChallengeListSchema,
  ChallengeSchema,
  LeaderboardListSchema,
  SubmissionResponseSchema,
  UserStatsSchema,
  type Challenge,
  type ChallengeList,
  type LeaderboardList,
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

export { ApiError };
export type { ApiErrorCode } from "./api-error";
