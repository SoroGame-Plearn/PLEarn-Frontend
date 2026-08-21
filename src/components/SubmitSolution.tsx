"use client";

import { useRef, useState } from "react";
import { useWallet } from "@/context/WalletContext";
import { useRealtimeSubmissions } from "@/hooks/useRealtimeSubmissions";
import { ApiError, submitSolution } from "@/lib/api";
import { withRetry, type RetryState } from "@/lib/retry";
import { CheckCircle, Loader2, X } from "lucide-react";

const ERROR_COPY: Record<string, string> = {
  NETWORK_ERROR: "Couldn't reach the server. Check your connection and try again.",
  HTTP_ERROR: "The server rejected the submission.",
  PARSE_ERROR: "The server sent back an unreadable response.",
  VALIDATION_ERROR: "The server's response didn't match what we expected.",
};

/** Realtime lifecycle steps, in display order. */
const STATUS_STEPS: SubmissionStatus[] = [
  "pending",
  "validating",
  "accepted",
  "rewarded",
];

const STATUS_META: Record<
  SubmissionStatus,
  { label: string; description: string }
> = {
  pending: {
    label: "Pending",
    description: "Waiting for the backend to pick up your submission…",
  },
  validating: {
    label: "Validating",
    description: "Checking your solution against the challenge…",
  },
  accepted: {
    label: "Accepted",
    description: "Solution passed — broadcasting the transaction…",
  },
  rewarded: {
    label: "Rewarded",
    description: "Reward distributed to your wallet!",
  },
  rejected: {
    label: "Rejected",
    description: "Your solution did not pass validation.",
  },
};

const STEP_ICONS: Record<SubmissionStatus, typeof Clock> = {
  pending: Clock,
  validating: Loader2,
  accepted: CheckCircle2,
  rewarded: Coins,
  // The stepper never renders "rejected" (it has its own panel), but the
  // mapping is exhaustive to keep the type simple.
  rejected: XCircle,
};

const NETWORK =
  (process.env.NEXT_PUBLIC_STELLAR_NETWORK ?? "testnet") === "mainnet"
    ? "mainnet"
    : "testnet";

function explorerUrl(txHash: string): string {
  const base =
    NETWORK === "mainnet"
      ? "https://stellar.expert/explorer/public/tx"
      : "https://stellar.expert/explorer/testnet/tx";
  return `${base}/${txHash}`;
}

// ─── Status UI ────────────────────────────────────────────────────────────────

function SubmissionStatusCard({
  submission,
  status,
}: {
  submission: RealtimeSubmission;
  status: SubmissionStatus;
}) {
  const currentIdx = STATUS_STEPS.indexOf(status);

  return (
    <div className="bg-card border border-white/5 rounded-2xl p-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          {status === "rewarded" ? (
            <Coins size={22} className="text-brand-light shrink-0" />
          ) : (
            <Loader2 size={22} className="text-brand-light animate-spin shrink-0" />
          )}
          <div>
            <p className="font-semibold">{STATUS_META[status].label}</p>
            <p className="text-sm text-gray-400">{STATUS_META[status].description}</p>
          </div>
        </div>
        {status === "rewarded" && submission.reward !== undefined && (
          <span className="text-brand-light font-bold text-xl shrink-0">
            +{submission.reward} PLN
          </span>
        )}
      </div>

      {/* Stepper */}
      <ol className="flex flex-col gap-4">
        {STATUS_STEPS.map((step, i) => {
          const Icon = STEP_ICONS[step];
          const done = currentIdx > i;
          const active = currentIdx === i;
          return (
            <li key={step} className="flex items-center gap-3">
              <span
                className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center border shrink-0",
                  done
                    ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-400"
                    : active
                      ? "bg-brand/20 border-brand/50 text-brand-light"
                      : "bg-white/5 border-white/10 text-gray-500"
                )}
                aria-hidden="true"
              >
                {done ? (
                  <Check size={14} />
                ) : (
                  <Icon
                    size={14}
                    className={cn(active && step === "validating" && "animate-spin")}
                  />
                )}
              </span>
              <span
                className={cn(
                  "text-sm font-medium",
                  done || active ? "text-white" : "text-gray-500"
                )}
              >
                {STATUS_META[step].label}
              </span>
            </li>
          );
        })}
      </ol>

      {/* Transaction link once broadcast */}
      {submission.txHash && (
        <a
          href={explorerUrl(submission.txHash)}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-6 inline-flex items-center gap-1.5 font-mono text-xs text-gray-400 hover:text-brand-light transition"
        >
          View transaction {submission.txHash.slice(0, 8)}…{submission.txHash.slice(-6)} ↗
        </a>
      )}
    </div>
  );
}

function SubmissionRejectedCard({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col gap-4 bg-red-500/10 border border-red-500/20 rounded-2xl p-6 text-red-400">
      <div className="flex items-center gap-3">
        <XCircle size={20} className="shrink-0" />
        <div>
          <p className="font-semibold">Submission rejected</p>
          <p className="text-sm">{STATUS_META.rejected.description}</p>
        </div>
      </div>
      <button
        onClick={onRetry}
        className="self-start text-sm bg-red-500/20 hover:bg-red-500/30 transition px-4 py-2 rounded-xl font-semibold"
      >
        Try again
      </button>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function SubmitSolution({ challengeId }: { challengeId: string }) {
  const { address, connected, connect, signTx } = useWallet();
  const { submissions, mode } = useRealtimeSubmissions(challengeId);

  const [solution, setSolution] = useState("");
  const [phase, setPhase] = useState<"idle" | "submitting" | "tracking">("idle");
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const [fallbackStatus, setFallbackStatus] = useState<SubmissionStatus | null>(null);
  const [error, setError] = useState("");
  const [retryState, setRetryState] = useState<RetryState | null>(null);
  const [nextRetryCountdown, setNextRetryCountdown] = useState(0);
  const retryAbortRef = useRef<(() => void) | null>(null);

  // Live update for our submission (once POST /submit has returned an id).
  const live = submissionId
    ? submissions.find((s) => s.submissionId === submissionId)
    : undefined;
  const currentStatus: SubmissionStatus | undefined =
    live?.status ?? fallbackStatus ?? undefined;

  const fallbackSubmission: RealtimeSubmission | null = submissionId
    ? {
        submissionId,
        challengeId,
        status: fallbackStatus ?? "pending",
        timestamp: new Date().toISOString(),
      }
    : null;

  function reset() {
    setPhase("idle");
    setSubmissionId(null);
    setFallbackStatus(null);
    setError("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!connected || !address) return connect();
    setPhase("submitting");
    setError("");
    setRetryState(null);

    const submissionId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const submissionLog = {
      id: submissionId,
      timestamp: new Date().toISOString(),
      address,
      challengeId,
      attempts: 0,
      errors: [] as Array<{ attempt: number; error: string; code?: string; status?: number }>,
    };

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
            // Log retry attempt for debugging
            submissionLog.attempts = attempt;
            const errorLog = {
              attempt,
              error: error.message,
              code: error instanceof ApiError ? error.code : undefined,
              status: error instanceof ApiError ? error.status : undefined,
            };
            submissionLog.errors.push(errorLog);

            console.warn(
              `[SubmitSolution] Retry attempt ${attempt} of 3 (${submissionId})`,
              {
                challengeId,
                address: address?.slice(0, 8) + "...",
                error: error.message,
                code: errorLog.code,
                status: errorLog.status,
                waitMs: delay,
              }
            );

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

      // Log successful submission
      console.info(`[SubmitSolution] Submission successful (${submissionId})`, {
        challengeId,
        address: address?.slice(0, 8) + "...",
        successfulAttempt: submissionLog.attempts + 1,
        totalRetries: submissionLog.attempts,
        totalErrors: submissionLog.errors.length,
      });

      setStatus("success");
      setRetryState(null);
    } catch (err: unknown) {
      if (countdownInterval) clearInterval(countdownInterval);

      if (err instanceof Error && err.message === "Retry cancelled by user") {
        console.info(`[SubmitSolution] Submission cancelled by user (${submissionId})`, {
          challengeId,
          address: address?.slice(0, 8) + "...",
          attempts: submissionLog.attempts,
        });
        setStatus("idle");
        setError("Submission cancelled.");
        setRetryState((prev) =>
          prev ? { ...prev, isCancelled: true } : null
        );
        return;
      }

      // Log final submission failure
      if (err instanceof ApiError) {
        submissionLog.errors.push({
          attempt: submissionLog.attempts + 1,
          error: err.message,
          code: err.code,
          status: err.status,
        });

        console.error(`[SubmitSolution] Submission failed after ${submissionLog.attempts} retries (${submissionId})`, {
          challengeId,
          address: address?.slice(0, 8) + "...",
          totalAttempts: submissionLog.attempts + 1,
          errors: submissionLog.errors,
        });

        setError(ERROR_COPY[err.code] ?? err.message);
      } else {
        const errorMsg = err instanceof Error ? err.message : "Submission failed";
        submissionLog.errors.push({
          attempt: submissionLog.attempts + 1,
          error: errorMsg,
        });

        console.error(`[SubmitSolution] Unexpected error (${submissionId})`, {
          challengeId,
          address: address?.slice(0, 8) + "...",
          totalAttempts: submissionLog.attempts + 1,
          errors: submissionLog.errors,
        });

        setError(errorMsg);
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

  // ── Tracking view: live status stepper ──
  if (phase === "tracking") {
    return (
      <div className="flex items-center gap-3 bg-green-500/10 border border-green-500/20 rounded-2xl p-6 text-green-600 dark:text-green-400">
        <CheckCircle size={20} />
        <span className="font-semibold">Solution submitted! Reward is on its way.</span>
      </div>
    );
  }

  // ── Form view ──
  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <h2 className="font-semibold text-lg text-gray-900 dark:text-white">Submit Your Solution</h2>
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
