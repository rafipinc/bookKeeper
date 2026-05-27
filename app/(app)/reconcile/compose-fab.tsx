"use client";

import { Plus, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

/**
 * Floating action button shown on the reconcile queue on mobile.
 * Opens a small compose sheet (Invoice / Bill).
 */
export function ComposeFAB() {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          aria-hidden
          className="fixed inset-0 z-30 bg-black/20 md:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Action sheet */}
      {open && (
        <div className="fixed bottom-20 right-4 z-40 flex flex-col gap-2 md:hidden">
          <Link
            className="flex items-center gap-2 rounded-[var(--radius-card)] bg-[var(--surface)] px-4 py-3 text-sm font-medium shadow-lg text-[var(--text-primary)] hover:bg-[var(--paper)]"
            href="/compose/invoice"
            onClick={() => setOpen(false)}
          >
            New invoice
          </Link>
          <Link
            className="flex items-center gap-2 rounded-[var(--radius-card)] bg-[var(--surface)] px-4 py-3 text-sm font-medium shadow-lg text-[var(--text-primary)] hover:bg-[var(--paper)]"
            href="/compose/bill"
            onClick={() => setOpen(false)}
          >
            New bill
          </Link>
        </div>
      )}

      {/* FAB button */}
      <button
        aria-label={open ? "Close compose menu" : "Open compose menu"}
        className="fixed bottom-20 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--ink)] text-white shadow-lg hover:bg-[var(--ink-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)] focus-visible:ring-offset-2 md:hidden"
        onClick={() => setOpen((v) => !v)}
        type="button"
      >
        {open ? <X className="h-6 w-6" /> : <Plus className="h-6 w-6" />}
      </button>
    </>
  );
}
