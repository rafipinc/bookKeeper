import { aiSuggestion } from "./ai-suggestion";
import { helloPing } from "./hello-ping";
import { rulesEvaluator } from "./rules-evaluator";
import { xeroBillPublish } from "./xero-bill-publish";
import { xeroInvoicePublish } from "./xero-invoice-publish";
import { xeroTenantDeltaSync, xeroTenantDeltaSyncAll } from "./xero-tenant-delta-sync";
import { xeroTenantInitialSync } from "./xero-tenant-initial-sync";

export const functions = [
  helloPing,
  xeroTenantInitialSync,
  xeroTenantDeltaSyncAll,
  xeroTenantDeltaSync,
  xeroInvoicePublish,
  xeroBillPublish,
  rulesEvaluator,
  aiSuggestion,
];

export { aiSuggestion };
export { helloPing };
export { rulesEvaluator };
export { xeroBillPublish };
export { xeroInvoicePublish };
export { xeroTenantDeltaSync, xeroTenantDeltaSyncAll };
export { xeroTenantInitialSync };
