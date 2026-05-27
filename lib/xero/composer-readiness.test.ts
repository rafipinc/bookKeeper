import { describe, expect, it } from "vitest";

import { getReadyXeroTenantIds } from "./composer-readiness";

describe("getReadyXeroTenantIds", () => {
  it("only marks tenants ready when contacts, accounts, and tax rates are all synced", () => {
    const readyTenantIds = getReadyXeroTenantIds(
      ["tenant-ready", "tenant-missing-contact", "tenant-missing-account", "tenant-missing-tax"],
      [{ xero_tenant_id: "tenant-ready" }, { xero_tenant_id: "tenant-missing-account" }, { xero_tenant_id: "tenant-missing-tax" }],
      [{ xero_tenant_id: "tenant-ready" }, { xero_tenant_id: "tenant-missing-contact" }, { xero_tenant_id: "tenant-missing-tax" }],
      [{ xero_tenant_id: "tenant-ready" }, { xero_tenant_id: "tenant-missing-contact" }, { xero_tenant_id: "tenant-missing-account" }],
    );

    expect([...readyTenantIds]).toEqual(["tenant-ready"]);
  });

  it("ignores synced data for tenants that are not active composer connections", () => {
    const readyTenantIds = getReadyXeroTenantIds(
      ["active-tenant"],
      [{ xero_tenant_id: "inactive-tenant" }],
      [{ xero_tenant_id: "inactive-tenant" }],
      [{ xero_tenant_id: "inactive-tenant" }],
    );

    expect(readyTenantIds.size).toBe(0);
  });
});

