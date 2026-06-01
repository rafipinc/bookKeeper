"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { ensureUserPlatformTenant } from "@/lib/supabase/tenant-scoped";
import type { Database, Json } from "@/lib/supabase/types";

type RuleConditionRow = Database["public"]["Tables"]["rule_conditions"]["Row"];
type RuleActionRow = Database["public"]["Tables"]["rule_actions"]["Row"];
type ConditionField = RuleConditionRow["field"];
type ConditionOperator = RuleConditionRow["operator"];
type ActionType = RuleActionRow["action_type"];

export type DraftCondition = {
  group_id: number;
  field: ConditionField;
  operator: ConditionOperator;
  value_json: Json;
};

export type DraftAction = {
  action_type: ActionType;
  value_json: Json;
};

export type RuleSaveInput = {
  id?: string;
  name: string;
  enabled: boolean;
  conditions: DraftCondition[];
  actions: DraftAction[];
};

export type TestRuleMatch = {
  id: string;
  description: string | null;
  total_cents: number | null;
  date: string | null;
};

async function getUserTenant() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("You must be signed in to manage rules.");
  }

  const platformTenantId = await ensureUserPlatformTenant(supabase, user.id);
  return { supabase, platformTenantId, userId: user.id };
}

export async function toggleRule(ruleId: string, enabled: boolean): Promise<void> {
  const { supabase, platformTenantId } = await getUserTenant();

  const { error } = await supabase
    .from("rules")
    .update({ enabled })
    .eq("id", ruleId)
    .eq("platform_tenant_id", platformTenantId)
    .is("archived_at", null);

  if (error) throw new Error(error.message);

  revalidatePath("/settings/rules");
}

export async function reorderRule(ruleId: string, direction: "up" | "down"): Promise<void> {
  const { supabase, platformTenantId } = await getUserTenant();

  const { data: rules, error } = await supabase
    .from("rules")
    .select("id,priority")
    .eq("platform_tenant_id", platformTenantId)
    .is("archived_at", null)
    .order("priority", { ascending: true });

  if (error) throw new Error(error.message);
  if (!rules) return;

  const index = rules.findIndex((r) => r.id === ruleId);
  if (index === -1) return;

  const swapIndex = direction === "up" ? index - 1 : index + 1;
  if (swapIndex < 0 || swapIndex >= rules.length) return;

  const current = rules[index];
  const sibling = rules[swapIndex];

  const updates = [
    supabase
      .from("rules")
      .update({ priority: sibling.priority })
      .eq("id", current.id)
      .eq("platform_tenant_id", platformTenantId),
    supabase
      .from("rules")
      .update({ priority: current.priority })
      .eq("id", sibling.id)
      .eq("platform_tenant_id", platformTenantId),
  ];

  const results = await Promise.all(updates);
  for (const result of results) {
    if (result.error) throw new Error(result.error.message);
  }

  revalidatePath("/settings/rules");
}

export async function deleteRule(ruleId: string): Promise<void> {
  const { supabase, platformTenantId } = await getUserTenant();

  const { error } = await supabase
    .from("rules")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", ruleId)
    .eq("platform_tenant_id", platformTenantId);

  if (error) throw new Error(error.message);

  revalidatePath("/settings/rules");
}

export async function saveRule(input: RuleSaveInput): Promise<{ id: string }> {
  const { supabase, platformTenantId, userId } = await getUserTenant();

  // Get the active xero_tenant_id for this platform tenant
  const { data: connection } = await supabase
    .from("xero_connections")
    .select("xero_tenant_id")
    .eq("platform_tenant_id", platformTenantId)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  const xeroTenantId = connection?.xero_tenant_id ?? null;

  let ruleId = input.id;

  if (ruleId) {
    // Update existing rule
    const { error } = await supabase
      .from("rules")
      .update({
        name: input.name,
        enabled: input.enabled,
      })
      .eq("id", ruleId)
      .eq("platform_tenant_id", platformTenantId)
      .is("archived_at", null);

    if (error) throw new Error(error.message);
  } else {
    // Determine next priority
    const { data: maxRow } = await supabase
      .from("rules")
      .select("priority")
      .eq("platform_tenant_id", platformTenantId)
      .is("archived_at", null)
      .order("priority", { ascending: false })
      .limit(1)
      .maybeSingle();

    const priority = maxRow ? maxRow.priority + 10 : 10;

    const { data: newRule, error } = await supabase
      .from("rules")
      .insert({
        platform_tenant_id: platformTenantId,
        xero_tenant_id: xeroTenantId,
        name: input.name,
        enabled: input.enabled,
        priority,
        created_by: userId,
      })
      .select("id")
      .single();

    if (error) throw new Error(error.message);
    ruleId = newRule.id;
  }

  // Delete and re-insert conditions
  const { error: condDelError } = await supabase
    .from("rule_conditions")
    .delete()
    .eq("rule_id", ruleId);
  if (condDelError) throw new Error(condDelError.message);

  if (input.conditions.length > 0) {
    const { error: condInsError } = await supabase.from("rule_conditions").insert(
      input.conditions.map((c) => ({
        rule_id: ruleId as string,
        group_id: c.group_id,
        field: c.field,
        operator: c.operator,
        value_json: c.value_json,
      })),
    );
    if (condInsError) throw new Error(condInsError.message);
  }

  // Delete and re-insert actions
  const { error: actDelError } = await supabase
    .from("rule_actions")
    .delete()
    .eq("rule_id", ruleId);
  if (actDelError) throw new Error(actDelError.message);

  if (input.actions.length > 0) {
    const { error: actInsError } = await supabase.from("rule_actions").insert(
      input.actions.map((a) => ({
        rule_id: ruleId as string,
        action_type: a.action_type,
        value_json: a.value_json,
      })),
    );
    if (actInsError) throw new Error(actInsError.message);
  }

  // Determine next version number
  const { data: maxVersion } = await supabase
    .from("rule_versions")
    .select("version")
    .eq("rule_id", ruleId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextVersion = maxVersion ? maxVersion.version + 1 : 1;

  // Insert rule_versions snapshot
  const { data: newVersion, error: versionError } = await supabase
    .from("rule_versions")
    .insert({
      rule_id: ruleId,
      version: nextVersion,
      snapshot_json: {
        conditions: input.conditions,
        actions: input.actions,
      },
      created_by: userId,
    })
    .select("id")
    .single();

  if (versionError) throw new Error(versionError.message);

  // Update rules.current_version_id
  const { error: updateVersionError } = await supabase
    .from("rules")
    .update({ current_version_id: newVersion.id })
    .eq("id", ruleId);

  if (updateVersionError) throw new Error(updateVersionError.message);

  revalidatePath("/settings/rules");
  return { id: ruleId as string };
}

function applyConditionToTransaction(
  transaction: {
    description: string | null;
    reference: string | null;
    date: string | null;
    total_cents: number | null;
  },
  condition: DraftCondition,
): boolean {
  let fieldValue: unknown;
  switch (condition.field) {
    case "description":
      fieldValue = transaction.description;
      break;
    case "reference":
      fieldValue = transaction.reference;
      break;
    case "date":
      fieldValue = transaction.date;
      break;
    case "amount_cents":
      fieldValue = transaction.total_cents;
      break;
    case "xero_account_id":
    case "contact_name":
      // Not available in summary fetch — skip
      return true;
    default:
      return true;
  }

  const vj = condition.value_json;
  const extractedValue =
    vj && typeof vj === "object" && !Array.isArray(vj) && "v" in vj
      ? (vj as { v: unknown }).v
      : vj;

  switch (condition.operator) {
    case "equals":
      return fieldValue === extractedValue;
    case "contains":
      return typeof fieldValue === "string" && typeof extractedValue === "string"
        ? fieldValue.toLowerCase().includes((extractedValue as string).toLowerCase())
        : false;
    case "starts_with":
      return typeof fieldValue === "string" && typeof extractedValue === "string"
        ? fieldValue.toLowerCase().startsWith((extractedValue as string).toLowerCase())
        : false;
    case "ends_with":
      return typeof fieldValue === "string" && typeof extractedValue === "string"
        ? fieldValue.toLowerCase().endsWith((extractedValue as string).toLowerCase())
        : false;
    case "regex": {
      if (typeof fieldValue !== "string" || typeof extractedValue !== "string") return false;
      try {
        return new RegExp(extractedValue as string, "i").test(fieldValue);
      } catch {
        return false;
      }
    }
    case "gte": {
      if (typeof fieldValue === "number" && typeof extractedValue === "number")
        return fieldValue >= extractedValue;
      return false;
    }
    case "lte": {
      if (typeof fieldValue === "number" && typeof extractedValue === "number")
        return fieldValue <= extractedValue;
      return false;
    }
    case "between": {
      if (!vj || typeof vj !== "object" || Array.isArray(vj)) return false;
      const obj = vj as Record<string, unknown>;
      if (typeof fieldValue !== "number") return false;
      const min = typeof obj.min === "number" ? obj.min : null;
      const max = typeof obj.max === "number" ? obj.max : null;
      if (min === null || max === null) return false;
      return fieldValue >= min && fieldValue <= max;
    }
    case "in": {
      const list = Array.isArray(vj) ? vj : Array.isArray(extractedValue) ? extractedValue : null;
      if (!list) return false;
      return list.includes(fieldValue);
    }
    default:
      return false;
  }
}

function matchesConditions(
  transaction: { description: string | null; reference: string | null; date: string | null; total_cents: number | null },
  conditions: DraftCondition[],
): boolean {
  if (conditions.length === 0) return false;

  const groups = new Map<number, DraftCondition[]>();
  for (const c of conditions) {
    const bucket = groups.get(c.group_id);
    if (bucket) bucket.push(c);
    else groups.set(c.group_id, [c]);
  }

  for (const group of groups.values()) {
    if (group.every((c) => applyConditionToTransaction(transaction, c))) {
      return true;
    }
  }

  return false;
}

export async function testRule(conditions: DraftCondition[]): Promise<TestRuleMatch[]> {
  const { supabase, platformTenantId } = await getUserTenant();

  if (conditions.length === 0) {
    return [];
  }

  const { data: connection } = await supabase
    .from("xero_connections")
    .select("xero_tenant_id")
    .eq("platform_tenant_id", platformTenantId)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  if (!connection) {
    return [];
  }

  const { data: transactions, error } = await supabase
    .from("xero_bank_transactions")
    .select("id,description,reference,date,total_cents")
    .eq("platform_tenant_id", platformTenantId)
    .eq("xero_tenant_id", connection.xero_tenant_id)
    .order("date", { ascending: false })
    .limit(30);

  if (error) throw new Error(error.message);
  if (!transactions) return [];

  const matches: TestRuleMatch[] = [];
  for (const tx of transactions) {
    if (matches.length >= 10) break;
    if (matchesConditions(tx, conditions)) {
      matches.push({
        id: tx.id,
        description: tx.description,
        total_cents: tx.total_cents,
        date: tx.date,
      });
    }
  }

  return matches;
}
