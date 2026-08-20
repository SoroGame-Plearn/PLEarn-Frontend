import Link from "next/link";
import type { Challenge } from "@/types";
import DifficultyBadge from "./DifficultyBadge";
import { ArrowRight } from "lucide-react";

export default function ChallengeCard({ challenge }: { challenge: Challenge }) {
  return (
    <Link
      href={`/challenges/${challenge.id}`}
      className="group bg-white dark:bg-card border border-black/10 dark:border-white/5 hover:border-brand/40 transition rounded-2xl p-5 flex flex-col gap-3 shadow-sm dark:shadow-none"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-semibold leading-snug text-gray-900 dark:text-white group-hover:text-brand transition">
          {challenge.title}
        </h3>
        <DifficultyBadge difficulty={challenge.difficulty} />
      </div>
      <p className="text-gray-500 dark:text-gray-400 text-sm line-clamp-2">{challenge.description}</p>
      <div className="flex items-center justify-between mt-auto pt-2 border-t border-black/5 dark:border-white/5">
        <span className="text-brand-light font-bold text-sm">
          {challenge.reward} PLN
        </span>
        <ArrowRight
          size={14}
          className="text-gray-400 dark:text-gray-500 group-hover:text-brand-light transition"
        />
      </div>
    </Link>
  );
}
