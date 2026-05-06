export const dynamic = "force-dynamic";

import { getLeaderboard } from "@/lib/api";
import { Trophy } from "lucide-react";

export default async function LeaderboardPage() {
  const entries = await getLeaderboard();

  return (
    <div className="max-w-2xl mx-auto px-6 py-12">
      <div className="flex items-center gap-3 mb-8">
        <Trophy className="text-brand-light" size={28} />
        <h1 className="text-3xl font-bold">Leaderboard</h1>
      </div>
      <div className="flex flex-col gap-3">
        {entries.map((entry, i) => (
          <div
            key={entry.address}
            className="flex items-center justify-between bg-card border border-white/5 rounded-xl px-5 py-4"
          >
            <div className="flex items-center gap-4">
              <span
                className={`text-lg font-bold w-6 text-center ${
                  i === 0
                    ? "text-yellow-400"
                    : i === 1
                    ? "text-gray-300"
                    : i === 2
                    ? "text-amber-600"
                    : "text-gray-500"
                }`}
              >
                {i + 1}
              </span>
              <span className="font-mono text-sm text-gray-300">
                {entry.address.slice(0, 6)}…{entry.address.slice(-4)}
              </span>
            </div>
            <div className="flex items-center gap-6 text-sm">
              <span className="text-gray-400">
                {entry.solved} solved
              </span>
              <span className="text-brand-light font-semibold">
                {entry.totalRewards} PLN
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
