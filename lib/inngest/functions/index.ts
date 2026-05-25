import { helloPing } from "./hello-ping";
import { xeroTenantInitialSync } from "./xero-tenant-initial-sync";

export const functions = [helloPing, xeroTenantInitialSync];

export { helloPing };
export { xeroTenantInitialSync };
