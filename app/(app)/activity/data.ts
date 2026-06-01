import type { TypedSupabaseClient } from "@/lib/supabase/tenant-scoped";

export type ActivityEvent = {
  id: string;
  timestamp: string; // ISO
  label: string;
  linkHref?: string;
  linkLabel?: string;
};

function formatMoney(cents: number | null): string {
  if (cents === null) return "";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

async function loadApprovalEvents(
  supabase: TypedSupabaseClient,
  platformTenantId: string,
  xeroTenantId: string,
): Promise<ActivityEvent[]> {
  try {
    const { data, error } = await supabase
      .from("xero_bank_transactions")
      .select(
        `id, description, total_cents,
         transaction_rule_matches(id, accepted_at, action_applied, suggestion_source, rules(name))`,
      )
      .eq("platform_tenant_id", platformTenantId)
      .eq("xero_tenant_id", xeroTenantId)
      .order("date", { ascending: false })
      .limit(100);

    if (error) {
      console.error("[activity] approval events error:", error.message);
      return [];
    }

    const events: ActivityEvent[] = [];
    for (const row of data ?? []) {
      const matches = Array.isArray(row.transaction_rule_matches)
        ? row.transaction_rule_matches
        : row.transaction_rule_matches
          ? [row.transaction_rule_matches]
          : [];

      for (const match of matches) {
        if (!match.action_applied || !match.accepted_at) continue;

        const desc = row.description ?? "transaction";
        const amount = formatMoney(row.total_cents);
        const label = `You approved: ${desc}${amount ? ` — ${amount}` : ""}`;

        events.push({
          id: `approval-${match.id}`,
          timestamp: match.accepted_at,
          label,
          linkHref: `/reconcile`,
          linkLabel: "View",
        });
      }
    }

    return events;
  } catch (err) {
    console.error("[activity] approval events unexpected error:", err);
    return [];
  }
}

async function loadSyncEvents(
  supabase: TypedSupabaseClient,
  platformTenantId: string,
  xeroTenantId: string,
): Promise<ActivityEvent[]> {
  try {
    const { data, error } = await supabase
      .from("xero_api_calls")
      .select("id, created_at")
      .eq("platform_tenant_id", platformTenantId)
      .eq("xero_tenant_id", xeroTenantId)
      .eq("method", "GET")
      .like("endpoint", "%BankTransactions%")
      .eq("status", 200)
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) {
      console.error("[activity] sync events error:", error.message);
      return [];
    }

    return (data ?? []).map((row) => ({
      id: `sync-${row.id}`,
      timestamp: row.created_at,
      label: "Synced transactions from Xero",
    }));
  } catch (err) {
    console.error("[activity] sync events unexpected error:", err);
    return [];
  }
}

async function loadInvoiceEvents(
  supabase: TypedSupabaseClient,
  platformTenantId: string,
  xeroTenantId: string,
): Promise<ActivityEvent[]> {
  try {
    const { data, error } = await supabase
      .from("xero_invoices")
      .select("id, xero_invoice_number, total_cents, created_at, xero_contacts(name)")
      .eq("platform_tenant_id", platformTenantId)
      .eq("xero_tenant_id", xeroTenantId)
      .eq("status", "published")
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) {
      console.error("[activity] invoice events error:", error.message);
      return [];
    }

    return (data ?? []).map((row) => {
      const contactRows = Array.isArray(row.xero_contacts)
        ? row.xero_contacts
        : row.xero_contacts
          ? [row.xero_contacts]
          : [];
      const contactName = contactRows[0]?.name ?? "Unknown";
      const num = row.xero_invoice_number ?? row.id.slice(0, 8);
      const amount = formatMoney(row.total_cents);
      const label = `Invoice #${num} sent to Xero for ${contactName}${amount ? ` — ${amount}` : ""}`;

      return {
        id: `invoice-${row.id}`,
        timestamp: row.created_at,
        label,
        linkHref: `/compose/invoice/${row.id}`,
        linkLabel: "View",
      };
    });
  } catch (err) {
    console.error("[activity] invoice events unexpected error:", err);
    return [];
  }
}

async function loadRuleCreationEvents(
  supabase: TypedSupabaseClient,
  platformTenantId: string,
): Promise<ActivityEvent[]> {
  try {
    const { data, error } = await supabase
      .from("rules")
      .select("id, name, created_at")
      .eq("platform_tenant_id", platformTenantId)
      .is("archived_at", null)
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) {
      console.error("[activity] rule events error:", error.message);
      return [];
    }

    return (data ?? []).map((row) => ({
      id: `rule-${row.id}`,
      timestamp: row.created_at,
      label: `Rule created: ${row.name}`,
      linkHref: `/settings/rules/${row.id}`,
      linkLabel: "Edit",
    }));
  } catch (err) {
    console.error("[activity] rule events unexpected error:", err);
    return [];
  }
}

export async function loadActivityEvents(
  supabase: TypedSupabaseClient,
  platformTenantId: string,
  xeroTenantId: string,
  limit = 50,
  cursor?: string,
): Promise<ActivityEvent[]> {
  const [approvals, syncs, invoices, rules] = await Promise.all([
    loadApprovalEvents(supabase, platformTenantId, xeroTenantId),
    loadSyncEvents(supabase, platformTenantId, xeroTenantId),
    loadInvoiceEvents(supabase, platformTenantId, xeroTenantId),
    loadRuleCreationEvents(supabase, platformTenantId),
  ]);

  let all = [...approvals, ...syncs, ...invoices, ...rules].sort((a, b) =>
    b.timestamp.localeCompare(a.timestamp),
  );

  if (cursor) {
    const cursorIndex = all.findIndex((e) => e.timestamp < cursor);
    if (cursorIndex !== -1) {
      all = all.slice(cursorIndex);
    } else {
      all = [];
    }
  }

  return all.slice(0, limit);
}
