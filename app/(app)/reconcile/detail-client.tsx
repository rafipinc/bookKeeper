"use client";

import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useOptimistic, useState, useTransition } from "react";

import { acceptSuggestion, overrideSuggestion } from "@/app/actions/reconcile";

import { getSuggestionStatus, type RawMatch } from "./data";

type DetailAccount = { xero_account_id: string; name: string; code: string | null };
type DetailContact = { xero_contact_id: string; name: string };

export type DetailTransaction = {
  id: string;
  description: string | null;
  date: string | null;
  total_cents: number | null;
  type: "SPEND" | "RECEIVE" | "SPEND-TRANSFER" | "RECEIVE-TRANSFER" | null;
  reference: string | null;
  bankAccountName: string | null;
  match: RawMatch | null;
  categoryName: string | null;
  categoryCode: string | null;
  contactName: string | null;
};

function formatAmount(cents: number | null): string {
  if (cents == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(Math.abs(cents) / 100);
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-xs text-[var(--text-muted)]">{label}</dt>
      <dd className="mt-0.5 text-sm text-[var(--text-primary)]">{value ?? "—"}</dd>
    </div>
  );
}

type OverrideFormProps = {
  matchId: string;
  initialCategoryId: string | null;
  initialContactId: string | null;
  accounts: DetailAccount[];
  contacts: DetailContact[];
  onCancel: () => void;
  onSaved: () => void;
};

function OverrideForm({
  matchId,
  initialCategoryId,
  initialContactId,
  accounts,
  contacts,
  onCancel,
  onSaved,
}: OverrideFormProps) {
  const [categoryId, setCategoryId] = useState(initialCategoryId ?? "");
  const [contactId, setContactId] = useState(initialContactId ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    setError(null);
    const result = await overrideSuggestion(matchId, {
      suggested_category_id: categoryId || null,
      suggested_contact_id: contactId || null,
    });
    setSaving(false);
    if (result.error) {
      setError(result.error);
    } else {
      onSaved();
    }
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <label className="block" htmlFor="override-category">
          <span className="text-xs font-medium text-[var(--text-secondary)]">Category</span>
          <select
            className="bkp-input mt-1 block w-full px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)]"
            id="override-category"
            onChange={(e) => setCategoryId(e.target.value)}
            value={categoryId}
          >
            <option value="">— None —</option>
            {accounts.map((a) => (
              <option key={a.xero_account_id} value={a.xero_account_id}>
                {a.code ? `[${a.code}] ` : ""}
                {a.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block" htmlFor="override-contact">
          <span className="text-xs font-medium text-[var(--text-secondary)]">Contact</span>
          <select
            className="bkp-input mt-1 block w-full px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)]"
            id="override-contact"
            onChange={(e) => setContactId(e.target.value)}
            value={contactId}
          >
            <option value="">— None —</option>
            {contacts.map((c) => (
              <option key={c.xero_contact_id} value={c.xero_contact_id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && <p className="text-xs text-[var(--expense)]">{error}</p>}

      <div className="flex items-center gap-2">
        <button
          className="rounded-[var(--radius-button)] bg-[var(--ink)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--ink-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)] disabled:opacity-50"
          disabled={saving}
          onClick={handleSave}
          type="button"
        >
          {saving ? "Saving…" : "Save override"}
        </button>
        <button
          className="rounded-[var(--radius-button)] px-4 py-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)]"
          onClick={onCancel}
          type="button"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

type OptimisticDetail = {
  match: RawMatch | null;
  status: ReturnType<typeof getSuggestionStatus>;
};

export function DetailClient({
  transaction,
  accounts,
  contacts,
}: {
  transaction: DetailTransaction;
  accounts: DetailAccount[];
  contacts: DetailContact[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [showOverride, setShowOverride] = useState(false);
  const [rawExpanded, setRawExpanded] = useState(false);

  const [optimistic, applyOptimistic] = useOptimistic<
    OptimisticDetail,
    "accepted" | "overridden"
  >(
    {
      match: transaction.match,
      status: getSuggestionStatus(transaction.match),
    },
    (state, action) => ({
      match: state.match
        ? {
            ...state.match,
            action_applied: true,
            accepted_at: new Date().toISOString(),
            override_at: action === "overridden" ? new Date().toISOString() : state.match.override_at,
          }
        : state.match,
      status: action,
    }),
  );

  const [accepting, setAccepting] = useState(false);

  const isSpend =
    transaction.type === "SPEND" || transaction.type === "SPEND-TRANSFER";

  async function handleAccept() {
    if (!transaction.match) return;
    setAccepting(true);
    startTransition(() => {
      applyOptimistic("accepted");
    });
    await acceptSuggestion(transaction.match.id);
    setAccepting(false);
    router.refresh();
  }

  async function handleOverrideSaved() {
    startTransition(() => {
      applyOptimistic("overridden");
    });
    setShowOverride(false);
    router.refresh();
  }

  return (
    <div className="flex h-full flex-col">
      {/* Mobile back nav */}
      <div className="flex h-12 items-center border-b border-[var(--border)] bg-[var(--surface)] px-4 md:hidden">
        <Link
          className="flex items-center gap-1 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          href="/reconcile"
        >
          <ChevronLeft className="h-4 w-4" />
          Queue
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        {/* Amount header */}
        <div className="mb-6">
          <p
            className={`text-3xl font-bold tabular-nums ${
              isSpend ? "text-[var(--expense)]" : "text-[var(--income)]"
            }`}
          >
            {isSpend ? "-" : "+"}
            {formatAmount(transaction.total_cents)}
          </p>
          <p className="mt-1 text-sm text-[var(--text-muted)]">{transaction.date ?? "—"}</p>
        </div>

        {/* Transaction facts */}
        <section aria-label="Transaction details" className="bkp-card mb-6 p-4">
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Description" value={transaction.description} />
            <Field label="Reference" value={transaction.reference} />
            <Field label="Bank account" value={transaction.bankAccountName} />
            <Field label="Type" value={transaction.type} />
          </dl>
        </section>

        {/* Suggestion block */}
        <section aria-label="Suggestion" className="bkp-card mb-6 p-4">
          <h2 className="mb-3 text-sm font-semibold text-[var(--text-primary)]">
            {optimistic.match ? "Suggested categorisation" : "No suggestion"}
          </h2>

          {optimistic.match && !showOverride && (
            <>
              <dl className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field
                  label="Category"
                  value={
                    transaction.categoryCode
                      ? `[${transaction.categoryCode}] ${transaction.categoryName}`
                      : (transaction.categoryName ?? optimistic.match.suggested_category_id)
                  }
                />
                <Field label="Contact" value={transaction.contactName} />
                <div>
                  <dt className="text-xs text-[var(--text-muted)]">Source</dt>
                  <dd className="mt-0.5 flex items-center gap-1 text-sm text-[var(--text-primary)]">
                    <span className="inline-flex items-center rounded-full border border-[var(--border)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--text-muted)]">
                      {optimistic.match.suggestion_source === "ai"
                        ? `AI${optimistic.match.ai_model ? ` · ${optimistic.match.ai_model}` : ""}`
                        : "Rule"}
                    </span>
                  </dd>
                </div>
                {optimistic.status !== "pending" && (
                  <div>
                    <dt className="text-xs text-[var(--text-muted)]">Status</dt>
                    <dd className="mt-0.5 text-sm capitalize text-[var(--income)]">
                      {optimistic.status}
                    </dd>
                  </div>
                )}
              </dl>

              {optimistic.status === "pending" && (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    className="rounded-[var(--radius-button)] bg-[var(--ink)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--ink-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)] disabled:opacity-50"
                    disabled={accepting}
                    onClick={handleAccept}
                    type="button"
                  >
                    {accepting ? "Accepting…" : "Accept"}
                  </button>
                  <button
                    className="rounded-[var(--radius-button)] border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--paper)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)]"
                    onClick={() => setShowOverride(true)}
                    type="button"
                  >
                    Override
                  </button>
                  <Link
                    className="rounded-[var(--radius-button)] px-4 py-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)]"
                    href="/reconcile"
                  >
                    Skip
                  </Link>
                </div>
              )}
            </>
          )}

          {optimistic.match && showOverride && (
            <OverrideForm
              accounts={accounts}
              contacts={contacts}
              initialCategoryId={optimistic.match.suggested_category_id}
              initialContactId={optimistic.match.suggested_contact_id}
              matchId={optimistic.match.id}
              onCancel={() => setShowOverride(false)}
              onSaved={handleOverrideSaved}
            />
          )}

          {!optimistic.match && (
            <p className="text-sm text-[var(--text-muted)]">
              No rule or AI suggestion is available for this transaction. Create a rule to
              auto-categorise similar transactions in the future.
            </p>
          )}
        </section>

        {/* Raw Xero data collapsible */}
        <section aria-label="Raw Xero data" className="bkp-card overflow-hidden">
          <button
            aria-controls="raw-xero-data"
            aria-expanded={rawExpanded}
            className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--paper)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ink)]"
            onClick={() => setRawExpanded((v) => !v)}
            type="button"
          >
            Raw Xero data
            <span aria-hidden className="text-xs">
              {rawExpanded ? "▲" : "▼"}
            </span>
          </button>
          {rawExpanded && (
            <div className="border-t border-[var(--border)] bg-[var(--paper)] px-4 py-3" id="raw-xero-data">
              <p className="text-xs text-[var(--text-muted)]">
                Raw JSON data is not included in this view. Open the transaction in Xero to see
                full details.
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
