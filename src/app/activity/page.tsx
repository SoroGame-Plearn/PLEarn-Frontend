"use client";

import { Activity } from "lucide-react";
import ActivityExplorer from "@/components/ActivityExplorer";
import { useWallet } from "@/context/WalletContext";

export default function ActivityPage() {
  const { address } = useWallet();

  return (
    <div className="max-w-3xl mx-auto px-6 py-12">
      <div className="flex items-center gap-3 mb-2">
        <Activity className="text-brand-light" size={28} />
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Activity Explorer</h1>
      </div>
      <p className="text-gray-500 dark:text-gray-400 mb-8">
        Browse your on-chain transaction history — challenge submissions, reward
        claims, and more.
      </p>
      <ActivityExplorer address={address ?? undefined} />
    </div>
  );
}
