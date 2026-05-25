import { helloPing } from "./hello-ping";
import { xeroInvoicePublish } from "./xero-invoice-publish";
import { xeroTenantInitialSync } from "./xero-tenant-initial-sync";

export const functions = [helloPing, xeroTenantInitialSync, xeroInvoicePublish];

export { helloPing };
export { xeroInvoicePublish };
export { xeroTenantInitialSync };
