import { InvoiceComposer } from "@/app/(app)/compose/invoice/invoice-composer";
import { createClient } from "@/lib/supabase/server";
import { ensureUserPlatformTenant } from "@/lib/supabase/tenant-scoped";
import { getReadyXeroTenantIds } from "@/lib/xero/composer-readiness";

export default async function ComposeInvoicePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const platformTenantId = await ensureUserPlatformTenant(supabase, user.id);

  const { data: connections } = await supabase
    .from("xero_connections")
    .select("id,xero_tenant_id,xero_tenant_name,status")
    .eq("platform_tenant_id", platformTenantId)
    .neq("status", "disconnected")
    .order("created_at", { ascending: true });

  if (!connections?.length) {
    return (
      <section className="space-y-4">
        <h1 className="text-xl font-semibold md:text-2xl">Compose invoice</h1>
        <div className="bkp-card max-w-xl p-5">
          <p className="text-sm text-[var(--text-secondary)]">
            Connect Xero and run the initial sync before composing invoices.
          </p>
          <a className="bkp-button mt-4 inline-flex h-10 items-center px-4 text-sm" href="/settings/integrations">
            Go to Settings → Integrations
          </a>
        </div>
      </section>
    );
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

  if (!readyConnections.length) {
    return (
      <section className="space-y-4">
        <h1 className="text-xl font-semibold md:text-2xl">Compose invoice</h1>
        <div className="bkp-card max-w-xl p-5">
          <p className="text-sm text-[var(--text-secondary)]">
            We still need synced contacts, revenue accounts, and tax rates from Xero before this composer can be used.
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
      initialDraft={null}
      taxRates={composerTaxRates.map((rate) => ({
        xeroTenantId: rate.xero_tenant_id,
        xeroTaxType: rate.xero_tax_type,
        name: rate.name,
        rate: rate.rate,
      }))}
    />
  );
}
