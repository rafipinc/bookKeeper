import { notFound } from "next/navigation";

import { InvoiceComposer } from "@/app/(app)/compose/invoice/invoice-composer";
import { createClient } from "@/lib/supabase/server";
import { ensureUserPlatformTenant } from "@/lib/supabase/tenant-scoped";
import { getReadyXeroTenantIds } from "@/lib/xero/composer-readiness";

export default async function ComposeInvoiceDraftPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const platformTenantId = await ensureUserPlatformTenant(supabase, user.id);

  const [{ data: draft }, { data: connections }] = await Promise.all([
    supabase
      .from("xero_invoices")
      .select("id,xero_tenant_id,contact_id,date,due_date,reference,xero_invoice_number,publish_error,line_items_json")
      .eq("platform_tenant_id", platformTenantId)
      .eq("type", "ACCREC")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("xero_connections")
      .select("id,xero_tenant_id,xero_tenant_name,status")
      .eq("platform_tenant_id", platformTenantId)
      .neq("status", "disconnected")
      .order("created_at", { ascending: true }),
  ]);

  if (!draft) {
    notFound();
  }

  if (!connections?.length) {
    return null;
  }

  const xeroTenantIds = connections.map((connection) => connection.xero_tenant_id);
  const [{ data: contacts }, { data: accounts }, { data: taxRates }] = await Promise.all([
    supabase
      .from("xero_contacts")
      .select("id,xero_tenant_id,name,email")
      .eq("platform_tenant_id", platformTenantId)
      .in("xero_tenant_id", xeroTenantIds)
      .eq("is_customer", true)
      .order("name", { ascending: true }),
    supabase
      .from("xero_accounts")
      .select("id,xero_tenant_id,code,name")
      .eq("platform_tenant_id", platformTenantId)
      .in("xero_tenant_id", xeroTenantIds)
      .eq("type", "REVENUE")
      .order("code", { ascending: true, nullsFirst: false })
      .order("name", { ascending: true }),
    supabase
      .from("xero_tax_rates")
      .select("xero_tenant_id,xero_tax_type,name,rate")
      .eq("platform_tenant_id", platformTenantId)
      .in("xero_tenant_id", xeroTenantIds)
      .order("name", { ascending: true }),
  ]);

  const composerContacts = contacts ?? [];
  const composerAccounts = accounts ?? [];
  const composerTaxRates = taxRates ?? [];
  const readyXeroTenantIds = getReadyXeroTenantIds(xeroTenantIds, composerContacts, composerAccounts, composerTaxRates);
  const readyConnections = connections.filter((connection) => readyXeroTenantIds.has(connection.xero_tenant_id));

  if (!readyConnections.length || !readyXeroTenantIds.has(draft.xero_tenant_id)) {
    return (
      <section className="space-y-4">
        <h1 className="text-xl font-semibold md:text-2xl">Compose invoice</h1>
        <div className="bkp-card max-w-xl p-5">
          <p className="text-sm text-[var(--text-secondary)]">
            This draft belongs to a Xero organisation that still needs synced customers, revenue accounts, and tax rates.
          </p>
          <a className="bkp-button mt-4 inline-flex h-10 items-center px-4 text-sm" href="/settings/integrations">
            Open Settings → Integrations
          </a>
        </div>
      </section>
    );
  }

  return (
    <InvoiceComposer
      accounts={composerAccounts.map((account) => ({
        id: account.id,
        xeroTenantId: account.xero_tenant_id,
        code: account.code,
        name: account.name,
      }))}
      connections={readyConnections.map((connection) => ({
        id: connection.id,
        xeroTenantId: connection.xero_tenant_id,
        xeroTenantName: connection.xero_tenant_name,
        status: connection.status,
      }))}
      contacts={composerContacts.map((contact) => ({
        id: contact.id,
        xeroTenantId: contact.xero_tenant_id,
        name: contact.name,
        email: contact.email,
      }))}
      initialDraft={{
        id: draft.id,
        xeroTenantId: draft.xero_tenant_id,
        contactId: draft.contact_id,
        date: draft.date,
        dueDate: draft.due_date,
        reference: draft.reference,
        invoiceNumber: draft.xero_invoice_number,
        publishError: draft.publish_error,
        lineItemsJson: draft.line_items_json,
      }}
      taxRates={composerTaxRates.map((rate) => ({
        xeroTenantId: rate.xero_tenant_id,
        xeroTaxType: rate.xero_tax_type,
        name: rate.name,
        rate: rate.rate,
      }))}
    />
  );
}
