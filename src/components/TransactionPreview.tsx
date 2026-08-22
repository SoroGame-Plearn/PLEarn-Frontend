"use client";

import { useEffect, useRef } from "react";
import { AlertTriangle, ShieldCheck, X } from "lucide-react";
import { MAINNET_PASSPHRASE, networkPassphrase } from "@/lib/wallet";

/** Everything shown to the user before a signature prompt is opened. */
export interface TxPreview {
  /** What the transaction does, e.g. "Submit solution". */
  action: string;
  /** Challenge title, when the transaction belongs to one. */
  challenge?: string;
  /** Reward in PLN, when the transaction earns one. */
  reward?: number;
  /** Human readable network fee, e.g. "0.00001 XLM". */
  fee?: string;
  /** Extra rows rendered verbatim under the standard ones. */
  details?: Array<{ label: string; value: string }>;
  /** SHA-256 of the XDR. Filled in by the wallet context. */
  txHash?: string;
}

const NETWORK_LABEL =
  networkPassphrase() === MAINNET_PASSPHRASE ? "Stellar mainnet" : "Stellar testnet";

const IS_MAINNET = networkPassphrase() === MAINNET_PASSPHRASE;

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 border-b border-black/5 dark:border-white/5 last:border-0">
      <span className="text-sm text-gray-500 dark:text-gray-400 shrink-0">{label}</span>
      <span className="text-sm font-medium text-gray-900 dark:text-white text-right break-all">
        {value}
      </span>
    </div>
  );
}

/**
 * Confirmation step shown before Freighter is ever asked for a signature.
 * The user has to see what they are about to sign, and can back out without
 * an extension popup appearing at all.
 */
export default function TransactionPreview({
  preview,
  address,
  onConfirm,
  onCancel,
}: {
  preview: TxPreview;
  address: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    confirmRef.current?.focus();
    // Escape must cancel: a modal the user cannot dismiss is how a hung
    // signing flow turns into a page reload.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="tx-preview-title"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-6"
    >
      <div className="w-full sm:max-w-md bg-white dark:bg-card border border-black/10 dark:border-white/10 rounded-t-2xl sm:rounded-2xl p-6 flex flex-col gap-4 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <ShieldCheck size={20} className="text-brand-light shrink-0" />
            <h2
              id="tx-preview-title"
              className="font-semibold text-lg text-gray-900 dark:text-white"
            >
              Confirm transaction
            </h2>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Cancel transaction"
            className="text-gray-400 hover:text-gray-600 dark:hover:text-white transition"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex flex-col">
          <Row label="Action" value={preview.action} />
          {preview.challenge && <Row label="Challenge" value={preview.challenge} />}
          {preview.reward !== undefined && (
            <Row label="Reward" value={`${preview.reward} PLN`} />
          )}
          <Row label="Network fee" value={preview.fee ?? "0.00001 XLM (estimated)"} />
          <Row label="Network" value={NETWORK_LABEL} />
          {address && (
            <Row label="Signer" value={`${address.slice(0, 6)}…${address.slice(-6)}`} />
          )}
          {preview.details?.map((detail) => (
            <Row key={detail.label} label={detail.label} value={detail.value} />
          ))}
          {preview.txHash && (
            <Row
              label="Transaction hash"
              value={`${preview.txHash.slice(0, 10)}…${preview.txHash.slice(-8)}`}
            />
          )}
        </div>

        {IS_MAINNET && (
          <p className="flex items-start gap-2 text-xs text-amber-600 dark:text-amber-400">
            <AlertTriangle size={14} className="shrink-0 mt-0.5" />
            This is a real mainnet transaction and cannot be undone once signed.
          </p>
        )}

        <p className="text-xs text-gray-500 dark:text-gray-400">
          Freighter will ask you to approve this. Plearn never sees your secret
          key, only the signed transaction.
        </p>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 border border-black/10 dark:border-white/10 hover:border-black/20 dark:hover:border-white/20 transition px-4 py-2.5 rounded-xl font-semibold text-sm text-gray-600 dark:text-gray-300"
          >
            Cancel
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            className="flex-1 bg-brand hover:bg-brand-dark transition px-4 py-2.5 rounded-xl font-semibold text-sm text-white"
          >
            Sign in Freighter
          </button>
        </div>
      </div>
    </div>
  );
}
