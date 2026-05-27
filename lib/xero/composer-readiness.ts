type XeroTenantScoped = {
  xero_tenant_id: string;
};

export function getReadyXeroTenantIds(
  xeroTenantIds: string[],
  contacts: XeroTenantScoped[] = [],
  accounts: XeroTenantScoped[] = [],
  taxRates: XeroTenantScoped[] = [],
) {
  const contactTenantIds = new Set(contacts.map((contact) => contact.xero_tenant_id));
  const accountTenantIds = new Set(accounts.map((account) => account.xero_tenant_id));
  const taxRateTenantIds = new Set(taxRates.map((rate) => rate.xero_tenant_id));

  return new Set(
    xeroTenantIds.filter(
      (tenantId) => contactTenantIds.has(tenantId) && accountTenantIds.has(tenantId) && taxRateTenantIds.has(tenantId),
    ),
  );
}

