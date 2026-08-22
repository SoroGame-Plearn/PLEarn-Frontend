"use client";

import { useRef, useState } from "react";
import { useWallet } from "@/context/WalletContext";
import { useRealtimeSubmissions } from "@/hooks/useRealtimeSubmissions";
import { WalletErrorNotice } from "@/components/WalletErrorBoundary";
import { ApiError, submitSolution } from "@/lib/api";
import { withRetry, type RetryState } from "@/lib/retry";
import {
  createSubmissionLog,
  logRetryAttempt,
  logSubmissionCancelled,
  logSubmissionFailure,
  logSubmissionSuccess,
} from "@/lib/submission-logger";
import { cn } from "@/lib/utils";
import type { RealtimeSubmission, SubmissionStatus } from "@/types";
import {
  Check,
  CheckCircle2,
  Clock,
  Coins,
  Loader2,
  X,
  XCircle,
} from "lucide-react";

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

// === Status UI

function SubmissionStatusCard({
  submission,
  status,
}: {
  submission: RealtimeSubmission;
  status: SubmissionStatus;
}) {
  const currentIdx = STATUS_STEPS.indexOf(status);

  return (
    <div className="bg-white dark:bg-card border border-black/10 dark:border-white/5 rounded-2xl p-6">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          {status === "rewarded" ? (
            <Coins size={22} className="text-brand-light shrink-0" />
          ) : (
            <Loader2 size={22} className="text-brand-light animate-spin shrink-0" />
          )}
          <div>
            <p className="font-semibold text-gray-900 dark:text-white">
              {STATUS_META[status].label}
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {STATUS_META[status].description}
            </p>
          </div>
        </div>
        {status === "rewarded" && submission.reward !== undefined && (
          <span className="text-brand-light font-bold text-xl shrink-0">
            +{submission.reward} PLN
          </span>
        )}
      </div>

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
                      : "bg-black/5 dark:bg-white/5 border-black/10 dark:border-white/10 text-gray-500"
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
                  done || active
                    ? "text-gray-900 dark:text-white"
                    : "text-gray-500"
                )}
              >
                {STATUS_META[step].label}
              </span>
            </li>
          );
        })}
      </ol>

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
    <div className="flex flex-col gap-4 bg-red-500/10 border border-red-500/20 rounded-2xl p-6 text-red-600 dark:text-red-400">
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

// === Main component

export default function SubmitSolution({
  challengeId,
  challengeTitle,
  reward,
}: {
  challengeId: string;
  challengeTitle?: string;
  reward?: number;
}) {
  const {
    address,
    connected,
    connect,
    signTx,
    signing,
    error: walletError,
    clearError,
    recover,
  } = useWallet();
  const { submissions } = useRealtimeSubmissions(challengeId);

  const [solution, setSolution] = useState<string>("");
  const [phase, setPhase] = useState<"idle" | "submitting" | "tracking">("idle");
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const [fallbackStatus, setFallbackStatus] = useState<SubmissionStatus | null>(
    null
  );
  const [error, setError] = useState<string>("");
  const [retryState, setRetryState] = useState<RetryState | null>(null);
  const [nextRetryCountdown, setNextRetryCountdown] = useState<number>(0);
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

  const busy = phase === "submitting" || signing;

  function reset() {
    setPhase("idle");
    setSubmissionId(null);
    setFallbackStatus(null);
    setError("");
    setRetryState(null);
    // Releases the signed-transaction dedup entry so the same solution can be
    // signed again after a failure, without a page reload.
    recover();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!connected || !address) return connect();

    setPhase("submitting");
    setError("");
    setRetryState(null);

    const log = createSubmissionLog(address, challengeId);
    const abortController = new AbortController();
    retryAbortRef.current = () => abortController.abort();
    let countdownInterval: ReturnType<typeof setInterval> | null = null;

    try {
      const signedXdr = await signTx(solution, {
        action: "Submit solution",
        challenge: challengeTitle,
        reward,
      });

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
          onRetry: (attempt, delay, err) => {
            log.attempts = attempt;
            log.errors.push({
              attempt,
              error: err.message,
              code: err instanceof ApiError ? err.code : undefined,
              status: err instanceof ApiError ? err.status : undefined,
            });
            logRetryAttempt(
              log.id,
              attempt,
              delay,
              {
                message: err.message,
                code: err instanceof ApiError ? err.code : undefined,
                status: err instanceof ApiError ? err.status : undefined,
              },
              { challengeId, address }
            );

            setRetryState({
              attempt,
              nextRetryIn: delay,
              isRetrying: true,
              isCancelled: false,
            });

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

      logSubmissionSuccess(
        log.id,
        log.attempts + 1,
        log.attempts,
        log.errors.length,
        { challengeId, address }
      );

      setSubmissionId(result.id);
      setFallbackStatus("pending");
      setPhase("tracking");
      setRetryState(null);
    } catch (err: unknown) {
      if (err instanceof Error && err.message === "Retry cancelled by user") {
        logSubmissionCancelled(log.id, log.attempts, { challengeId, address });
        setPhase("idle");
        setError("Submission cancelled.");
        setRetryState((prev) => (prev ? { ...prev, isCancelled: true } : null));
        return;
      }

      // Wallet failures already render through WalletErrorNotice, so only
      // API and unexpected failures need a message here.
      if (err instanceof ApiError) {
        log.errors.push({
          attempt: log.attempts + 1,
          error: err.message,
          code: err.code,
          status: err.status,
        });
        logSubmissionFailure(log.id, log.attempts + 1, log.errors, {
          challengeId,
          address,
        });
        setError(ERROR_COPY[err.code] ?? err.message);
      } else if (!walletError) {
        setError(err instanceof Error ? err.message : "Submission failed");
      }

      setPhase("idle");
      setRetryState(null);
    } finally {
      if (countdownInterval) clearInterval(countdownInterval);
      retryAbortRef.current = null;
    }
  }

  function handleCancelRetry() {
    retryAbortRef.current?.();
    retryAbortRef.current = null;
  }

  // ── Tracking view: live status stepper ──
  if (phase === "tracking" && fallbackSubmission) {
    if (currentStatus === "rejected") {
      return <SubmissionRejectedCard onRetry={reset} />;
    }
    return (
      <SubmissionStatusCard
        submission={live ?? fallbackSubmission}
        status={currentStatus ?? "pending"}
      />
    );
  }

  // ── Form view ──
  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <h2 className="font-semibold text-lg text-gray-900 dark:text-white">
        Submit Your Solution
      </h2>
      <textarea
        value={solution}
        onChange={(e) => setSolution(e.target.value)}
        placeholder="Paste your signed transaction XDR or solution hash…"
        rows={5}
        required
        disabled={busy}
        className="bg-white dark:bg-card border border-black/10 dark:border-white/10 focus:border-brand outline-none rounded-xl p-4 text-sm font-mono resize-none transition disabled:opacity-50 text-gray-900 dark:text-white"
      />

      {walletError && (
        <WalletErrorNotice
          error={walletError}
          onRetry={reset}
          onDismiss={clearError}
        />
      )}

      {retryState?.isRetrying && (
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Loader2 size={16} className="animate-spin text-blue-400" />
            <span className="text-sm text-blue-400">
              Retry attempt {retryState.attempt} of 3…
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-black/10 dark:bg-white/10 rounded-full h-1 overflow-hidden">
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

      {error && <p className="text-red-500 dark:text-red-400 text-sm">{error}</p>}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy}
          className="flex-1 flex items-center justify-center gap-2 bg-brand hover:bg-brand-dark transition px-6 py-3 rounded-xl font-semibold text-white disabled:opacity-50"
        >
          {busy && <Loader2 size={16} className="animate-spin" />}
          {!connected
            ? "Connect Wallet to Submit"
            : signing
              ? "Waiting for Freighter…"
              : "Submit Solution"}
        </button>

        {retryState?.isRetrying && (
          <button
            type="button"
            onClick={handleCancelRetry}
            className="flex items-center justify-center gap-2 bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 text-red-500 dark:text-red-400 px-4 py-3 rounded-xl font-semibold transition"
          >
            <X size={16} />
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
