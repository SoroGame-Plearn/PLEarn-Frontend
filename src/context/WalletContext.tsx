"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  realtimeConnection,
  type ConnectionStatus,
  type RealtimeMode,
} from "@/lib/websocket";
import { hashTransaction, walletClient } from "@/lib/wallet";
import { WalletError, toWalletError } from "@/lib/wallet-error";
import TransactionPreview, {
  type TxPreview,
} from "@/components/TransactionPreview";
import type { RealtimeSubmission } from "@/types";

/** Live submission feed state, wired to the WebSocket manager. */
export interface RealtimeState {
  /** Health of the realtime transport (ws or polling). */
  status: ConnectionStatus;
  /** "ws" when a live socket is in use, "polling" when degraded. */
  mode: RealtimeMode;
  /** Latest known update per submissionId. */
  submissions: Record<string, RealtimeSubmission>;
  /** Most recent transport error (if any). */
  lastError: Error | null;
}

interface WalletState {
  address: string | null;
  connected: boolean;
  connecting: boolean;
  /** True while a signature prompt (or its preview) is open. */
  signing: boolean;
  /** Last wallet failure, already normalised for display. */
  error: WalletError | null;
  /** Never rejects: failures land in `error` instead. */
  connect: () => Promise<void>;
  disconnect: () => void;
  /**
   * Signs `xdr`, optionally showing a preview the user must confirm first.
   * Rejects with a WalletError; the same error is mirrored into `error` so
   * the recovery UI can render it without the caller wiring anything up.
   */
  signTx: (xdr: string, preview?: TxPreview) => Promise<string>;
  clearError: () => void;
  /**
   * Full client-side recovery after a failed wallet operation: clears the
   * error, releases dedup bookkeeping, and closes any stale preview, so the
   * user can retry without reloading the page.
   */
  recover: () => void;
  /** Real-time submission status feed — see useRealtimeSubmissions(). */
  realtime: RealtimeState;
}

interface PendingPreview {
  preview: TxPreview;
  resolve: () => void;
  reject: (error: WalletError) => void;
}

const WalletContext = createContext<WalletState | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [connecting, setConnecting] = useState<boolean>(false);
  const [signing, setSigning] = useState<boolean>(false);
  const [error, setError] = useState<WalletError | null>(null);
  const [pendingPreview, setPendingPreview] = useState<PendingPreview | null>(
    null
  );
  const [realtime, setRealtime] = useState<RealtimeState>({
    status: realtimeConnection.getStatus(),
    mode: realtimeConnection.getMode(),
    submissions: {},
    lastError: null,
  });

  // Guards every state write behind an unmount check: a wallet prompt can
  // outlive the component that opened it.
  const mounted = useRef<boolean>(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Open the realtime feed whenever a wallet is connected; tear it down on
  // disconnect. The manager lives at module scope, so the connection survives
  // client-side page navigation.
  useEffect(() => {
    if (address) {
      realtimeConnection.connect(address);
    } else {
      realtimeConnection.disconnect();
      setRealtime((prev) => ({ ...prev, submissions: {}, lastError: null }));
    }
  }, [address]);

  // Forward manager events into React state. Every subscription is cleaned up
  // on unmount, so there are no leaked listeners.
  useEffect(() => {
    const offStatus = realtimeConnection.on("status", (status) => {
      setRealtime((prev) => ({ ...prev, status }));
    });
    const offMode = realtimeConnection.on("mode", (mode) => {
      setRealtime((prev) => ({ ...prev, mode }));
    });
    const offSubmission = realtimeConnection.on("submission", (submission) => {
      setRealtime((prev) => ({
        ...prev,
        submissions: {
          ...prev.submissions,
          [submission.submissionId]: submission,
        },
      }));
    });
    const offError = realtimeConnection.on("error", (error) => {
      setRealtime((prev) => ({ ...prev, lastError: error }));
    });

    return () => {
      offStatus();
      offMode();
      offSubmission();
      offError();
    };
  }, []);

  const connect = useCallback(async () => {
    setConnecting(true);
    setError(null);
    try {
      const publicKey = await walletClient.connect();
      if (mounted.current) setAddress(publicKey);
    } catch (err) {
      if (mounted.current) setError(toWalletError(err, "connect"));
    } finally {
      if (mounted.current) setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    setAddress(null);
    setError(null);
    walletClient.reset();
  }, []);

  const clearError = useCallback(() => setError(null), []);

  const recover = useCallback(() => {
    setError(null);
    setSigning(false);
    walletClient.reset();
    setPendingPreview((prev) => {
      prev?.reject(
        new WalletError("Preview dismissed during recovery", {
          code: "SIGN_REJECTED",
          operation: "sign",
        })
      );
      return null;
    });
  }, []);

  // Resolves once the user confirms the preview; rejects with SIGN_REJECTED
  // if they back out. Only one preview can be open, because the underlying
  // client only allows one signature prompt at a time anyway.
  const confirmPreview = useCallback((preview: TxPreview): Promise<void> => {
    return new Promise<void>((resolve, reject) => {
      setPendingPreview({ preview, resolve, reject });
    });
  }, []);

  const signTx = useCallback(
    async (xdr: string, preview?: TxPreview): Promise<string> => {
      setError(null);
      setSigning(true);
      try {
        if (preview) {
          const hash = await hashTransaction(xdr);
          await confirmPreview({ ...preview, txHash: hash });
        }
        return await walletClient.sign(xdr);
      } catch (err) {
        const walletError = toWalletError(err, "sign");
        if (mounted.current) setError(walletError);
        throw walletError;
      } finally {
        if (mounted.current) {
          setSigning(false);
          setPendingPreview(null);
        }
      }
    },
    [confirmPreview]
  );

  return (
    <WalletContext.Provider
      value={{
        address,
        connected: !!address,
        connecting,
        signing,
        error,
        connect,
        disconnect,
        signTx,
        clearError,
        recover,
        realtime,
      }}
    >
      {children}
      {pendingPreview && (
        <TransactionPreview
          preview={pendingPreview.preview}
          address={address}
          onConfirm={pendingPreview.resolve}
          onCancel={() =>
            pendingPreview.reject(
              new WalletError("Signature request was declined", {
                code: "SIGN_REJECTED",
                operation: "sign",
              })
            )
          }
        />
      )}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used inside WalletProvider");
  return ctx;
}
