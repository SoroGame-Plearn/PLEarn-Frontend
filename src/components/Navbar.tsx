"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useWallet } from "@/context/WalletContext";
import WalletButton from "./WalletButton";

const links = [
  { href: "/challenges", label: "Challenges" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/activity", label: "Activity" },
];

/**
 * Small dot + label showing the health of the real-time feed
 * (WebSocket connection status, degraded to polling, or offline).
 */
function RealtimeIndicator() {
  const { realtime } = useWallet();
  const { status, mode } = realtime;

  let dot = "bg-gray-500";
  let label = "Realtime offline";
  let title = "No real-time connection";
  let pulse = false;

  if (status === "error") {
    dot = "bg-red-400";
    label = "Realtime offline";
    title = "Real-time connection failed — updates via polling";
  } else if (mode === "polling") {
    dot = "bg-amber-400";
    label = "Polling updates";
    title = "Real-time feed unavailable — polling for updates";
    pulse = true;
  } else if (status === "connected") {
    dot = "bg-emerald-400";
    label = "Realtime live";
    title = "Connected — live submission updates";
    pulse = true;
  } else if (status === "reconnecting") {
    dot = "bg-amber-400";
    label = "Reconnecting…";
    title = "Connection lost — retrying with backoff";
    pulse = true;
  } else if (status === "connecting") {
    dot = "bg-sky-400";
    label = "Connecting…";
    title = "Establishing real-time connection";
    pulse = true;
  }

  return (
    <span
      role="status"
      aria-label={label}
      title={title}
      className="hidden sm:flex items-center gap-1.5 text-xs text-gray-400"
    >
      <span className={cn("w-2 h-2 rounded-full", dot, pulse && "animate-pulse")} />
      {label}
    </span>
  );
}

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
      <div className="flex items-center gap-4">
        <RealtimeIndicator />
        <WalletButton />
      </div>
    </nav>
  );
}
