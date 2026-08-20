import type { UserProgress } from "@/types";
import DifficultyBadge from "./DifficultyBadge";
import { Code2, Coins, Trophy } from "lucide-react";

export default function ProgressStats({ data }: { data: UserProgress }) {
  const stats = [
    { icon: Code2, label: "Challenges Solved", value: data.solved },
    { icon: Coins, label: "Total Earned", value: `${data.totalRewards} PLN` },
  ];

  return (
    <div className="flex flex-col gap-8">
      <div className="grid sm:grid-cols-2 gap-4">
        {stats.map(({ icon: Icon, label, value }) => (
          <div
            key={label}
            className="bg-white dark:bg-card border border-black/10 dark:border-white/5 rounded-2xl p-6 flex items-center gap-4 shadow-sm dark:shadow-none"
          >
            <Icon className="text-brand-light" size={28} />
            <div>
              <p className="text-gray-500 dark:text-gray-400 text-sm">{label}</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
            </div>
          </div>
        ))}
      </div>

      <div>
        <h2 className="font-semibold text-lg mb-4 flex items-center gap-2 text-gray-900 dark:text-white">
          <Trophy size={18} className="text-brand-light" /> Completed Challenges
        </h2>
        <div className="flex flex-col gap-3">
          {data.completedChallenges.map((c) => (
            <div
              key={c.id}
              className="flex items-center justify-between bg-white dark:bg-card border border-black/10 dark:border-white/5 rounded-xl px-5 py-3 shadow-sm dark:shadow-none"
            >
              <span className="font-medium text-gray-900 dark:text-white">{c.title}</span>
              <div className="flex items-center gap-3">
                <DifficultyBadge difficulty={c.difficulty} />
                <span className="text-brand-light text-sm font-semibold">
                  +{c.reward} PLN
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
