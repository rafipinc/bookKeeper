"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useOptimistic, useState, useTransition } from "react";

import { acceptSuggestion } from "@/app/actions/reconcile";

import { getSuggestionStatus, type QueueItem, type SuggestionStatus } from "./data";

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

function TransactionRow({
  item,
  isSelected,
  onAccept,
  isPending,
}: {
  item: OptimisticItem;
  isSelected: boolean;
  onAccept: (matchId: string) => void;
  isPending: boolean;
}) {
  const status = item.optimisticStatus ?? getSuggestionStatus(item.match);
  const isSpend = item.type === "SPEND" || item.type === "SPEND-TRANSFER";

  return (
    <li
      className={`relative border-b border-[var(--border)] last:border-b-0 ${
        isSelected ? "bg-[var(--paper)]" : "bg-[var(--surface)]"
      }`}
    >
      <Link
        className={`block px-4 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ink)] ${
          status === "accepted" || status === "overridden" ? "opacity-60" : ""
        }`}
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
    string // matchId accepted
  >(items, (state, matchId) =>
    state.map((item) =>
      item.match?.id === matchId
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
    ),
  );

  const [acceptingIds, setAcceptingIds] = useState<Set<string>>(new Set());

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

  // Summary counts
  const total = optimisticItems.length;
  const withSuggestion = optimisticItems.filter((i) => i.match).length;
  const needAttention = optimisticItems.filter((i) => !i.match).length;

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
            {filtered.map((item) => (
              <TransactionRow
                isSelected={item.id === selectedId}
                isPending={Boolean(item.match && acceptingIds.has(item.match.id))}
                item={item}
                key={item.id}
                onAccept={handleAccept}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
