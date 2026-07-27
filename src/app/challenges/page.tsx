"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ChallengeCard from "@/components/ChallengeCard";
import DifficultyFilter from "@/components/DifficultyFilter";
import { ChallengeGridSkeleton, ChallengeCardSkeleton } from "@/components/Skeleton";
import ApiErrorDisplay from "@/components/ApiErrorDisplay";
import { getChallengesPaginated } from "@/lib/api";
import type { Challenge } from "@/types";
import { useSearchParams } from "next/navigation";

const PAGE_SIZE = 20;

type LoadState = "idle" | "loading" | "loadingMore" | "error";

export default function ChallengesPage() {
  const searchParams = useSearchParams();
  const difficulty = searchParams.get("difficulty") ?? "all";

  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [cursor, setCursor] = useState<string | null | undefined>(undefined);
  const [hasMore, setHasMore] = useState(true);
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [error, setError] = useState<unknown>(null);

  // Sentinel div at the bottom of the list — Intersection Observer watches it.
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  // Prevent multiple simultaneous fetches.
  const isFetchingRef = useRef(false);

  /** Load the next page. On first call cursor is undefined (first page). */
  const loadMore = useCallback(async (nextCursor: string | null | undefined) => {
    // nextCursor === null means "no more pages"
    if (isFetchingRef.current || nextCursor === null) return;
    isFetchingRef.current = true;
    setLoadState((s) => (s === "idle" ? "loading" : "loadingMore"));
    setError(null);

    try {
      const page = await getChallengesPaginated({
        cursor: nextCursor ?? undefined,
        limit: PAGE_SIZE,
        difficulty,
      });

      setChallenges((prev) => {
        // Deduplicate by id — protects against duplicate cursors / StrictMode double-invocation.
        const existingIds = new Set(prev.map((c) => c.id));
        const fresh = page.items.filter((c) => !existingIds.has(c.id));
        return [...prev, ...fresh];
      });
      setCursor(page.nextCursor ?? null);
      setHasMore(page.hasMore);
      setLoadState("idle");
    } catch (err) {
      setError(err);
      setLoadState("error");
    } finally {
      isFetchingRef.current = false;
    }
  }, [difficulty]);

  // Reset and reload whenever difficulty filter changes.
  useEffect(() => {
    setChallenges([]);
    setCursor(undefined);
    setHasMore(true);
    setLoadState("idle");
    setError(null);
    isFetchingRef.current = false;
    loadMore(undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [difficulty]);

  // Intersection Observer — fires loadMore when sentinel scrolls into view.
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (
          entries[0].isIntersecting &&
          hasMore &&
          loadState === "idle" &&
          !isFetchingRef.current
        ) {
          loadMore(cursor);
        }
      },
      { rootMargin: "200px" }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [cursor, hasMore, loadMore, loadState]);

  const isFirstLoad = loadState === "loading" && challenges.length === 0;

  return (
    <div className="max-w-5xl mx-auto px-6 py-12">
      <h1 className="text-3xl font-bold mb-2">Challenges</h1>
      <p className="text-gray-400 mb-8">
        Pick a challenge, write your solution, and earn PLN tokens.
      </p>

      <DifficultyFilter active={difficulty} />

      {/* First-load skeleton */}
      {isFirstLoad && <ChallengeGridSkeleton count={PAGE_SIZE} />}

      {/* Error on first load (no items yet) */}
      {loadState === "error" && challenges.length === 0 && (
        <ApiErrorDisplay
          error={error}
          reset={() => {
            setError(null);
            setLoadState("idle");
            loadMore(cursor);
          }}
        />
      )}

      {/* Challenge grid */}
      {challenges.length > 0 && (
        <>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5 mt-8">
            {challenges.map((c) => (
              <ChallengeCard key={c.id} challenge={c} />
            ))}

            {/* Inline skeletons appended during "load more" */}
            {loadState === "loadingMore" &&
              Array.from({ length: 3 }, (_, i) => (
                <ChallengeCardSkeleton key={`skel-${i}`} />
              ))}
          </div>

          {/* Error mid-pagination — inline retry */}
          {loadState === "error" && (
            <div className="mt-6 flex flex-col items-center gap-3 text-sm text-gray-400">
              <span>Failed to load the next page.</span>
              <button
                onClick={() => {
                  setError(null);
                  setLoadState("idle");
                  loadMore(cursor);
                }}
                className="bg-brand hover:bg-brand-dark transition px-4 py-2 rounded-xl font-semibold text-sm text-white"
              >
                Retry
              </button>
            </div>
          )}
        </>
      )}

      {/* Empty state */}
      {!isFirstLoad && loadState !== "error" && challenges.length === 0 && (
        <p className="text-gray-500 text-center mt-16">
          No challenges found{difficulty !== "all" ? ` for difficulty "${difficulty}"` : ""}.
        </p>
      )}

      {/* End-of-list message */}
      {!hasMore && challenges.length > 0 && loadState !== "error" && (
        <p className="text-center text-gray-600 text-sm mt-8">
          You&apos;ve seen all {challenges.length} challenge
          {challenges.length === 1 ? "" : "s"}.
        </p>
      )}

      {/* Invisible sentinel for the Intersection Observer */}
      <div ref={sentinelRef} className="h-1" aria-hidden="true" />
    </div>
  );
}
