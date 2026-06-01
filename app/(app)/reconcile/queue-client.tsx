"use client";

import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useOptimistic, useState, useTransition } from "react";

import { acceptSuggestion, bulkAcceptSuggestions } from "@/app/actions/reconcile";

import {
  getConfidenceLevel,
  getSuggestionStatus,
  type ConfidenceLevel,
  type QueueItem,
  type SuggestionStatus,
} from "./data";

type Filter = "all" | "pending" | "accepted" | "overridden" | "no-suggestion";

type OptimisticItem = QueueItem & { optimisticStatus?: SuggestionStatus };

function formatAmount(cents: number | null): string {
  if (cents == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(Math.abs(cents) / 100);
}

function StatusPill({ status }: { status: SuggestionStatus }) {
  const map: Record<SuggestionStatus, { label: string; className: string }> = {
    pending: {
      label: "Pending",
      className: "bg-[var(--border)] text-[var(--text-secondary)]",
    },
    accepted: {
      label: "Accepted",
      className: "bg-[var(--income-bg)] text-[var(--income)]",
    },
    overridden: {
      label: "Overridden",
      className: "bg-[var(--income-bg)] text-[var(--income)]",
    },
    "no-suggestion": {
      label: "No suggestion",
      className: "bg-[var(--expense-bg)] text-[var(--expense)]",
    },
  };
  const { label, className } = map[status];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${className}`}
    >
      {label}
    </span>
  );
}

function SourceBadge({ source }: { source: "rule" | "ai" | null }) {
  if (!source) return null;
  return (
    <span className="ml-1 inline-flex items-center rounded-full border border-[var(--border)] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--text-muted)]">
      {source === "ai" ? "AI" : "Rule"}
    </span>
  );
}

function ConfidenceBadge({ level }: { level: ConfidenceLevel }) {
  const map: Record<ConfidenceLevel, string> = {
    high: "text-[var(--income)] bg-[var(--income-bg)]",
    medium: "text-[var(--text-secondary)] bg-[var(--border)]",
    low: "text-[var(--expense)] bg-[var(--expense-bg)]",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${map[level]}`}
    >
      {level.charAt(0).toUpperCase() + level.slice(1)}
    </span>
  );
}

function TransactionRow({
  item,
  isSelected,
  isCheckable,
  isChecked,
  onToggle,
  onAccept,
  isPending,
}: {
  item: OptimisticItem;
  isSelected: boolean;
  isCheckable: boolean;
  isChecked: boolean;
  onToggle: (matchId: string) => void;
  onAccept: (matchId: string) => void;
  isPending: boolean;
}) {
  const status = item.optimisticStatus ?? getSuggestionStatus(item.match);
  const isSpend = item.type === "SPEND" || item.type === "SPEND-TRANSFER";
  const confidenceLevel = getConfidenceLevel(item.match);
  const needsReview = !item.match || confidenceLevel === "low";

  return (
    <li
      className={`relative border-b border-[var(--border)] last:border-b-0 ${
        isSelected ? "bg-[var(--paper)]" : "bg-[var(--surface)]"
      } ${needsReview ? "border-l-2 border-l-[var(--expense)]" : ""}`}
    >
      <div className="flex items-start">
        {isCheckable && (
          <div className="flex shrink-0 items-center px-3 pt-3.5">
            <input
              aria-label="Select transaction"
              checked={isChecked}
              className="h-4 w-4 cursor-pointer accent-[var(--ink)]"
              onChange={() => onToggle(item.match!.id)}
              onClick={(e) => e.stopPropagation()}
              type="checkbox"
            />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <Link
            className={`block px-4 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ink)] ${
              !isCheckable ? "" : "pl-0"
            } ${status === "accepted" || status === "overridden" ? "opacity-60" : ""}`}
            href={`/reconcile/${item.id}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-[var(--text-primary)]">
                  {item.description ?? "(no description)"}
                </p>
                <p className="mt-0.5 text-xs text-[var(--text-muted)]">{item.date ?? "—"}</p>
              </div>
              <p
                className={`shrink-0 text-sm font-semibold tabular-nums ${
                  isSpend ? "text-[var(--expense)]" : "text-[var(--income)]"
                }`}
              >
                {isSpend ? "-" : "+"}
                {formatAmount(item.total_cents)}
              </p>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-2">
              <StatusPill status={status} />
              {confidenceLevel && <ConfidenceBadge level={confidenceLevel} />}
              {item.match && (
                <span className="flex items-center text-xs text-[var(--text-secondary)]">
                  {item.categoryCode ? `[${item.categoryCode}] ` : ""}
                  {item.categoryName ?? item.match.suggested_category_id ?? "—"}
                  <SourceBadge source={item.match.suggestion_source} />
                </span>
              )}
              {!item.match && (
                <span className="text-xs text-[var(--text-muted)]">No suggestion</span>
              )}
            </div>
          </Link>

          {item.match && status === "pending" && (
            <div className="px-4 pb-3">
              <button
                className="rounded-[var(--radius-button)] bg-[var(--ink)] px-3 py-1.5 text-xs font-medium text-white hover:bg-[var(--ink-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)] disabled:opacity-50"
                disabled={isPending}
                onClick={(e) => {
                  e.preventDefault();
                  onAccept(item.match!.id);
                }}
                type="button"
              >
                Accept
              </button>
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

export function QueueClient({
  items,
  selectedId,
}: {
  items: QueueItem[];
  selectedId?: string;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all");
  const [, startTransition] = useTransition();

  const [optimisticItems, applyOptimistic] = useOptimistic<
    OptimisticItem[],
    string | string[] // matchId(s) accepted
  >(items, (state, payload) => {
    const ids = Array.isArray(payload) ? payload : [payload];
    return state.map((item) =>
      item.match && ids.includes(item.match.id)
        ? {
            ...item,
            optimisticStatus: "accepted" as SuggestionStatus,
            match: {
              ...item.match,
              action_applied: true,
              accepted_at: new Date().toISOString(),
            },
          }
        : item,
    );
  });

  const [acceptingIds, setAcceptingIds] = useState<Set<string>>(new Set());
  const [selectedMatchIds, setSelectedMatchIds] = useState<Set<string>>(new Set());

  async function handleAccept(matchId: string) {
    setAcceptingIds((prev) => new Set(prev).add(matchId));
    startTransition(() => {
      applyOptimistic(matchId);
    });
    await acceptSuggestion(matchId);
    setAcceptingIds((prev) => {
      const next = new Set(prev);
      next.delete(matchId);
      return next;
    });
    router.refresh();
  }

  async function handleBulkAccept() {
    const ids = Array.from(selectedMatchIds);
    if (ids.length === 0) return;
    startTransition(() => {
      applyOptimistic(ids);
    });
    setSelectedMatchIds(new Set());
    await bulkAcceptSuggestions(ids);
    router.refresh();
  }

  function handleToggleCheckbox(matchId: string) {
    setSelectedMatchIds((prev) => {
      const next = new Set(prev);
      if (next.has(matchId)) {
        next.delete(matchId);
      } else {
        next.add(matchId);
      }
      return next;
    });
  }

  // Summary counts
  const total = optimisticItems.length;
  const withSuggestion = optimisticItems.filter((i) => i.match).length;
  const needAttention = optimisticItems.filter((i) => !i.match).length;

  const pendingCount = optimisticItems.filter((i) => {
    const s = i.optimisticStatus ?? getSuggestionStatus(i.match);
    return s === "pending";
  }).length;

  const acceptedCount = optimisticItems.filter((i) => {
    const s = i.optimisticStatus ?? getSuggestionStatus(i.match);
    return s === "accepted" || s === "overridden";
  }).length;

  // Filter
  const filtered = optimisticItems.filter((item) => {
    if (filter === "all") return true;
    const status = item.optimisticStatus ?? getSuggestionStatus(item.match);
    return status === filter;
  });

  const filterOptions: { value: Filter; label: string }[] = [
    { value: "all", label: "All" },
    { value: "pending", label: "Pending" },
    { value: "accepted", label: "Accepted" },
    { value: "overridden", label: "Overridden" },
    { value: "no-suggestion", label: "No suggestion" },
  ];

  return (
    <div className="flex h-full flex-col">
      {/* Summary bar */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 text-xs text-[var(--text-secondary)]">
        <button
          className="hover:text-[var(--text-primary)]"
          onClick={() => setFilter("all")}
          type="button"
        >
          <span className="font-semibold text-[var(--text-primary)]">{total}</span> unreconciled
        </button>
        <button
          className="hover:text-[var(--text-primary)]"
          onClick={() => setFilter("pending")}
          type="button"
        >
          <span className="font-semibold text-[var(--text-primary)]">{withSuggestion}</span> with
          suggestions
        </button>
        <button
          className="hover:text-[var(--text-primary)]"
          onClick={() => setFilter("no-suggestion")}
          type="button"
        >
          <span className="font-semibold text-[var(--expense)]">{needAttention}</span> need
          attention
        </button>
      </div>

      {/* Bulk toolbar */}
      {pendingCount > 0 && (
        <div className="flex items-center gap-2 border-b border-[var(--border)] bg-[var(--paper)] px-4 py-2 text-sm">
          <span className="text-[var(--text-secondary)]">{selectedMatchIds.size} selected</span>
          <button
            className="rounded-[var(--radius-button)] bg-[var(--ink)] px-3 py-1 text-xs font-medium text-white hover:bg-[var(--ink-hover)] disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)]"
            disabled={selectedMatchIds.size === 0}
            onClick={handleBulkAccept}
            type="button"
          >
            Approve{selectedMatchIds.size > 0 ? ` ${selectedMatchIds.size}` : ""} selected
          </button>
          {selectedMatchIds.size > 0 && (
            <button
              className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              onClick={() => setSelectedMatchIds(new Set())}
              type="button"
            >
              Clear
            </button>
          )}
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex items-center gap-1 overflow-x-auto border-b border-[var(--border)] bg-[var(--surface)] px-3 py-2">
        {filterOptions.map((opt) => (
          <button
            className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)] ${
              filter === opt.value
                ? "bg-[var(--ink)] text-white"
                : "text-[var(--text-secondary)] hover:bg-[var(--paper)] hover:text-[var(--text-primary)]"
            }`}
            key={opt.value}
            onClick={() => setFilter(opt.value)}
            type="button"
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-[var(--text-muted)]">
            No transactions match this filter.
          </p>
        ) : (
          <ul>
            {filtered.map((item) => {
              const itemStatus = item.optimisticStatus ?? getSuggestionStatus(item.match);
              const isCheckable = itemStatus === "pending" && item.match !== null;
              return (
                <TransactionRow
                  isCheckable={isCheckable}
                  isChecked={item.match !== null && selectedMatchIds.has(item.match.id)}
                  isSelected={item.id === selectedId}
                  isPending={Boolean(item.match && acceptingIds.has(item.match.id))}
                  item={item}
                  key={item.id}
                  onAccept={handleAccept}
                  onToggle={handleToggleCheckbox}
                />
              );
            })}
          </ul>
        )}
      </div>

      {/* Reconciliation handoff CTA */}
      {acceptedCount > 0 && (
        <div className="border-t border-[var(--border)] bg-[var(--surface)] px-4 py-3">
          <a
            className="flex items-center justify-between gap-2 rounded-[var(--radius-button)] bg-[var(--ink)] px-4 py-2.5 text-sm font-medium text-white hover:bg-[var(--ink-hover)]"
            href="https://go.xero.com/Bank/BankAccounts.aspx"
            rel="noreferrer"
            target="_blank"
          >
            <span>{acceptedCount} transactions accepted — ready to reconcile in Xero</span>
            <ExternalLink className="h-4 w-4 shrink-0" />
          </a>
        </div>
      )}
    </div>
  );
}
