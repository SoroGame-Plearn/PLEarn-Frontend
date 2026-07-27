"use client";

import { cn } from "@/lib/utils";

/** Animated shimmer bar — compose into skeleton layouts below. */
function Shimmer({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "bg-white/10 rounded animate-pulse",
        className
      )}
      aria-hidden="true"
    />
  );
}

/** Mimics a single ChallengeCard skeleton. */
export function ChallengeCardSkeleton() {
  return (
    <div className="bg-card border border-white/5 rounded-2xl p-5 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <Shimmer className="h-4 w-3/4" />
        <Shimmer className="h-5 w-20 rounded-full" />
      </div>
      <Shimmer className="h-3 w-full" />
      <Shimmer className="h-3 w-4/5" />
      <div className="flex items-center justify-between mt-auto pt-2 border-t border-white/5">
        <Shimmer className="h-4 w-16" />
        <Shimmer className="h-3 w-3" />
      </div>
    </div>
  );
}

/** Grid of N challenge card skeletons — used while first page is loading. */
export function ChallengeGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5 mt-8">
      {Array.from({ length: count }, (_, i) => (
        <ChallengeCardSkeleton key={i} />
      ))}
    </div>
  );
}

/** Mimics a single leaderboard row skeleton. */
export function LeaderboardRowSkeleton() {
  return (
    <div className="flex items-center justify-between bg-card border border-white/5 rounded-xl px-5 py-4">
      <div className="flex items-center gap-4">
        <Shimmer className="h-5 w-5" />
        <Shimmer className="h-4 w-32" />
      </div>
      <div className="flex items-center gap-6">
        <Shimmer className="h-4 w-16" />
        <Shimmer className="h-4 w-20" />
      </div>
    </div>
  );
}

/** Column of N leaderboard row skeletons — used while first page is loading. */
export function LeaderboardSkeleton({ count = 10 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: count }, (_, i) => (
        <LeaderboardRowSkeleton key={i} />
      ))}
    </div>
  );
}
