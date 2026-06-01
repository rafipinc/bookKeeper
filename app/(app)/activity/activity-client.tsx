"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

import { loadMoreActivity } from "@/app/actions/activity";

import type { ActivityEvent } from "./data";

function formatRelative(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diffMs = now - then;
  const diffMinutes = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMs / 3_600_000);
  const diffDays = Math.floor(diffMs / 86_400_000);

  if (diffMinutes < 1) return "just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}

type Props = {
  initialEvents: ActivityEvent[];
};

export function ActivityClient({ initialEvents }: Props) {
  const [events, setEvents] = useState<ActivityEvent[]>(initialEvents);
  const [hasMore, setHasMore] = useState(initialEvents.length === 50);
  const [isPending, startTransition] = useTransition();

  function handleLoadMore() {
    const lastEvent = events[events.length - 1];
    if (!lastEvent) return;

    startTransition(async () => {
      const more = await loadMoreActivity(lastEvent.timestamp);
      if (more.length === 0) {
        setHasMore(false);
      } else {
        setEvents((prev) => {
          const existingIds = new Set(prev.map((e) => e.id));
          const newEvents = more.filter((e) => !existingIds.has(e.id));
          return [...prev, ...newEvents];
        });
        setHasMore(more.length === 50);
      }
    });
  }

  if (events.length === 0) {
    return (
      <section className="space-y-4">
        <h1 className="text-xl font-semibold">Activity</h1>
        <div className="bkp-card px-4 py-12 text-center">
          <p className="text-sm text-[var(--text-secondary)]">
            No activity yet. Approve some transactions or publish an invoice to see your history here.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <h1 className="text-xl font-semibold">Activity</h1>
      <div className="bkp-card overflow-hidden">
        <ul className="divide-y divide-[var(--border)]">
          {events.map((event) => (
            <li className="flex items-start gap-3 border-b border-[var(--border)] py-3 px-4 last:border-b-0" key={event.id}>
              <span className="w-20 shrink-0 text-xs text-[var(--text-muted)] pt-0.5">
                {formatRelative(event.timestamp)}
              </span>
              <span className="flex-1 text-sm text-[var(--text-primary)]">
                {event.label}
                {event.linkHref && event.linkLabel && (
                  <Link
                    className="ml-2 text-xs text-[var(--ink)] underline-offset-2 hover:underline"
                    href={event.linkHref}
                  >
                    {event.linkLabel}
                  </Link>
                )}
              </span>
            </li>
          ))}
        </ul>

        {hasMore && (
          <div className="border-t border-[var(--border)] px-4 py-3">
            <button
              className="text-sm text-[var(--ink)] hover:underline underline-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={isPending}
              onClick={handleLoadMore}
              type="button"
            >
              {isPending ? "Loading…" : "Load more"}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
