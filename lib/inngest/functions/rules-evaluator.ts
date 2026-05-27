import { inngest } from "@/lib/inngest/client";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import type { Database, Json } from "@/lib/supabase/types";

type BankTransactionRow = Database["public"]["Tables"]["xero_bank_transactions"]["Row"];
type RuleRow = Database["public"]["Tables"]["rules"]["Row"];
type RuleConditionRow = Database["public"]["Tables"]["rule_conditions"]["Row"];
type RuleActionRow = Database["public"]["Tables"]["rule_actions"]["Row"];
type TransactionRuleMatchInsert = Database["public"]["Tables"]["transaction_rule_matches"]["Insert"];

type ConditionField = RuleConditionRow["field"];
type ConditionOperator = RuleConditionRow["operator"];
type ActionType = RuleActionRow["action_type"];

export type EvaluatorTransactionFacts = {
  id: string;
  platform_tenant_id: string;
  xero_tenant_id: string;
  description: string | null;
  reference: string | null;
  date: string | null;
  amount_cents: number | null;
  xero_account_id: string | null;
  contact_name: string | null;
};

export type EvaluatorRule = RuleRow & {
  conditions: RuleConditionRow[];
  actions: RuleActionRow[];
};

export type SuggestionPayload = {
  suggested_category_id: string | null;
  suggested_contact_id: string | null;
  suggested_project_id: string | null;
  suggested_tax_rate_id: string | null;
};

export const rulesEvaluator = inngest.createFunction(
  {
    id: "rules-evaluator",
    retries: 3,
    concurrency: {
      key: "event.data.xeroTenantId",
      limit: 4,
    },
    triggers: [{ event: "xero/bank_transaction.created" }],
  },
  async ({ event, step }) => {
    const transactionId = readString(event.data, "transactionId");
    const platformTenantId = readString(event.data, "platformTenantId");
    const xeroTenantId = readString(event.data, "xeroTenantId");

    const facts = await step.run("load transaction facts", async () =>
      rulesEvaluatorInternals.loadTransactionFacts(transactionId, platformTenantId, xeroTenantId),
    );

    if (!facts) {
      return { transactionId, skipped: "transaction-not-found" };
    }

    const rules = await step.run("load ruleset snapshot", async () =>
      rulesEvaluatorInternals.loadRuleset(platformTenantId, xeroTenantId),
    );

    const match = rulesEvaluatorInternals.evaluateRules(facts, rules);

    if (!match) {
      await step.run("clear prior rule match", async () =>
        rulesEvaluatorInternals.clearRuleMatch(transactionId),
      );
      await step.run("emit no rule match", async () =>
        inngest.send({
          name: "xero/bank_transaction.no_rule_match",
          data: {
            transactionId,
            platformTenantId,
            xeroTenantId,
          },
        }),
      );
      return { transactionId, matched: false };
    }

    await step.run("write rule match", async () =>
      rulesEvaluatorInternals.writeRuleMatch(transactionId, match.rule, match.suggestion),
    );

    return {
      transactionId,
      matched: true,
      ruleId: match.rule.id,
    };
  },
);

export function evaluateRules(
  facts: EvaluatorTransactionFacts,
  rules: EvaluatorRule[],
): { rule: EvaluatorRule; suggestion: SuggestionPayload } | null {
  const ordered = [...rules].sort((a, b) => a.priority - b.priority);

  for (const rule of ordered) {
    if (ruleMatches(facts, rule)) {
      return { rule, suggestion: buildSuggestion(rule.actions) };
    }
  }

  return null;
}

function ruleMatches(facts: EvaluatorTransactionFacts, rule: EvaluatorRule): boolean {
  if (!rule.conditions.length) {
    return false;
  }

  const groups = new Map<number, RuleConditionRow[]>();
  for (const condition of rule.conditions) {
    const bucket = groups.get(condition.group_id);
    if (bucket) {
      bucket.push(condition);
    } else {
      groups.set(condition.group_id, [condition]);
    }
  }

  for (const group of groups.values()) {
    if (group.every((condition) => conditionMatches(facts, condition))) {
      return true;
    }
  }

  return false;
}

function conditionMatches(facts: EvaluatorTransactionFacts, condition: RuleConditionRow): boolean {
  const fieldValue = readField(facts, condition.field);
  return applyOperator(fieldValue, condition.operator, condition.value_json);
}

function readField(facts: EvaluatorTransactionFacts, field: ConditionField): unknown {
  switch (field) {
    case "description":
      return facts.description;
    case "reference":
      return facts.reference;
    case "date":
      return facts.date;
    case "amount_cents":
      return facts.amount_cents;
    case "xero_account_id":
      return facts.xero_account_id;
    case "contact_name":
      return facts.contact_name;
    default:
      return null;
  }
}

function applyOperator(fieldValue: unknown, operator: ConditionOperator, valueJson: Json): boolean {
  const value = extractValue(valueJson);

  switch (operator) {
    case "equals":
      return fieldValue === value;
    case "contains":
      return typeof fieldValue === "string" && typeof value === "string"
        ? fieldValue.toLowerCase().includes(value.toLowerCase())
        : false;
    case "starts_with":
      return typeof fieldValue === "string" && typeof value === "string"
        ? fieldValue.toLowerCase().startsWith(value.toLowerCase())
        : false;
    case "ends_with":
      return typeof fieldValue === "string" && typeof value === "string"
        ? fieldValue.toLowerCase().endsWith(value.toLowerCase())
        : false;
    case "regex": {
      if (typeof fieldValue !== "string" || typeof value !== "string") return false;
      try {
        return new RegExp(value, "i").test(fieldValue);
      } catch {
        return false;
      }
    }
    case "gte":
      return compareOrdered(fieldValue, value, (a, b) => a >= b);
    case "lte":
      return compareOrdered(fieldValue, value, (a, b) => a <= b);
    case "between": {
      const range = extractRange(valueJson);
      if (range === null) return false;
      return compareOrdered(fieldValue, range.min, (a, b) => a >= b)
        && compareOrdered(fieldValue, range.max, (a, b) => a <= b);
    }
    case "in": {
      const list = extractList(valueJson);
      if (!list) return false;
      return list.some((entry) => entry === fieldValue);
    }
    default:
      return false;
  }
}

function compareOrdered(a: unknown, b: unknown, cmp: (x: number, y: number) => boolean): boolean {
  if (typeof a === "number" && typeof b === "number") return cmp(a, b);
  if (typeof a === "string" && typeof b === "string") {
    const aTime = Date.parse(a);
    const bTime = Date.parse(b);
    if (!Number.isNaN(aTime) && !Number.isNaN(bTime)) return cmp(aTime, bTime);
  }
  return false;
}

function extractRange(valueJson: Json): { min: unknown; max: unknown } | null {
  if (!valueJson || typeof valueJson !== "object" || Array.isArray(valueJson)) return null;
  const obj = valueJson as Record<string, unknown>;
  if ("min" in obj && "max" in obj) {
    return { min: obj.min, max: obj.max };
  }
  return null;
}

function extractValue(valueJson: Json): unknown {
  if (valueJson && typeof valueJson === "object" && !Array.isArray(valueJson) && "v" in valueJson) {
    return (valueJson as { v: unknown }).v;
  }
  return valueJson;
}

function extractList(valueJson: Json): unknown[] | null {
  if (Array.isArray(valueJson)) return valueJson;
  if (valueJson && typeof valueJson === "object" && "v" in valueJson) {
    const v = (valueJson as { v: unknown }).v;
    if (Array.isArray(v)) return v;
  }
  return null;
}

function buildSuggestion(actions: RuleActionRow[]): SuggestionPayload {
  const suggestion: SuggestionPayload = {
    suggested_category_id: null,
    suggested_contact_id: null,
    suggested_project_id: null,
    suggested_tax_rate_id: null,
  };

  for (const action of actions) {
    const value = extractValue(action.value_json);
    const id = typeof value === "string" ? value : null;
    const key = actionToColumn(action.action_type);
    if (id !== null) {
      suggestion[key] = id;
    }
  }

  return suggestion;
}

function actionToColumn(actionType: ActionType): keyof SuggestionPayload {
  switch (actionType) {
    case "set_category":
      return "suggested_category_id";
    case "set_contact":
      return "suggested_contact_id";
    case "set_project":
      return "suggested_project_id";
    case "set_tax_rate":
      return "suggested_tax_rate_id";
  }
}

async function loadTransactionFacts(
  transactionId: string,
  platformTenantId: string,
  xeroTenantId: string,
): Promise<EvaluatorTransactionFacts | null> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("xero_bank_transactions")
    .select(
      "id,platform_tenant_id,xero_tenant_id,description,reference,date,total_cents,bank_account_id,contact_id",
    )
    .eq("id", transactionId)
    .eq("platform_tenant_id", platformTenantId)
    .eq("xero_tenant_id", xeroTenantId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const [accountResult, contactResult] = await Promise.all([
    data.bank_account_id
      ? supabase
          .from("xero_accounts")
          .select("xero_account_id")
          .eq("id", data.bank_account_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    data.contact_id
      ? supabase
          .from("xero_contacts")
          .select("name")
          .eq("id", data.contact_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (accountResult.error) throw accountResult.error;
  if (contactResult.error) throw contactResult.error;

  return {
    id: data.id,
    platform_tenant_id: data.platform_tenant_id,
    xero_tenant_id: data.xero_tenant_id,
    description: data.description,
    reference: data.reference,
    date: data.date,
    amount_cents: data.total_cents,
    xero_account_id: accountResult.data?.xero_account_id ?? null,
    contact_name: (contactResult.data as { name?: string | null } | null)?.name ?? null,
  };
}

async function loadRuleset(
  platformTenantId: string,
  xeroTenantId: string,
): Promise<EvaluatorRule[]> {
  const supabase = createServiceRoleClient();
  const { data: rules, error } = await supabase
    .from("rules")
    .select("*")
    .eq("platform_tenant_id", platformTenantId)
    .eq("enabled", true)
    .is("archived_at", null)
    .or(`xero_tenant_id.is.null,xero_tenant_id.eq.${xeroTenantId}`)
    .order("priority", { ascending: true });

  if (error) throw error;
  if (!rules || !rules.length) return [];

  const versionIds = rules
    .map((rule) => rule.current_version_id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);

  const rulesWithoutVersion = rules.filter((rule) => !rule.current_version_id).map((rule) => rule.id);

  const [versionsResult, conditionsResult, actionsResult] = await Promise.all([
    versionIds.length
      ? supabase.from("rule_versions").select("id,rule_id,snapshot_json").in("id", versionIds)
      : Promise.resolve({ data: [], error: null }),
    rulesWithoutVersion.length
      ? supabase.from("rule_conditions").select("*").in("rule_id", rulesWithoutVersion)
      : Promise.resolve({ data: [], error: null }),
    rulesWithoutVersion.length
      ? supabase.from("rule_actions").select("*").in("rule_id", rulesWithoutVersion)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (versionsResult.error) throw versionsResult.error;
  if (conditionsResult.error) throw conditionsResult.error;
  if (actionsResult.error) throw actionsResult.error;

  const snapshotsByVersionId = new Map(
    (versionsResult.data ?? []).map((row) => [row.id, row.snapshot_json]),
  );
  const liveConditionsByRule = groupBy(conditionsResult.data ?? [], (row) => row.rule_id);
  const liveActionsByRule = groupBy(actionsResult.data ?? [], (row) => row.rule_id);

  return rules.map((rule) => {
    if (rule.current_version_id) {
      const snapshot = snapshotsByVersionId.get(rule.current_version_id);
      const { conditions, actions } = unpackSnapshot(rule.id, snapshot);
      return { ...rule, conditions, actions };
    }
    return {
      ...rule,
      conditions: liveConditionsByRule.get(rule.id) ?? [],
      actions: liveActionsByRule.get(rule.id) ?? [],
    };
  });
}

function unpackSnapshot(
  ruleId: string,
  snapshot: Json | undefined,
): { conditions: RuleConditionRow[]; actions: RuleActionRow[] } {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    return { conditions: [], actions: [] };
  }
  const obj = snapshot as Record<string, unknown>;
  const rawConditions = Array.isArray(obj.conditions) ? obj.conditions : [];
  const rawActions = Array.isArray(obj.actions) ? obj.actions : [];

  const conditions: RuleConditionRow[] = rawConditions
    .filter((c): c is Record<string, unknown> => !!c && typeof c === "object")
    .map((c, idx) => ({
      id: typeof c.id === "string" ? c.id : `${ruleId}-snap-c${idx}`,
      rule_id: ruleId,
      group_id: typeof c.group_id === "number" ? c.group_id : 0,
      field: c.field as RuleConditionRow["field"],
      operator: c.operator as RuleConditionRow["operator"],
      value_json: (c.value_json ?? null) as Json,
    }));

  const actions: RuleActionRow[] = rawActions
    .filter((a): a is Record<string, unknown> => !!a && typeof a === "object")
    .map((a, idx) => ({
      id: typeof a.id === "string" ? a.id : `${ruleId}-snap-a${idx}`,
      rule_id: ruleId,
      action_type: a.action_type as RuleActionRow["action_type"],
      value_json: (a.value_json ?? null) as Json,
    }));

  return { conditions, actions };
}

async function clearRuleMatch(transactionId: string): Promise<void> {
  const supabase = createServiceRoleClient();
  const { error } = await supabase
    .from("transaction_rule_matches")
    .delete()
    .eq("xero_bank_transaction_id", transactionId)
    .eq("suggestion_source", "rule");
  if (error) throw error;
}

async function writeRuleMatch(
  transactionId: string,
  rule: EvaluatorRule,
  suggestion: SuggestionPayload,
): Promise<void> {
  const row: TransactionRuleMatchInsert = {
    xero_bank_transaction_id: transactionId,
    rule_id: rule.id,
    rule_version_id: rule.current_version_id,
    suggestion_source: "rule",
    matched_at: new Date().toISOString(),
    action_applied: false,
    accepted_at: null,
    override_by_user_id: null,
    override_at: null,
    ...suggestion,
  };

  // Race-safe: relies on UNIQUE (xero_bank_transaction_id, suggestion_source)
  // from migration 0014 so concurrent runs collapse to a single row.
  const { error } = await createServiceRoleClient()
    .from("transaction_rule_matches")
    .upsert(row, { onConflict: "xero_bank_transaction_id,suggestion_source" });
  if (error) throw error;
}

function groupBy<T, K>(items: T[], key: (item: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const item of items) {
    const k = key(item);
    const bucket = map.get(k);
    if (bucket) bucket.push(item);
    else map.set(k, [item]);
  }
  return map;
}

function readString(payload: unknown, field: string): string {
  if (typeof payload !== "object" || payload === null) {
    throw new Error(`Event payload missing object body.`);
  }
  const value = (payload as Record<string, unknown>)[field];
  if (typeof value !== "string" || !value) {
    throw new Error(`Event payload missing ${field}.`);
  }
  return value;
}

export const rulesEvaluatorInternals = {
  evaluateRules,
  loadTransactionFacts,
  loadRuleset,
  writeRuleMatch,
  clearRuleMatch,
};

type BankTransactionFactsFromRow = Pick<
  BankTransactionRow,
  "id" | "platform_tenant_id" | "xero_tenant_id" | "description" | "reference" | "date" | "total_cents"
>;
export type { BankTransactionFactsFromRow };
