"use client";

import { ChevronDown, ChevronUp, Pencil, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { deleteRule, reorderRule, toggleRule } from "@/app/actions/rules";

type RuleCondition = {
  field: string;
  operator: string;
  value_json: unknown;
};

type RuleAction = {
  action_type: string;
  value_json: unknown;
};

export type RuleRow = {
  id: string;
  name: string;
  enabled: boolean;
  priority: number;
  rule_conditions: RuleCondition[];
  rule_actions: (RuleAction & { categoryName?: string })[];
};

function formatConditionSummary(conditions: RuleCondition[]): string {
  if (conditions.length === 0) return "No conditions";
  const first = conditions[0];
  const fieldLabel: Record<string, string> = {
    description: "Description",
    amount_cents: "Amount",
    contact_name: "Contact",
    reference: "Reference",
    xero_account_id: "Account",
    date: "Date",
  };
  const opLabel: Record<string, string> = {
    contains: "contains",
    equals: "equals",
    starts_with: "starts with",
    ends_with: "ends with",
    regex: "matches",
    gte: "≥",
    lte: "≤",
    between: "between",
    in: "in",
  };
  const field = fieldLabel[first.field] ?? first.field;
  const op = opLabel[first.operator] ?? first.operator;
  let val = "";
  if (
    first.value_json &&
    typeof first.value_json === "object" &&
    !Array.isArray(first.value_json) &&
    "v" in (first.value_json as Record<string, unknown>)
  ) {
    val = String((first.value_json as Record<string, unknown>).v ?? "");
  } else if (typeof first.value_json === "string" || typeof first.value_json === "number") {
    val = String(first.value_json);
  }

  const summary = val ? `${field} ${op} '${val}'` : `${field} ${op}`;
  const extra = conditions.length > 1 ? ` +${conditions.length - 1} more` : "";
  return summary + extra;
}

function formatActionSummary(actions: (RuleAction & { categoryName?: string })[]): string {
  const categoryAction = actions.find((a) => a.action_type === "set_category");
  if (categoryAction) {
    return `→ ${categoryAction.categoryName ?? "Category"}`;
  }
  if (actions.length > 0) {
    return `→ ${actions[0].action_type.replace("set_", "").replace("_", " ")}`;
  }
  return "→ (no action)";
}

function ConfirmDeleteDialog({
  ruleName,
  onConfirm,
  onCancel,
  pending,
}: {
  ruleName: string;
  onConfirm: () => void;
  onCancel: () => void;
  pending: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4">
      <div
        aria-modal="true"
        className="w-full max-w-md rounded-[var(--radius-modal)] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-lg"
        role="alertdialog"
      >
        <h2 className="text-lg font-semibold">Delete rule?</h2>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">
          &ldquo;{ruleName}&rdquo; will be archived and stop matching new transactions.
        </p>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            className="h-10 rounded-[var(--radius-button)] border border-[var(--border)] px-4 text-sm font-medium"
            disabled={pending}
            onClick={onCancel}
            type="button"
          >
            Cancel
          </button>
          <button
            className="h-10 rounded-[var(--radius-button)] bg-[var(--expense)] px-4 text-sm font-medium text-white disabled:opacity-60"
            disabled={pending}
            onClick={onConfirm}
            type="button"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

function RuleCard({
  rule,
  isFirst,
  isLast,
  onDeleted,
}: {
  rule: RuleRow;
  isFirst: boolean;
  isLast: boolean;
  onDeleted: () => void;
}) {
  const router = useRouter();
  const [togglePending, startToggle] = useTransition();
  const [reorderPending, startReorder] = useTransition();
  const [deletePending, startDelete] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);

  function handleToggle(enabled: boolean) {
    startToggle(async () => {
      await toggleRule(rule.id, enabled);
      router.refresh();
    });
  }

  function handleReorder(direction: "up" | "down") {
    startReorder(async () => {
      await reorderRule(rule.id, direction);
      router.refresh();
    });
  }

  function handleDelete() {
    startDelete(async () => {
      await deleteRule(rule.id);
      setConfirmDelete(false);
      onDeleted();
      router.refresh();
    });
  }

  return (
    <>
      {confirmDelete ? (
        <ConfirmDeleteDialog
          onCancel={() => setConfirmDelete(false)}
          onConfirm={handleDelete}
          pending={deletePending}
          ruleName={rule.name}
        />
      ) : null}
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-semibold text-[var(--text-primary)]">{rule.name}</span>
            {!rule.enabled ? (
              <span className="shrink-0 rounded-full border border-[var(--border)] px-2 py-0.5 text-xs text-[var(--text-muted)]">
                Disabled
              </span>
            ) : null}
          </div>
          <p className="mt-1 truncate text-sm text-[var(--text-secondary)]">
            {formatConditionSummary(rule.rule_conditions)}
            <span className="mx-2 text-[var(--text-muted)]">·</span>
            {formatActionSummary(rule.rule_actions)}
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          {/* Enable toggle */}
          <label className="flex cursor-pointer items-center gap-1.5 text-sm text-[var(--text-secondary)]">
            <span className="sr-only">{rule.enabled ? "Disable rule" : "Enable rule"}</span>
            <button
              aria-checked={rule.enabled}
              aria-label={rule.enabled ? "Disable rule" : "Enable rule"}
              className={`relative h-5 w-9 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)] ${
                rule.enabled ? "bg-[var(--ink)]" : "bg-[var(--border)]"
              } disabled:cursor-not-allowed disabled:opacity-50`}
              disabled={togglePending}
              onClick={() => handleToggle(!rule.enabled)}
              role="switch"
              type="button"
            >
              <span
                className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
                  rule.enabled ? "translate-x-4" : "translate-x-0.5"
                }`}
              />
            </button>
          </label>

          {/* Priority reorder */}
          <div className="flex flex-col">
            <button
              aria-label="Move rule up"
              className="flex h-5 w-6 items-center justify-center rounded-t text-[var(--text-muted)] hover:bg-[var(--paper)] hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-40"
              disabled={isFirst || reorderPending}
              onClick={() => handleReorder("up")}
              type="button"
            >
              <ChevronUp className="h-3 w-3" />
            </button>
            <button
              aria-label="Move rule down"
              className="flex h-5 w-6 items-center justify-center rounded-b text-[var(--text-muted)] hover:bg-[var(--paper)] hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-40"
              disabled={isLast || reorderPending}
              onClick={() => handleReorder("down")}
              type="button"
            >
              <ChevronDown className="h-3 w-3" />
            </button>
          </div>

          {/* Edit */}
          <button
            aria-label="Edit rule"
            className="inline-flex h-9 items-center gap-1.5 rounded-[var(--radius-button)] border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--paper)]"
            onClick={() => router.push(`/settings/rules/${rule.id}`)}
            type="button"
          >
            <Pencil className="h-3.5 w-3.5" />
            Edit
          </button>

          {/* Delete */}
          <button
            aria-label="Delete rule"
            className="inline-flex h-9 items-center gap-1.5 rounded-[var(--radius-button)] border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-medium text-[var(--expense)] hover:bg-[var(--expense-bg)]"
            onClick={() => setConfirmDelete(true)}
            type="button"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </button>
        </div>
      </div>
    </>
  );
}

export function RulesClient({ rules: initialRules }: { rules: RuleRow[] }) {
  const router = useRouter();
  const [rules, setRules] = useState(initialRules);

  function handleDeleted(id: string) {
    setRules((prev) => prev.filter((r) => r.id !== id));
  }

  if (rules.length === 0) {
    return (
      <div className="bkp-card flex flex-col items-center justify-center p-10 text-center">
        <p className="font-semibold text-[var(--text-primary)]">No rules yet.</p>
        <p className="mt-1 max-w-sm text-sm text-[var(--text-secondary)]">
          Add your first rule to start auto-categorising transactions.
        </p>
        <button
          className="bkp-button mt-5 inline-flex h-10 items-center px-4 text-sm"
          onClick={() => router.push("/settings/rules/new")}
          type="button"
        >
          Add rule
        </button>
      </div>
    );
  }

  return (
    <div className="bkp-card divide-y divide-[var(--border)] overflow-hidden">
      {rules.map((rule, index) => (
        <RuleCard
          isFirst={index === 0}
          isLast={index === rules.length - 1}
          key={rule.id}
          onDeleted={() => handleDeleted(rule.id)}
          rule={rule}
        />
      ))}
    </div>
  );
}
