import type { Challenge, LeaderboardEntry, UserProgress } from "@/types";

const BASE = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:3001";

async function fetcher<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { next: { revalidate: 60 } });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export const getChallenges = (difficulty = "all") =>
  fetcher<Challenge[]>(
    `/challenges${difficulty !== "all" ? `?difficulty=${difficulty}` : ""}`
  );

export const getChallenge = (id: string) =>
  fetcher<Challenge>(`/challenges/${id}`);

export const getLeaderboard = () =>
  fetcher<LeaderboardEntry[]>("/leaderboard");

export const getProgress = (address?: string) =>
  fetcher<UserProgress>(`/progress${address ? `?address=${address}` : ""}`);

export async function submitSolution(
  challengeId: string,
  address: string,
  signedXdr: string
) {
  const res = await fetch(`${BASE}/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ challengeId, address, signedXdr }),
  });
  if (!res.ok) throw new Error("Submission failed");
  return res.json();
}
