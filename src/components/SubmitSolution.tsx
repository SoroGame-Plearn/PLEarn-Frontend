"use client";

import { useRef, useState } from "react";
import { useWallet } from "@/context/WalletContext";
import { ApiError, submitSolution } from "@/lib/api";
import { withRetry, type RetryState } from "@/lib/retry";
import { CheckCircle, Loader2, X } from "lucide-react";

const ERROR_COPY: Record<string, string> = {
  NETWORK_ERROR: "Couldn't reach the server. Check your connection and try again.",
  HTTP_ERROR: "The server rejected the submission.",
  PARSE_ERROR: "The server sent back an unreadable response.",
  VALIDATION_ERROR: "The server's response didn't match what we expected.",
};

export default function SubmitSolution({ challengeId }: { challengeId: string }) {
  const { address, connected, connect, signTx } = useWallet();
  const [solution, setSolution] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [error, setError] = useState("");
  const [retryState, setRetryState] = useState<RetryState | null>(null);
  const [nextRetryCountdown, setNextRetryCountdown] = useState(0);
  const retryAbortRef = useRef<(() => void) | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!connected || !address) return connect();
    setStatus("loading");
    setError("");
    setRetryState(null);

    try {
      const signedXdr = await signTx(solution);

      const abortController = new AbortController();
      retryAbortRef.current = () => {
        abortController.abort();
      };

      let countdownInterval: NodeJS.Timeout | null = null;

      const { result } = await withRetry(
        async () => {
          if (abortController.signal.aborted) {
            throw new Error("Retry cancelled by user");
          }
          return submitSolution(challengeId, address, signedXdr);
        },
        {
          maxRetries: 3,
          baseDelay: 1000,
          maxDelay: 30000,
          onRetry: (attempt, delay, error) => {
            const newRetryState: RetryState = {
              attempt,
              nextRetryIn: delay,
              isRetrying: true,
              isCancelled: false,
            };
            setRetryState(newRetryState);

            if (countdownInterval) clearInterval(countdownInterval);
            let remainingMs = delay;
            setNextRetryCountdown(Math.ceil(remainingMs / 1000));

            countdownInterval = setInterval(() => {
              remainingMs -= 100;
              if (remainingMs <= 0) {
                if (countdownInterval) clearInterval(countdownInterval);
              } else {
                setNextRetryCountdown(Math.ceil(remainingMs / 1000));
              }
            }, 100);
          },
        }
      );

      if (countdownInterval) clearInterval(countdownInterval);
      retryAbortRef.current = null;
      setStatus("success");
      setRetryState(null);
    } catch (err: unknown) {
      if (countdownInterval) clearInterval(countdownInterval);

      if (err instanceof Error && err.message === "Retry cancelled by user") {
        setStatus("idle");
        setError("Submission cancelled.");
        setRetryState((prev) =>
          prev ? { ...prev, isCancelled: true } : null
        );
        return;
      }

      if (err instanceof ApiError) {
        setError(ERROR_COPY[err.code] ?? err.message);
      } else {
        setError(err instanceof Error ? err.message : "Submission failed");
      }
      setStatus("error");
      setRetryState(null);
    }
  }

  function handleCancelRetry() {
    if (retryAbortRef.current) {
      retryAbortRef.current();
      retryAbortRef.current = null;
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
        disabled={status === "loading"}
        className="bg-card border border-white/10 focus:border-brand outline-none rounded-xl p-4 text-sm font-mono resize-none transition disabled:opacity-50"
      />

      {retryState && retryState.isRetrying && (
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Loader2 size={16} className="animate-spin text-blue-400" />
            <span className="text-sm text-blue-400">
              Retry attempt {retryState.attempt} of 4...
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-white/10 rounded-full h-1 overflow-hidden">
              <div
                className="bg-blue-500 h-full transition-all"
                style={{
                  width: `${Math.max(0, ((30000 - retryState.nextRetryIn) / 30000) * 100)}%`,
                }}
              />
            </div>
            <span className="text-xs text-blue-400 min-w-8 text-right">
              {nextRetryCountdown}s
            </span>
          </div>
        </div>
      )}

      {error && <p className="text-red-400 text-sm">{error}</p>}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={status === "loading"}
          className="flex-1 flex items-center justify-center gap-2 bg-brand hover:bg-brand-dark transition px-6 py-3 rounded-xl font-semibold disabled:opacity-50"
        >
          {status === "loading" && <Loader2 size={16} className="animate-spin" />}
          {connected ? "Submit Solution" : "Connect Wallet to Submit"}
        </button>

        {retryState && retryState.isRetrying && (
          <button
            type="button"
            onClick={handleCancelRetry}
            className="flex items-center justify-center gap-2 bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 text-red-400 px-4 py-3 rounded-xl font-semibold transition"
          >
            <X size={16} />
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
