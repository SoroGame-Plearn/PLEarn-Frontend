"use client";

import { useState } from "react";
import { useWallet } from "@/context/WalletContext";
import { submitSolution } from "@/lib/api";
import { CheckCircle, Loader2 } from "lucide-react";

export default function SubmitSolution({ challengeId }: { challengeId: string }) {
  const { address, connected, connect, signTx } = useWallet();
  const [solution, setSolution] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!connected || !address) return connect();
    setStatus("loading");
    setError("");
    try {
      // In production, backend returns an unsigned XDR for the user to sign
      const signedXdr = await signTx(solution);
      await submitSolution(challengeId, address, signedXdr);
      setStatus("success");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Submission failed");
      setStatus("error");
    }
  }

  if (status === "success") {
    return (
      <div className="flex items-center gap-3 bg-green-500/10 border border-green-500/20 rounded-2xl p-6 text-green-400">
        <CheckCircle size={20} />
        <span className="font-semibold">Solution submitted! Reward is on its way.</span>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <h2 className="font-semibold text-lg">Submit Your Solution</h2>
      <textarea
        value={solution}
        onChange={(e) => setSolution(e.target.value)}
        placeholder="Paste your signed transaction XDR or solution hash…"
        rows={5}
        required
        className="bg-card border border-white/10 focus:border-brand outline-none rounded-xl p-4 text-sm font-mono resize-none transition"
      />
      {error && <p className="text-red-400 text-sm">{error}</p>}
      <button
        type="submit"
        disabled={status === "loading"}
        className="flex items-center justify-center gap-2 bg-brand hover:bg-brand-dark transition px-6 py-3 rounded-xl font-semibold disabled:opacity-50"
      >
        {status === "loading" && <Loader2 size={16} className="animate-spin" />}
        {connected ? "Submit Solution" : "Connect Wallet to Submit"}
      </button>
    </form>
  );
}
