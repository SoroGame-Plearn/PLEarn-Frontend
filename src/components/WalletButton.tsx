"use client";

import { useWallet } from "@/context/WalletContext";
import { Wallet } from "lucide-react";

export default function WalletButton() {
  const { address, connected, connecting, connect, disconnect } = useWallet();

  if (connected && address) {
    return (
      <button
        onClick={disconnect}
        className="flex items-center gap-2 text-sm border border-white/10 hover:border-red-400 transition px-4 py-2 rounded-xl text-gray-300 hover:text-red-400"
      >
        <Wallet size={14} />
        {address.slice(0, 4)}…{address.slice(-4)}
      </button>
    );
  }

  return (
    <button
      onClick={connect}
      disabled={connecting}
      className="flex items-center gap-2 text-sm bg-brand hover:bg-brand-dark transition px-4 py-2 rounded-xl font-semibold disabled:opacity-50"
    >
      <Wallet size={14} />
      {connecting ? "Connecting…" : "Connect Wallet"}
    </button>
  );
}
