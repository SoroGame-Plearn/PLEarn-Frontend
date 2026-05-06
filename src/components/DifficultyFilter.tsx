"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

const filters = ["all", "beginner", "intermediate", "advanced"] as const;

export default function DifficultyFilter({ active }: { active: string }) {
  const pathname = usePathname();

  return (
    <div className="flex gap-2 flex-wrap">
      {filters.map((f) => (
        <Link
          key={f}
          href={f === "all" ? pathname : `${pathname}?difficulty=${f}`}
          className={cn(
            "text-sm px-4 py-1.5 rounded-full border transition capitalize",
            active === f
              ? "bg-brand border-brand text-white"
              : "border-white/10 text-gray-400 hover:border-brand-light hover:text-white"
          )}
        >
          {f}
        </Link>
      ))}
    </div>
  );
}
