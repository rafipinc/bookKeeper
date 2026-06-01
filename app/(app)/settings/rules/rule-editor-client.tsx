"use client";

import { AlertCircle, CheckCircle2, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { saveRule, testRule, type DraftCondition, type RuleSaveInput, type TestRuleMatch } from "@/app/actions/rules";
import type { Json } from "@/lib/supabase/types";

type ConditionField = DraftCondition["field"];
type ConditionOperator = DraftCondition["operator"];

export type XeroAccount = {
  xero_account_id: string;
  name: string;
  type: string | null;
  class: string | null;
};

export type ExistingRule = {
  id: string;
  name: string;
  enabled: boolean;
  rule_conditions: {
    id: string;
    group_id: number;
    field: ConditionField;
    operator: ConditionOperator;
    value_json: Json;
  }[];
  rule_actions: {
    id: string;
    action_type: string;
    value_json: Json;
  }[];
};

type DraftConditionLocal = {
  _key: string;
  group_id: number;
  field: ConditionField;
  operator: ConditionOperator;
  value: string;
  valueBetweenMin: string;
  valueBetweenMax: string;
};

const FIELD_OPTIONS: { value: ConditionField; label: string }[] = [
  { value: "description", label: "Description" },
  { value: "amount_cents", label: "Amount (cents)" },
  { value: "contact_name", label: "Contact name" },
  { value: "reference", label: "Reference" },
];

const TEXT_OPERATORS: { value: ConditionOperator; label: string }[] = [
  { value: "contains", label: "contains" },
  { value: "equals", label: "equals" },
  { value: "starts_with", label: "starts with" },
  { value: "ends_with", label: "ends with" },
  { value: "regex", label: "matches regex" },
];

const NUMBER_OPERATORS: { value: ConditionOperator; label: string }[] = [
  { value: "equals", label: "equals" },
  { value: "gte", label: "≥ (at least)" },
  { value: "lte", label: "≤ (at most)" },
  { value: "between", label: "between" },
];

function isNumberField(field: ConditionField): boolean {
  return field === "amount_cents";
}

function getOperatorsForField(field: ConditionField): { value: ConditionOperator; label: string }[] {
  return isNumberField(field) ? NUMBER_OPERATORS : TEXT_OPERATORS;
}

function defaultOperatorForField(field: ConditionField): ConditionOperator {
  return isNumberField(field) ? "gte" : "contains";
}

let conditionKey = 0;
function nextKey(): string {
  return `c-${++conditionKey}`;
}

function buildValueJson(
  field: ConditionField,
  operator: ConditionOperator,
  value: string,
  valueBetweenMin: string,
  valueBetweenMax: string,
): Json {
  if (operator === "between") {
    return {
      min: isNumberField(field) ? Number(valueBetweenMin) : valueBetweenMin,
      max: isNumberField(field) ? Number(valueBetweenMax) : valueBetweenMax,
    };
  }
  if (isNumberField(field)) {
    return { v: Number(value) };
  }
  return { v: value };
}

function parseValueFromJson(
  field: ConditionField,
  operator: ConditionOperator,
  valueJson: Json,
): { value: string; valueBetweenMin: string; valueBetweenMax: string } {
  if (operator === "between" && valueJson && typeof valueJson === "object" && !Array.isArray(valueJson)) {
    const obj = valueJson as Record<string, unknown>;
    return {
      value: "",
      valueBetweenMin: String(obj.min ?? ""),
      valueBetweenMax: String(obj.max ?? ""),
    };
  }
  const extracted =
    valueJson && typeof valueJson === "object" && !Array.isArray(valueJson) && "v" in valueJson
      ? (valueJson as Record<string, unknown>).v
      : valueJson;
  return {
    value: extracted !== null && extracted !== undefined ? String(extracted) : "",
    valueBetweenMin: "",
    valueBetweenMax: "",
  };
}

function formatCents(cents: number | null): string {
  if (cents === null) return "-";
  const dollars = cents / 100;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(dollars);
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "-";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(dateStr));
}

export function RuleEditorClient({
  existingRule,
  accounts,
}: {
  existingRule?: ExistingRule;
  accounts: XeroAccount[];
}) {
  const router = useRouter();
  const [savePending, startSave] = useTransition();
  const [testPending, startTest] = useTransition();

  const [name, setName] = useState(existingRule?.name ?? "");
  const [enabled, setEnabled] = useState(existingRule?.enabled ?? true);
  const [categoryAccountId, setCategoryAccountId] = useState<string>(() => {
    const cat = existingRule?.rule_actions.find((a) => a.action_type === "set_category");
    if (!cat) return "";
    const vj = cat.value_json;
    const v =
      vj && typeof vj === "object" && !Array.isArray(vj) && "v" in vj
        ? (vj as Record<string, unknown>).v
        : vj;
    return typeof v === "string" ? v : "";
  });

  const [conditions, setConditions] = useState<DraftConditionLocal[]>(() => {
    if (!existingRule || existingRule.rule_conditions.length === 0) {
      return [
        {
          _key: nextKey(),
          group_id: 0,
          field: "description",
          operator: "contains",
          value: "",
          valueBetweenMin: "",
          valueBetweenMax: "",
        },
      ];
    }
    return existingRule.rule_conditions.map((c) => {
      const parsed = parseValueFromJson(c.field, c.operator, c.value_json);
      return {
        _key: nextKey(),
        group_id: c.group_id,
        field: c.field,
        operator: c.operator,
        ...parsed,
      };
    });
  });

  const [testResults, setTestResults] = useState<TestRuleMatch[] | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function addCondition() {
    setConditions((prev) => [
      ...prev,
      {
        _key: nextKey(),
        group_id: 0,
        field: "description",
        operator: "contains",
        value: "",
        valueBetweenMin: "",
        valueBetweenMax: "",
      },
    ]);
  }

  function removeCondition(key: string) {
    setConditions((prev) => prev.filter((c) => c._key !== key));
  }

  function updateCondition(key: string, updates: Partial<DraftConditionLocal>) {
    setConditions((prev) =>
      prev.map((c) => {
        if (c._key !== key) return c;
        const merged = { ...c, ...updates };
        // Reset operator if field type changed
        if (updates.field && updates.field !== c.field) {
          merged.operator = defaultOperatorForField(updates.field);
          merged.value = "";
          merged.valueBetweenMin = "";
          merged.valueBetweenMax = "";
        }
        return merged;
      }),
    );
  }

  function buildDraftConditions(): DraftCondition[] {
    return conditions.map((c) => ({
      group_id: c.group_id,
      field: c.field,
      operator: c.operator,
      value_json: buildValueJson(c.field, c.operator, c.value, c.valueBetweenMin, c.valueBetweenMax),
    }));
  }

  function handleTest() {
    setTestError(null);
    setTestResults(null);
    const draftConditions = buildDraftConditions();
    startTest(async () => {
      try {
        const results = await testRule(draftConditions);
        setTestResults(results);
      } catch (err) {
        setTestError(err instanceof Error ? err.message : "Test failed.");
      }
    });
  }

  function handleSave() {
    setSaveError(null);
    setSaved(false);

    if (!name.trim()) {
      setSaveError("Rule name is required.");
      return;
    }

    const input: RuleSaveInput = {
      id: existingRule?.id,
      name: name.trim(),
      enabled,
      conditions: buildDraftConditions(),
      actions: categoryAccountId
        ? [{ action_type: "set_category", value_json: { v: categoryAccountId } }]
        : [],
    };

    startSave(async () => {
      try {
        await saveRule(input);
        setSaved(true);
        router.push("/settings/rules");
      } catch (err) {
        setSaveError(err instanceof Error ? err.message : "Save failed.");
      }
    });
  }

  const inputClass =
    "h-10 w-full rounded-[var(--radius-button)] border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--ink)]";
  const selectClass = inputClass + " cursor-pointer";

  return (
    <div className="space-y-6">
      {/* Name + Enabled */}
      <div className="bkp-card space-y-4 p-5">
        <h2 className="text-sm font-semibold text-[var(--text-secondary)]">Rule details</h2>
        <div className="space-y-1">
          <label className="text-sm font-medium" htmlFor="rule-name">
            Name
          </label>
          <input
            className={inputClass}
            id="rule-name"
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. AWS expenses"
            type="text"
            value={name}
          />
        </div>
        <label className="flex cursor-pointer items-center gap-3">
          <button
            aria-checked={enabled}
            className={`relative h-5 w-9 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)] ${
              enabled ? "bg-[var(--ink)]" : "bg-[var(--border)]"
            }`}
            onClick={() => setEnabled((v) => !v)}
            role="switch"
            type="button"
          >
            <span
              className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
                enabled ? "translate-x-4" : "translate-x-0.5"
              }`}
            />
          </button>
          <span className="text-sm">{enabled ? "Enabled" : "Disabled"}</span>
        </label>
      </div>

      {/* Conditions */}
      <div className="bkp-card space-y-4 p-5">
        <h2 className="text-sm font-semibold text-[var(--text-secondary)]">Conditions</h2>
        <p className="text-xs text-[var(--text-muted)]">
          A transaction matches if ANY condition group passes (all conditions in a group must match).
          All conditions here share group 0.
        </p>

        <div className="space-y-3">
          {conditions.map((condition, index) => {
            const operators = getOperatorsForField(condition.field);
            return (
              <div
                className="flex flex-col gap-2 rounded-[var(--radius-card)] border border-[var(--border)] p-3 sm:flex-row sm:items-end"
                key={condition._key}
              >
                <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-end">
                  {/* Field */}
                  <div className="flex-1 space-y-1">
                    {index === 0 ? (
                      <label className="text-xs text-[var(--text-muted)]">Field</label>
                    ) : null}
                    <select
                      className={selectClass}
                      onChange={(e) =>
                        updateCondition(condition._key, { field: e.target.value as ConditionField })
                      }
                      value={condition.field}
                    >
                      {FIELD_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Operator */}
                  <div className="flex-1 space-y-1">
                    {index === 0 ? (
                      <label className="text-xs text-[var(--text-muted)]">Operator</label>
                    ) : null}
                    <select
                      className={selectClass}
                      onChange={(e) =>
                        updateCondition(condition._key, { operator: e.target.value as ConditionOperator })
                      }
                      value={condition.operator}
                    >
                      {operators.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Value */}
                  <div className="flex-1 space-y-1">
                    {index === 0 ? (
                      <label className="text-xs text-[var(--text-muted)]">Value</label>
                    ) : null}
                    {condition.operator === "between" ? (
                      <div className="flex gap-2">
                        <input
                          className={inputClass}
                          onChange={(e) =>
                            updateCondition(condition._key, { valueBetweenMin: e.target.value })
                          }
                          placeholder="Min"
                          type={isNumberField(condition.field) ? "number" : "text"}
                          value={condition.valueBetweenMin}
                        />
                        <input
                          className={inputClass}
                          onChange={(e) =>
                            updateCondition(condition._key, { valueBetweenMax: e.target.value })
                          }
                          placeholder="Max"
                          type={isNumberField(condition.field) ? "number" : "text"}
                          value={condition.valueBetweenMax}
                        />
                      </div>
                    ) : (
                      <input
                        className={inputClass}
                        onChange={(e) =>
                          updateCondition(condition._key, { value: e.target.value })
                        }
                        placeholder={isNumberField(condition.field) ? "e.g. 5000" : "e.g. AWS"}
                        type={isNumberField(condition.field) ? "number" : "text"}
                        value={condition.value}
                      />
                    )}
                  </div>
                </div>

                {/* Remove condition */}
                <button
                  aria-label="Remove condition"
                  className="h-10 w-10 shrink-0 rounded-[var(--radius-button)] border border-[var(--border)] text-[var(--expense)] hover:bg-[var(--expense-bg)] disabled:opacity-40"
                  disabled={conditions.length === 1}
                  onClick={() => removeCondition(condition._key)}
                  type="button"
                >
                  <Trash2 className="mx-auto h-4 w-4" />
                </button>
              </div>
            );
          })}
        </div>

        <button
          className="inline-flex h-9 items-center gap-1.5 rounded-[var(--radius-button)] border border-[var(--border)] px-3 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--paper)]"
          onClick={addCondition}
          type="button"
        >
          <Plus className="h-4 w-4" />
          Add condition
        </button>
      </div>

      {/* Action */}
      <div className="bkp-card space-y-4 p-5">
        <h2 className="text-sm font-semibold text-[var(--text-secondary)]">Action</h2>
        <div className="space-y-1">
          <label className="text-sm font-medium" htmlFor="category-select">
            Set category (account)
          </label>
          <select
            className={selectClass}
            id="category-select"
            onChange={(e) => setCategoryAccountId(e.target.value)}
            value={categoryAccountId}
          >
            <option value="">— No category set —</option>
            {accounts.map((account) => (
              <option key={account.xero_account_id} value={account.xero_account_id}>
                {account.name}
                {account.type ? ` (${account.type})` : ""}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Test rule */}
      <div className="bkp-card space-y-4 p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[var(--text-secondary)]">Test rule</h2>
          <button
            className="inline-flex h-9 items-center gap-1.5 rounded-[var(--radius-button)] border border-[var(--border)] px-3 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--paper)] disabled:cursor-not-allowed disabled:opacity-50"
            disabled={testPending}
            onClick={handleTest}
            type="button"
          >
            {testPending ? "Testing..." : "Test rule"}
          </button>
        </div>

        {testError ? (
          <div className="flex items-start gap-2 rounded-[var(--radius-card)] border border-[var(--expense)] bg-[var(--expense-bg)] p-3">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--expense)]" />
            <p className="text-sm text-[var(--expense)]">{testError}</p>
          </div>
        ) : null}

        {testResults !== null ? (
          testResults.length === 0 ? (
            <p className="text-sm text-[var(--text-secondary)]">
              No matches in the last 30 transactions.
            </p>
          ) : (
            <div>
              <p className="mb-2 text-xs text-[var(--text-muted)]">
                {testResults.length} match{testResults.length !== 1 ? "es" : ""} in last 30 transactions:
              </p>
              <ul className="divide-y divide-[var(--border)] overflow-hidden rounded-[var(--radius-card)] border border-[var(--border)]">
                {testResults.map((match) => (
                  <li className="flex items-center justify-between px-3 py-2 text-sm" key={match.id}>
                    <span className="truncate text-[var(--text-primary)]">
                      {match.description ?? "(no description)"}
                    </span>
                    <span className="ml-4 shrink-0 text-[var(--text-secondary)]">
                      {formatCents(match.total_cents)}
                      <span className="ml-2 text-xs text-[var(--text-muted)]">
                        {formatDate(match.date)}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )
        ) : null}
      </div>

      {/* Save */}
      <div className="flex items-center justify-between">
        <button
          className="h-10 rounded-[var(--radius-button)] border border-[var(--border)] px-4 text-sm font-medium hover:bg-[var(--paper)]"
          onClick={() => router.push("/settings/rules")}
          type="button"
        >
          Cancel
        </button>
        <div className="flex items-center gap-3">
          {saveError ? (
            <p className="text-sm text-[var(--expense)]">{saveError}</p>
          ) : null}
          {saved ? (
            <div className="flex items-center gap-1.5 text-sm text-[var(--income)]">
              <CheckCircle2 className="h-4 w-4" />
              Saved
            </div>
          ) : null}
          <button
            className="bkp-button inline-flex h-10 items-center px-5 text-sm disabled:cursor-not-allowed disabled:opacity-60"
            disabled={savePending}
            onClick={handleSave}
            type="button"
          >
            {savePending ? "Saving..." : "Save rule"}
          </button>
        </div>
      </div>
    </div>
  );
}
