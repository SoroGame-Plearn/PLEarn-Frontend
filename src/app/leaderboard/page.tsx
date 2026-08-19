"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Trophy, ChevronLeft, ChevronRight } from "lucide-react";
import { getLeaderboardPaginated } from "@/lib/api";
import { LeaderboardSkeleton } from "@/components/Skeleton";
import ApiErrorDisplay from "@/components/ApiErrorDisplay";
import type { LeaderboardEntry } from "@/types";

const PAGE_SIZE = 20;

type LoadState = "loading" | "idle" | "error";

export default function LeaderboardPage() {
  // cursor stack: index 0 = first page (undefined), each push = next page cursor.
  const [cursorStack, setCursorStack] = useState<(string | undefined)[]>([undefined]);
  const [currentPageIdx, setCurrentPageIdx] = useState(0);

  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null | undefined>(undefined);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState<number | undefined>(undefined);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [error, setError] = useState<unknown>(null);

  const isFetchingRef = useRef(false);

  const fetchPage = useCallback(async (cursor: string | undefined) => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    setLoadState("loading");
    setError(null);

    try {
      const page = await getLeaderboardPaginated({ cursor, limit: PAGE_SIZE });
      setEntries(page.items);
      setNextCursor(page.nextCursor ?? null);
      setHasMore(page.hasMore);
      setTotal(page.total);
      setLoadState("idle");
    } catch (err) {
      setError(err);
      setLoadState("error");
    } finally {
      isFetchingRef.current = false;
    }
  }, []);

  // Fetch whenever the page index changes.
  useEffect(() => {
    fetchPage(cursorStack[currentPageIdx]);
  }, [currentPageIdx, cursorStack, fetchPage]);

  const goNext = () => {
    if (!nextCursor) return;
    const newStack = [...cursorStack];
    // Only push if we haven't been to this page before.
    if (currentPageIdx + 1 >= newStack.length) {
      newStack.push(nextCursor);
    }
    setCursorStack(newStack);
    setCurrentPageIdx((i) => i + 1);
  };

  const goPrev = () => {
    if (currentPageIdx === 0) return;
    setCurrentPageIdx((i) => i - 1);
  };

  const retry = () => {
    setError(null);
    fetchPage(cursorStack[currentPageIdx]);
  };

  const isFirstPage = currentPageIdx === 0;
  const startRank = currentPageIdx * PAGE_SIZE + 1;

  return (
    <div className="max-w-2xl mx-auto px-6 py-12">
      <div className="flex items-center gap-3 mb-8">
        <Trophy className="text-brand-light" size={28} />
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Leaderboard</h1>
        {total !== undefined && (
          <span className="ml-auto text-sm text-gray-400 dark:text-gray-500">{total} solvers</span>
        )}
      </div>

      {loadState === "loading" && <LeaderboardSkeleton count={PAGE_SIZE} />}

      {loadState === "error" && (
        <ApiErrorDisplay error={error} reset={retry} />
      )}

      {loadState === "idle" && entries.length === 0 && (
        <p className="text-center text-gray-400 dark:text-gray-500 mt-16">
          No leaderboard entries yet. Be the first to solve a challenge!
        </p>
      )}

      {loadState === "idle" && entries.length > 0 && (
        <>
          <div className="flex flex-col gap-3">
            {entries.map((entry, i) => {
              const rank = startRank + i;
              return (
                <div
                  key={entry.address}
                  className="flex items-center justify-between bg-white dark:bg-card border border-black/10 dark:border-white/5 rounded-xl px-5 py-4 shadow-sm dark:shadow-none"
                >
                  <div className="flex items-center gap-4">
                    <span
                      className={`text-lg font-bold w-6 text-center ${
                        rank === 1
                          ? "text-yellow-500 dark:text-yellow-400"
                          : rank === 2
                          ? "text-gray-500 dark:text-gray-300"
                          : rank === 3
                          ? "text-amber-600 dark:text-amber-600"
                          : "text-gray-400 dark:text-gray-500"
                      }`}
                    >
                      {rank}
                    </span>
                    <span className="font-mono text-sm text-gray-700 dark:text-gray-300">
                      {entry.address.slice(0, 6)}…{entry.address.slice(-4)}
                    </span>
                  </div>
                  <div className="flex items-center gap-6 text-sm">
                    <span className="text-gray-500 dark:text-gray-400">{entry.solved} solved</span>
                    <span className="text-brand-light font-semibold">
                      {entry.totalRewards} PLN
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination controls */}
          <div className="flex items-center justify-between mt-8">
            <button
              onClick={goPrev}
              disabled={isFirstPage}
              aria-label="Previous page"
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-black/10 dark:border-white/10 text-sm font-medium transition
                         disabled:opacity-30 disabled:cursor-not-allowed
                         enabled:hover:border-brand/50 enabled:hover:text-brand dark:enabled:hover:text-brand-light"
            >
              <ChevronLeft size={15} />
              Previous
            </button>

            <span className="text-xs text-gray-400 dark:text-gray-500">
              {startRank}–{startRank + entries.length - 1}
              {total !== undefined ? ` of ${total}` : ""}
            </span>

            <button
              onClick={goNext}
              disabled={!hasMore || !nextCursor}
              aria-label="Next page"
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-black/10 dark:border-white/10 text-sm font-medium transition
                         disabled:opacity-30 disabled:cursor-not-allowed
                         enabled:hover:border-brand/50 enabled:hover:text-brand dark:enabled:hover:text-brand-light"
            >
              Next
              <ChevronRight size={15} />
            </button>
          </div>

          {!hasMore && (
            <p className="text-center text-gray-400 dark:text-gray-600 text-xs mt-4">
              End of leaderboard
            </p>
          )}
        </>
      )}
    </div>
  );
}
