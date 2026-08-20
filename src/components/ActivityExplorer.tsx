"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ExternalLink,
  Download,
  ChevronLeft,
  ChevronRight,
  Filter,
  Activity,
} from "lucide-react";
import { getActivity } from "@/lib/api";
import { LeaderboardRowSkeleton } from "@/components/Skeleton";
import ApiErrorDisplay from "@/components/ApiErrorDisplay";
import type { ActivityFilter, ActivityItem, TxStatus, TxType } from "@/types";
import { cn } from "@/lib/utils";

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

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

// ─── Small helpers ────────────────────────────────────────────────────────────

function formatTs(iso: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

const TYPE_LABEL: Record<TxType, string> = {
  submit: "Submit",
  claim: "Claim",
  other: "Other",
};

const STATUS_COLOR: Record<TxStatus, string> = {
  confirmed: "text-emerald-600 dark:text-emerald-400",
  failed: "text-red-500 dark:text-red-400",
  pending: "text-yellow-600 dark:text-yellow-400",
};

const STATUS_DOT: Record<TxStatus, string> = {
  confirmed: "bg-emerald-500 dark:bg-emerald-400",
  failed: "bg-red-500 dark:bg-red-400",
  pending: "bg-yellow-500 dark:bg-yellow-400",
};

// ─── CSV export ───────────────────────────────────────────────────────────────

function escapeCell(value: string | number | undefined): string {
  const s = value == null ? "" : String(value);
  return `"${s.replace(/"/g, '""')}"`;
}

function buildCsv(items: ActivityItem[]): string {
  const header = [
    "ID",
    "Timestamp",
    "Type",
    "Status",
    "TX Hash",
    "Challenge ID",
    "Challenge Title",
    "Reward (PLN)",
    "Address",
  ].join(",");

  const rows = items.map((item) =>
    [
      escapeCell(item.id),
      escapeCell(item.timestamp),
      escapeCell(item.type),
      escapeCell(item.status),
      escapeCell(item.txHash),
      escapeCell(item.challengeId),
      escapeCell(item.challengeTitle),
      escapeCell(item.reward),
      escapeCell(item.address),
    ].join(",")
  );

  return [header, ...rows].join("\n");
}

function downloadCsv(items: ActivityItem[]): void {
  const csv = buildCsv(items);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `plearn-activity-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: TxStatus }) {
  return (
    <span className={cn("flex items-center gap-1.5 text-xs font-medium", STATUS_COLOR[status])}>
      <span className={cn("inline-block w-1.5 h-1.5 rounded-full", STATUS_DOT[status])} />
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

function TxRow({ item }: { item: ActivityItem }) {
  const short = `${item.txHash.slice(0, 8)}…${item.txHash.slice(-6)}`;
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between bg-white dark:bg-card border border-black/10 dark:border-white/5 rounded-xl px-5 py-4 gap-3 shadow-sm dark:shadow-none">
      {/* Left: type + challenge */}
      <div className="flex flex-col gap-0.5 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            {TYPE_LABEL[item.type]}
          </span>
          <StatusBadge status={item.status} />
        </div>
        {item.challengeTitle ? (
          <span className="text-sm text-gray-900 dark:text-white truncate">{item.challengeTitle}</span>
        ) : (
          <span className="text-sm text-gray-400 dark:text-gray-500 italic">—</span>
        )}
        <span className="text-xs text-gray-400 dark:text-gray-500">{formatTs(item.timestamp)}</span>
      </div>

      {/* Right: hash + reward */}
      <div className="flex sm:flex-col items-center sm:items-end gap-3 sm:gap-1 shrink-0">
        {item.reward > 0 && (
          <span className="text-brand-light font-bold text-sm">
            +{item.reward} PLN
          </span>
        )}
        <a
          href={explorerUrl(item.txHash)}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`View transaction ${item.txHash} on Stellar Explorer`}
          className="flex items-center gap-1 font-mono text-xs text-gray-400 hover:text-brand-light transition"
        >
          {short}
          <ExternalLink size={11} />
        </a>
      </div>
    </div>
  );
}

// ─── Filter bar ───────────────────────────────────────────────────────────────

interface FilterBarProps {
  filter: ActivityFilter;
  onChange: (f: ActivityFilter) => void;
}

function FilterBar({ filter, onChange }: FilterBarProps) {
  const set = (patch: Partial<ActivityFilter>) =>
    onChange({ ...filter, ...patch, cursor: undefined });

  return (
    <div className="flex flex-wrap items-end gap-3 mb-6">
      {/* Type filter */}
      <div className="flex flex-col gap-1">
        <label className="text-xs text-gray-500 dark:text-gray-400 font-medium">Type</label>
        <select
          value={filter.type ?? ""}
          onChange={(e) =>
            set({ type: (e.target.value as TxType) || undefined })
          }
          className="bg-gray-100 dark:bg-card border border-black/10 dark:border-white/10 rounded-lg px-3 py-1.5 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-brand/50"
        >
          <option value="">All types</option>
          <option value="submit">Submit</option>
          <option value="claim">Claim</option>
          <option value="other">Other</option>
        </select>
      </div>

      {/* Status filter */}
      <div className="flex flex-col gap-1">
        <label className="text-xs text-gray-500 dark:text-gray-400 font-medium">Status</label>
        <select
          value={filter.status ?? ""}
          onChange={(e) =>
            set({ status: (e.target.value as TxStatus) || undefined })
          }
          className="bg-gray-100 dark:bg-card border border-black/10 dark:border-white/10 rounded-lg px-3 py-1.5 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-brand/50"
        >
          <option value="">All statuses</option>
          <option value="confirmed">Confirmed</option>
          <option value="failed">Failed</option>
          <option value="pending">Pending</option>
        </select>
      </div>

      {/* Date from */}
      <div className="flex flex-col gap-1">
        <label className="text-xs text-gray-500 dark:text-gray-400 font-medium">From</label>
        <input
          type="date"
          value={filter.dateFrom ?? ""}
          onChange={(e) => set({ dateFrom: e.target.value || undefined })}
          className="bg-gray-100 dark:bg-card border border-black/10 dark:border-white/10 rounded-lg px-3 py-1.5 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-brand/50"
        />
      </div>

      {/* Date to */}
      <div className="flex flex-col gap-1">
        <label className="text-xs text-gray-500 dark:text-gray-400 font-medium">To</label>
        <input
          type="date"
          value={filter.dateTo ?? ""}
          onChange={(e) => set({ dateTo: e.target.value || undefined })}
          className="bg-gray-100 dark:bg-card border border-black/10 dark:border-white/10 rounded-lg px-3 py-1.5 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-brand/50"
        />
      </div>

      {/* Clear */}
      {(filter.type || filter.status || filter.dateFrom || filter.dateTo) && (
        <button
          onClick={() =>
            onChange({
              address: filter.address,
              cursor: undefined,
              limit: filter.limit,
            })
          }
          className="text-xs text-gray-400 hover:text-gray-900 dark:hover:text-white transition self-end pb-2"
        >
          Clear filters
        </button>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface ActivityExplorerProps {
  /** Pre-fill the address filter (e.g. pass the connected wallet address). */
  address?: string;
}

type LoadState = "loading" | "idle" | "error";

export default function ActivityExplorer({ address }: ActivityExplorerProps) {
  const [filter, setFilter] = useState<ActivityFilter>({
    address,
    limit: PAGE_SIZE,
  });

  // Cursor stack for Prev/Next navigation (same pattern as leaderboard).
  const [cursorStack, setCursorStack] = useState<(string | undefined)[]>([undefined]);
  const [pageIdx, setPageIdx] = useState(0);

  const [items, setItems] = useState<ActivityItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null | undefined>(undefined);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState<number | undefined>();
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [error, setError] = useState<unknown>(null);

  // All items collected across the current filter session for CSV export.
  const allItemsRef = useRef<ActivityItem[]>([]);

  const isFetchingRef = useRef(false);

  const fetchPage = useCallback(
    async (cursor: string | undefined, currentFilter: ActivityFilter) => {
      if (isFetchingRef.current) return;
      isFetchingRef.current = true;
      setLoadState("loading");
      setError(null);

      try {
        const page = await getActivity({ ...currentFilter, cursor });
        setItems(page.items);
        setNextCursor(page.nextCursor ?? null);
        setHasMore(page.hasMore);
        setTotal(page.total);
        setLoadState("idle");

        // Accumulate for CSV — clear on first page, append otherwise.
        if (!cursor) {
          allItemsRef.current = page.items;
        } else {
          const existing = new Set(allItemsRef.current.map((x) => x.id));
          const fresh = page.items.filter((x) => !existing.has(x.id));
          allItemsRef.current = [...allItemsRef.current, ...fresh];
        }
      } catch (err) {
        setError(err);
        setLoadState("error");
      } finally {
        isFetchingRef.current = false;
      }
    },
    []
  );

  // Fetch when page index or filter changes.
  useEffect(() => {
    fetchPage(cursorStack[pageIdx], filter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageIdx, cursorStack]);

  // When filter changes, reset pagination entirely.
  const applyFilter = useCallback(
    (newFilter: ActivityFilter) => {
      setFilter(newFilter);
      setCursorStack([undefined]);
      setPageIdx(0);
      allItemsRef.current = [];
      fetchPage(undefined, newFilter);
    },
    [fetchPage]
  );

  const goNext = () => {
    if (!nextCursor) return;
    const stack = [...cursorStack];
    if (pageIdx + 1 >= stack.length) stack.push(nextCursor);
    setCursorStack(stack);
    setPageIdx((i) => i + 1);
  };

  const goPrev = () => {
    if (pageIdx === 0) return;
    setPageIdx((i) => i - 1);
  };

  const retry = () => {
    setError(null);
    fetchPage(cursorStack[pageIdx], filter);
  };

  const handleExport = () => {
    if (allItemsRef.current.length === 0) return;
    downloadCsv(allItemsRef.current);
  };

  const startRank = pageIdx * PAGE_SIZE + 1;
  const isFirstPage = pageIdx === 0;
  const hasActiveFilter = !!(
    filter.type ||
    filter.status ||
    filter.dateFrom ||
    filter.dateTo
  );

  return (
    <div>
      {/* Header row */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-sm">
          <Filter size={14} />
          <span>Filters</span>
          {hasActiveFilter && (
            <span className="bg-brand/20 text-brand-light text-xs font-medium px-2 py-0.5 rounded-full">
              Active
            </span>
          )}
        </div>
        <button
          onClick={handleExport}
          disabled={allItemsRef.current.length === 0}
          className="flex items-center gap-1.5 text-sm px-4 py-2 rounded-xl border border-black/10 dark:border-white/10 transition
                     hover:border-brand/50 hover:text-brand dark:hover:text-brand-light disabled:opacity-30 disabled:cursor-not-allowed"
          aria-label="Export filtered activity to CSV"
        >
          <Download size={13} />
          Export CSV
        </button>
      </div>

      <FilterBar
        filter={filter}
        onChange={applyFilter}
      />

      {/* Loading skeleton */}
      {loadState === "loading" && (
        <div className="flex flex-col gap-3">
          {Array.from({ length: PAGE_SIZE }, (_, i) => (
            <LeaderboardRowSkeleton key={i} />
          ))}
        </div>
      )}

      {/* Error */}
      {loadState === "error" && (
        <ApiErrorDisplay error={error} reset={retry} />
      )}

      {/* Empty state */}
      {loadState === "idle" && items.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-16 text-gray-400 dark:text-gray-500">
          <Activity size={32} className="opacity-30" />
          <p className="text-sm">
            {hasActiveFilter
              ? "No transactions match your current filters."
              : "No on-chain activity found for this address."}
          </p>
          {hasActiveFilter && (
            <button
              onClick={() =>
                applyFilter({ address: filter.address, limit: PAGE_SIZE })
              }
              className="text-xs text-brand-light hover:underline"
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      {/* Transaction list */}
      {loadState === "idle" && items.length > 0 && (
        <>
          <div className="flex flex-col gap-3">
            {items.map((item) => (
              <TxRow key={item.id} item={item} />
            ))}
          </div>

          {/* Pagination controls */}
          <div className="flex items-center justify-between mt-8">
            <button
              onClick={goPrev}
              disabled={isFirstPage}
              aria-label="Previous page"
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-black/10 dark:border-white/10 text-sm font-medium transition
                         disabled:opacity-30 disabled:cursor-not-allowed
                         enabled:hover:border-brand/50 enabled:hover:text-brand dark:enabled:hover:text-brand-light"
            >
              <ChevronLeft size={15} />
              Previous
            </button>

            <span className="text-xs text-gray-400 dark:text-gray-500">
              {startRank}–{startRank + items.length - 1}
              {total !== undefined ? ` of ${total}` : ""}
            </span>

            <button
              onClick={goNext}
              disabled={!hasMore || !nextCursor}
              aria-label="Next page"
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-black/10 dark:border-white/10 text-sm font-medium transition
                         disabled:opacity-30 disabled:cursor-not-allowed
                         enabled:hover:border-brand/50 enabled:hover:text-brand dark:enabled:hover:text-brand-light"
            >
              Next
              <ChevronRight size={15} />
            </button>
          </div>

          {!hasMore && (
            <p className="text-center text-gray-400 dark:text-gray-600 text-xs mt-4">
              End of activity log
              {allItemsRef.current.length > 0 &&
                ` · ${allItemsRef.current.length} transaction${allItemsRef.current.length === 1 ? "" : "s"} loaded`}
            </p>
          )}
        </>
      )}
    </div>
  );
}
