import type { Difficulty } from "@/types";
import { cn } from "@/lib/utils";

const styles: Record<Difficulty, string> = {
  beginner: "bg-green-500/10 text-green-400 border-green-500/20",
  intermediate: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  advanced: "bg-red-500/10 text-red-400 border-red-500/20",
};

export default function DifficultyBadge({ difficulty }: { difficulty: Difficulty }) {
  return (
    <span
      className={cn(
        "text-xs font-semibold px-2 py-0.5 rounded-full border capitalize whitespace-nowrap",
        styles[difficulty]
      )}
    >
      {difficulty}
    </span>
  );
}
