import { helloPing } from "./hello-ping";
import { xeroBillPublish } from "./xero-bill-publish";
import { xeroInvoicePublish } from "./xero-invoice-publish";
import { xeroTenantInitialSync } from "./xero-tenant-initial-sync";

export const functions = [helloPing, xeroTenantInitialSync, xeroInvoicePublish, xeroBillPublish];

export { helloPing };
export { xeroBillPublish };
export { xeroInvoicePublish };
export { xeroTenantInitialSync };
