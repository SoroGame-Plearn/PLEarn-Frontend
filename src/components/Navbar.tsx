"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import WalletButton from "./WalletButton";

const links = [
  { href: "/challenges", label: "Challenges" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/dashboard", label: "Dashboard" },
];

export default function Navbar() {
  const pathname = usePathname();

  return (
    <nav className="border-b border-white/5 px-6 py-4 flex items-center justify-between">
      <Link href="/" className="font-extrabold text-xl tracking-tight">
        P<span className="text-brand-light">learn</span>
      </Link>
      <div className="hidden md:flex items-center gap-6">
        {links.map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "text-sm transition",
              pathname.startsWith(href)
                ? "text-white font-semibold"
                : "text-gray-400 hover:text-white"
            )}
          >
            {label}
          </Link>
        ))}
      </div>
      <WalletButton />
    </nav>
  );
}
