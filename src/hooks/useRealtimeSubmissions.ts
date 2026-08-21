"use client";

import { useMemo } from "react";
import { useWallet } from "@/context/WalletContext";
import type { ConnectionStatus, RealtimeMode } from "@/lib/websocket";
import type { RealtimeSubmission } from "@/types";

export interface RealtimeSubmissionsResult {
  /** Submission updates, newest-first. Filtered to `challengeId` when given. */
  submissions: RealtimeSubmission[];
  /** The most recent update for `challengeId` (when provided). */
  latest: RealtimeSubmission | undefined;
  /** Health of the realtime transport. */
  status: ConnectionStatus;
  /** "ws" when live, "polling" when degraded. */
  mode: RealtimeMode;
  /** Last transport error (if any). */
  error: Error | null;
}

/**
 * Subscribe to live submission status updates.
 *
 * The WebSocket connection is owned by `WalletProvider` (see
 * `src/lib/websocket.ts`), which forwards every parsed, deduplicated update
 * into context state. This hook reads that feed and filters it for the caller,
 * so each consumer subscribes through React rather than holding its own socket
 * (no leaks, and the connection is shared across the app).
 *
 * When `challengeId` is provided, only submissions for that challenge are
 * returned and `latest` holds the most recent one.
 */
export function useRealtimeSubmissions(
  challengeId?: string
): RealtimeSubmissionsResult {
  const { realtime } = useWallet();

  const submissions = useMemo(() => {
    const all = Object.values(realtime.submissions);
    if (!challengeId) return all;
    return all.filter((s) => s.challengeId === challengeId);
  }, [realtime.submissions, challengeId]);

  const latest = useMemo(() => {
    if (!challengeId || submissions.length === 0) return undefined;
    // ISO-8601 strings sort lexicographically, i.e. chronologically.
    return [...submissions].sort((a, b) =>
      b.timestamp.localeCompare(a.timestamp)
    )[0];
  }, [submissions, challengeId]);

  return {
    submissions,
    latest,
    status: realtime.status,
    mode: realtime.mode,
    error: realtime.lastError,
  };
}
