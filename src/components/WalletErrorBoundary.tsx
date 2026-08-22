"use client";

import { Component, type ReactNode } from "react";
import { AlertTriangle, Download, RotateCw, X } from "lucide-react";
import {
  WALLET_ERROR_COPY,
  WalletError,
  isRecoverable,
  toWalletError,
} from "@/lib/wallet-error";
import { useWallet } from "@/context/WalletContext";

const FREIGHTER_URL = "https://www.freighter.app/";

/**
 * Inline recovery panel for a failed wallet operation. Every action it
 * offers is client side, so a user never has to reload the page to get back
 * to a working state.
 */
export function WalletErrorNotice({
  error,
  onRetry,
  onDismiss,
}: {
  error: WalletError;
  onRetry?: () => void;
  onDismiss?: () => void;
}) {
  const copy = WALLET_ERROR_COPY[error.code];
  const canRetry = !!onRetry && isRecoverable(error);

  return (
    <div
      role="alert"
      className="flex flex-col gap-3 bg-red-500/10 border border-red-500/20 rounded-xl p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <AlertTriangle size={16} className="text-red-500 dark:text-red-400 shrink-0 mt-0.5" />
          <div className="flex flex-col gap-1">
            <p className="text-sm text-red-600 dark:text-red-400">{copy}</p>
            <p className="text-xs font-mono text-red-500/70 dark:text-red-400/60">
              {error.code}
            </p>
          </div>
        </div>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss wallet error"
            className="text-red-500/70 hover:text-red-500 transition shrink-0"
          >
            <X size={14} />
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {error.code === "NOT_INSTALLED" && (
          <a
            href={FREIGHTER_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-sm bg-red-500/20 hover:bg-red-500/30 transition px-3 py-1.5 rounded-lg font-semibold text-red-600 dark:text-red-400"
          >
            <Download size={13} />
            Install Freighter
          </a>
        )}
        {canRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="flex items-center gap-1.5 text-sm bg-red-500/20 hover:bg-red-500/30 transition px-3 py-1.5 rounded-lg font-semibold text-red-600 dark:text-red-400"
          >
            <RotateCw size={13} />
            Try again
          </button>
        )}
      </div>
    </div>
  );
}

interface BoundaryProps {
  children: ReactNode;
  /** Runs before the subtree is re-rendered, to reset wallet-side state. */
  onReset: () => void;
}

interface BoundaryState {
  error: WalletError | null;
}

class Boundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { error: null };

  static getDerivedStateFromError(error: unknown): BoundaryState {
    return { error: toWalletError(error, "sign") };
  }

  reset = () => {
    this.props.onReset();
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      return (
        <WalletErrorNotice error={this.state.error} onRetry={this.reset} />
      );
    }
    return this.props.children;
  }
}

/**
 * Error boundary for subtrees that drive wallet operations. It catches the
 * render-time failures a plain try/catch around an async call cannot, and
 * routes recovery through the wallet context so dedup bookkeeping and stale
 * prompts are cleared alongside the UI.
 */
export default function WalletErrorBoundary({ children }: { children: ReactNode }) {
  const { recover } = useWallet();
  return <Boundary onReset={recover}>{children}</Boundary>;
}
