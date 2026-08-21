"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  ReactNode,
} from "react";
import {
  isConnected,
  getPublicKey,
  signTransaction,
} from "@stellar/freighter-api";
import {
  realtimeConnection,
  type ConnectionStatus,
  type RealtimeMode,
} from "@/lib/websocket";
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
  connect: () => Promise<void>;
  disconnect: () => void;
  signTx: (xdr: string) => Promise<string>;
  /** Real-time submission status feed — see useRealtimeSubmissions(). */
  realtime: RealtimeState;
}

const WalletContext = createContext<WalletState | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [realtime, setRealtime] = useState<RealtimeState>({
    status: realtimeConnection.getStatus(),
    mode: realtimeConnection.getMode(),
    submissions: {},
    lastError: null,
  });

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
    try {
      const connected = await isConnected();
      if (!connected) throw new Error("Freighter not installed");
      const pubkey = await getPublicKey();
      setAddress(pubkey);
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => setAddress(null), []);

  const signTx = useCallback(
    async (xdr: string) => {
      return signTransaction(xdr, {
        networkPassphrase:
          process.env.NEXT_PUBLIC_STELLAR_NETWORK === "mainnet"
            ? "Public Global Stellar Network ; September 2015"
            : "Test SDF Network ; September 2015",
      });
    },
    []
  );

  return (
    <WalletContext.Provider
      value={{
        address,
        connected: !!address,
        connecting,
        connect,
        disconnect,
        signTx,
        realtime,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used inside WalletProvider");
  return ctx;
}
