"use client";

import { useWallet } from "@/context/WalletContext";
import { WalletErrorNotice } from "@/components/WalletErrorBoundary";
import { Wallet } from "lucide-react";

export default function WalletButton() {
  const { address, connected, connecting, connect, disconnect, error, clearError } =
    useWallet();

  // Signing failures are surfaced next to the form that triggered them; the
  // navbar only owns connection problems.
  const connectError = error?.operation === "connect" ? error : null;

  return (
    <div className="relative">
      {connected && address ? (
        <button
          onClick={disconnect}
          className="flex items-center gap-2 text-sm border border-black/10 dark:border-white/10 hover:border-red-400 transition px-4 py-2 rounded-xl text-gray-600 dark:text-gray-300 hover:text-red-500 dark:hover:text-red-400"
        >
          <Wallet size={14} />
          {address.slice(0, 4)}…{address.slice(-4)}
        </button>
      ) : (
        <button
          onClick={connect}
          disabled={connecting}
          className="flex items-center gap-2 text-sm bg-brand hover:bg-brand-dark transition px-4 py-2 rounded-xl font-semibold text-white disabled:opacity-50"
        >
          <Wallet size={14} />
          {connecting ? "Connecting…" : "Connect Wallet"}
        </button>
      )}

      {connectError && (
        <div className="absolute right-0 top-full mt-2 w-72 z-50 bg-white dark:bg-card rounded-xl shadow-xl">
          <WalletErrorNotice
            error={connectError}
            onRetry={connect}
            onDismiss={clearError}
          />
        </div>
      )}
    </div>
  );
}
