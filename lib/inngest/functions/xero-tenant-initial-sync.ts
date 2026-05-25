import { createServiceRoleClient } from "@/lib/supabase/service-role";
import type { Database, Json } from "@/lib/supabase/types";
import { inngest } from "@/lib/inngest/client";
import { RetryableXeroError, XeroClient } from "@/lib/xero/client";

type XeroConnectionRow = Database["public"]["Tables"]["xero_connections"]["Row"];
type XeroAccountInsert = Database["public"]["Tables"]["xero_accounts"]["Insert"];
type XeroContactInsert = Database["public"]["Tables"]["xero_contacts"]["Insert"];
type XeroTaxRateInsert = Database["public"]["Tables"]["xero_tax_rates"]["Insert"];
type XeroBankTransactionInsert = Database["public"]["Tables"]["xero_bank_transactions"]["Insert"];
type XeroBankTransactionRow = Database["public"]["Tables"]["xero_bank_transactions"]["Row"];

type SyncConnection = Pick<XeroConnectionRow, "id" | "platform_tenant_id" | "xero_tenant_id" | "status">;
type BankTransactionReferenceMaps = {
  accountsByXeroId: Map<string, string>;
  contactsByXeroId: Map<string, string>;
};

type XeroListAccountsResponse = {
  Accounts?: unknown[];
};

type XeroListContactsResponse = {
  Contacts?: unknown[];
};

type XeroListTaxRatesResponse = {
  TaxRates?: unknown[];
};

type XeroListBankTransactionsResponse = {
  BankTransactions?: unknown[];
  pageInfo?: {
    totalPages?: number;
  };
  pagination?: {
    page?: number;
    pageCount?: number;
  };
};

export const xeroTenantInitialSync = inngest.createFunction(
  {
    id: "xero-tenant-initial-sync",
    retries: 5,
    concurrency: {
      key: "event.data.connectionId",
      limit: 4,
    },
    triggers: [{ event: "xero/tenant.sync.initial" }],
  },
  async ({ event, step }) => {
    const connection = await step.run("load connection", async () => loadConnection(event.data));
    const xeroClient = new XeroClient(connection.id);

    await step.run("sync accounts", async () => syncAccounts(xeroClient, connection));
    await step.run("sync contacts", async () => syncContacts(xeroClient, connection));
    await step.run("sync tax rates", async () => syncTaxRates(xeroClient, connection));
    const newestSeenDate = await step.run("sync bank transactions", async () =>
      syncBankTransactions(xeroClient, connection),
    );
    await step.run("update last_synced_at", async () => updateLastSyncedAt(connection.id, newestSeenDate));

    return {
      connectionId: connection.id,
      xeroTenantId: connection.xero_tenant_id,
      newestSeenDate,
    };
  },
);

async function loadConnection(payload: unknown): Promise<SyncConnection> {
  const connectionId = asRecord(payload).connectionId;
  if (typeof connectionId !== "string" || !connectionId) {
    throw new Error("Missing connectionId.");
  }

  const supabase = createServiceRoleClient();
  const { data: connection, error } = await supabase
    .from("xero_connections")
    .select("id,platform_tenant_id,xero_tenant_id,status")
    .eq("id", connectionId)
    .single();

  if (error || !connection) {
    throw new Error(`Xero connection ${connectionId} not found.`);
  }

  if (connection.status !== "active") {
    throw new Error(`Xero connection ${connectionId} is not active.`);
  }

  return connection;
}

async function syncAccounts(client: XeroClient, connection: SyncConnection) {
  const response = await client.listAccounts() as XeroListAccountsResponse;
  const accounts = asArray(response.Accounts);
  if (!accounts.length) {
    return;
  }

  const rows: XeroAccountInsert[] = accounts
    .map((account) => mapAccount(account, connection))
    .filter((value): value is XeroAccountInsert => value !== null);

  if (!rows.length) {
    return;
  }

  await upsertXeroAccounts(rows);
}

async function syncContacts(client: XeroClient, connection: SyncConnection) {
  await client.paginate<XeroListContactsResponse & XeroListBankTransactionsResponse>(
    (page) => client.listContacts({ page }) as Promise<XeroListContactsResponse & XeroListBankTransactionsResponse>,
    async (response) => {
      const contacts = asArray(response.Contacts);
      if (!contacts.length) {
        return false;
      }

      const rows: XeroContactInsert[] = contacts
        .map((contact) => mapContact(contact, connection))
        .filter((value): value is XeroContactInsert => value !== null);

      if (rows.length) {
        await upsertXeroContacts(rows);
      }

      return true;
    },
  );
}

async function syncTaxRates(client: XeroClient, connection: SyncConnection) {
  const response = await client.listTaxRates() as XeroListTaxRatesResponse;
  const taxRates = asArray(response.TaxRates);
  if (!taxRates.length) {
    return;
  }

  const rows: XeroTaxRateInsert[] = taxRates
    .map((taxRate) => mapTaxRate(taxRate, connection))
    .filter((value): value is XeroTaxRateInsert => value !== null);

  if (!rows.length) {
    return;
  }

  await upsertXeroTaxRates(rows);
}

async function syncBankTransactions(client: XeroClient, connection: SyncConnection): Promise<string | null> {
  const supabase = createServiceRoleClient();
  const referenceMaps = await loadBankTransactionReferenceMaps(supabase, connection);
  let newestSeenDate: string | null = null;

  await client.paginate<XeroListBankTransactionsResponse>(
    (page) => client.listBankTransactions({ page, where: 'Status=="AUTHORISED"' }) as Promise<XeroListBankTransactionsResponse>,
    async (page) => {
      const transactions = asArray(page.BankTransactions);
      if (!transactions.length) {
        return false;
      }

      const mappedRows = transactions
        .map((transaction) => mapBankTransaction(transaction, connection, referenceMaps))
        .filter((value): value is XeroBankTransactionInsert => value !== null);

      if (!mappedRows.length) {
        return true;
      }

      const existingByXeroId = await loadExistingBankTransactions(
        supabase,
        connection.platform_tenant_id,
        connection.xero_tenant_id,
        mappedRows.map((row) => row.xero_transaction_id),
      );

      const upsertRowsPayload = mappedRows.map((row) => {
        const existing = existingByXeroId.get(row.xero_transaction_id);
        newestSeenDate = maxIsoTimestamp(newestSeenDate, row.updated_xero_at ?? null);
        return mergeBankTransactionRow(row, existing);
      });

      await upsertXeroBankTransactions(upsertRowsPayload);

      return true;
    },
  );

  return newestSeenDate;
}

async function loadBankTransactionReferenceMaps(
  supabase: ReturnType<typeof createServiceRoleClient>,
  connection: SyncConnection,
): Promise<BankTransactionReferenceMaps> {
  const [accountsResult, contactsResult] = await Promise.all([
    supabase
      .from("xero_accounts")
      .select("id,xero_account_id")
      .eq("platform_tenant_id", connection.platform_tenant_id)
      .eq("xero_tenant_id", connection.xero_tenant_id),
    supabase
      .from("xero_contacts")
      .select("id,xero_contact_id")
      .eq("platform_tenant_id", connection.platform_tenant_id)
      .eq("xero_tenant_id", connection.xero_tenant_id),
  ]);

  if (accountsResult.error) {
    throw accountsResult.error;
  }

  if (contactsResult.error) {
    throw contactsResult.error;
  }

  return {
    accountsByXeroId: new Map(
      (accountsResult.data ?? []).map((account) => [account.xero_account_id, account.id]),
    ),
    contactsByXeroId: new Map(
      (contactsResult.data ?? []).map((contact) => [contact.xero_contact_id, contact.id]),
    ),
  };
}

async function updateLastSyncedAt(connectionId: string, newestSeenDate: string | null) {
  const supabase = createServiceRoleClient();
  const updatePayload: Database["public"]["Tables"]["xero_connections"]["Update"] = {
    last_synced_at: newestSeenDate ?? new Date().toISOString(),
  };

  const { error } = await supabase.from("xero_connections").update(updatePayload).eq("id", connectionId);
  if (error) {
    throw error;
  }
}

async function loadExistingBankTransactions(
  supabase: ReturnType<typeof createServiceRoleClient>,
  platformTenantId: string,
  xeroTenantId: string,
  transactionIds: string[],
) {
  const uniqueIds = Array.from(new Set(transactionIds));
  if (!uniqueIds.length) {
    return new Map<string, XeroBankTransactionRow>();
  }

  const { data, error } = await supabase
    .from("xero_bank_transactions")
    .select("*")
    .eq("platform_tenant_id", platformTenantId)
    .eq("xero_tenant_id", xeroTenantId)
    .in("xero_transaction_id", uniqueIds);

  if (error) {
    throw error;
  }

  return new Map((data ?? []).map((row) => [row.xero_transaction_id, row]));
}

async function upsertXeroAccounts(rows: XeroAccountInsert[]) {
  const supabase = createServiceRoleClient();
  const { error } = await supabase
    .from("xero_accounts")
    .upsert(rows, { onConflict: "platform_tenant_id,xero_tenant_id,xero_account_id" });
  if (error) {
    throw error;
  }
}

async function upsertXeroContacts(rows: XeroContactInsert[]) {
  const supabase = createServiceRoleClient();
  const { error } = await supabase
    .from("xero_contacts")
    .upsert(rows, { onConflict: "platform_tenant_id,xero_tenant_id,xero_contact_id" });
  if (error) {
    throw error;
  }
}

async function upsertXeroTaxRates(rows: XeroTaxRateInsert[]) {
  const supabase = createServiceRoleClient();
  const { error } = await supabase
    .from("xero_tax_rates")
    .upsert(rows, { onConflict: "platform_tenant_id,xero_tenant_id,xero_tax_type" });
  if (error) {
    throw error;
  }
}

async function upsertXeroBankTransactions(rows: XeroBankTransactionInsert[]) {
  const supabase = createServiceRoleClient();
  const { error } = await supabase
    .from("xero_bank_transactions")
    .upsert(rows, { onConflict: "platform_tenant_id,xero_tenant_id,xero_transaction_id" });
  if (error) {
    throw error;
  }
}

function mapAccount(accountValue: unknown, connection: SyncConnection): XeroAccountInsert | null {
  const account = asRecord(accountValue);
  const xeroAccountId = asString(account.AccountID);
  const name = asString(account.Name);

  if (!xeroAccountId || !name) {
    return null;
  }

  return {
    platform_tenant_id: connection.platform_tenant_id,
    xero_tenant_id: connection.xero_tenant_id,
    xero_account_id: xeroAccountId,
    code: asNullableString(account.Code),
    name,
    type: asNullableString(account.Type),
    class: asNullableString(account.Class),
    status: asNullableString(account.Status),
    tax_type: asNullableString(account.TaxType),
    enable_payments_to_account: asNullableBoolean(account.EnablePaymentsToAccount),
    show_in_expense_claims: asNullableBoolean(account.ShowInExpenseClaims),
    raw_json: toJson(account),
    updated_xero_at: parseXeroDate(account.UpdatedDateUTC),
    synced_at: new Date().toISOString(),
  };
}

function mapContact(contactValue: unknown, connection: SyncConnection): XeroContactInsert | null {
  const contact = asRecord(contactValue);
  const xeroContactId = asString(contact.ContactID);
  const name = asString(contact.Name);
  if (!xeroContactId || !name) {
    return null;
  }

  return {
    platform_tenant_id: connection.platform_tenant_id,
    xero_tenant_id: connection.xero_tenant_id,
    xero_contact_id: xeroContactId,
    name,
    email: asNullableString(contact.EmailAddress),
    is_supplier: asBoolean(contact.IsSupplier),
    is_customer: asBoolean(contact.IsCustomer),
    raw_json: toJson(contact),
    updated_xero_at: parseXeroDate(contact.UpdatedDateUTC),
    synced_at: new Date().toISOString(),
  };
}

function mapTaxRate(taxRateValue: unknown, connection: SyncConnection): XeroTaxRateInsert | null {
  const taxRate = asRecord(taxRateValue);
  const xeroTaxType = asString(taxRate.TaxType);
  const name = asString(taxRate.Name);

  if (!xeroTaxType || !name) {
    return null;
  }

  return {
    platform_tenant_id: connection.platform_tenant_id,
    xero_tenant_id: connection.xero_tenant_id,
    xero_tax_type: xeroTaxType,
    name,
    rate: asNullableNumber(taxRate.EffectiveRate),
    status: asNullableString(taxRate.Status),
    raw_json: toJson(taxRate),
    synced_at: new Date().toISOString(),
  };
}

function mapBankTransaction(
  txValue: unknown,
  connection: SyncConnection,
  references: BankTransactionReferenceMaps = {
    accountsByXeroId: new Map(),
    contactsByXeroId: new Map(),
  },
): XeroBankTransactionInsert | null {
  const tx = asRecord(txValue);
  const xeroTransactionId = asString(tx.BankTransactionID);
  if (!xeroTransactionId) {
    return null;
  }

  const bankAccount = asRecord(tx.BankAccount);
  const contact = asRecord(tx.Contact);
  const totalCents = toCents(tx.Total);
  const taxCents = toCents(tx.TotalTax);
  const subtotalCents = toCents(tx.SubTotal);
  const xeroBankAccountId = asString(bankAccount.AccountID);
  const xeroContactId = asString(contact.ContactID);

  return {
    platform_tenant_id: connection.platform_tenant_id,
    xero_tenant_id: connection.xero_tenant_id,
    xero_transaction_id: xeroTransactionId,
    bank_account_id: xeroBankAccountId ? references.accountsByXeroId.get(xeroBankAccountId) ?? null : null,
    type: asBankTransactionType(tx.Type),
    status: asNullableString(tx.Status),
    is_reconciled: asBoolean(tx.IsReconciled),
    contact_id: xeroContactId ? references.contactsByXeroId.get(xeroContactId) ?? null : null,
    date: parseXeroDateOnly(tx.Date),
    description: asNullableString(tx.Narration),
    reference: asNullableString(tx.Reference),
    currency: asNullableString(tx.CurrencyCode),
    total_cents: totalCents,
    tax_cents: taxCents,
    subtotal_cents: subtotalCents,
    raw_json: toJson(tx),
    updated_xero_at: parseXeroDate(tx.UpdatedDateUTC),
    synced_at: new Date().toISOString(),
  };
}

function mergeBankTransactionRow(
  incoming: XeroBankTransactionInsert,
  existing?: XeroBankTransactionRow,
): XeroBankTransactionInsert {
  if (!existing?.user_overridden_at) {
    return incoming;
  }

  return {
    ...incoming,
    bank_account_id: existing.bank_account_id,
    type: existing.type,
    is_reconciled: existing.is_reconciled,
    contact_id: existing.contact_id,
    date: existing.date,
    description: existing.description,
    reference: existing.reference,
    currency: existing.currency,
    total_cents: existing.total_cents,
    tax_cents: existing.tax_cents,
    subtotal_cents: existing.subtotal_cents,
    user_overridden_at: existing.user_overridden_at,
    user_override_json: existing.user_override_json,
  };
}

function parseXeroDate(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const epochMatch = /\/Date\((\d+)(?:[+-]\d+)?\)\//.exec(value);
  if (epochMatch) {
    const parsed = new Date(Number(epochMatch[1]));
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function parseXeroDateOnly(value: unknown): string | null {
  const iso = parseXeroDate(value);
  return iso ? iso.slice(0, 10) : null;
}

function toCents(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return Math.round(value * 100);
}

function maxIsoTimestamp(current: string | null, candidate: string | null): string | null {
  if (!candidate) {
    return current;
  }

  if (!current) {
    return candidate;
  }

  return Date.parse(candidate) > Date.parse(current) ? candidate : current;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asNullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asBoolean(value: unknown): boolean {
  return value === true;
}

function asNullableBoolean(value: unknown): boolean | null {
  if (value === true || value === false) {
    return value;
  }

  return null;
}

function asNullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asBankTransactionType(value: unknown): XeroBankTransactionInsert["type"] {
  if (
    value === "SPEND" ||
    value === "RECEIVE" ||
    value === "SPEND-TRANSFER" ||
    value === "RECEIVE-TRANSFER"
  ) {
    return value;
  }

  return null;
}

function toJson(value: Record<string, unknown>): Json {
  return value as Json;
}

export const xeroTenantInitialSyncInternals = {
  mapAccount,
  mapContact,
  mapTaxRate,
  mapBankTransaction,
  mergeBankTransactionRow,
  parseXeroDate,
  parseXeroDateOnly,
  toCents,
  maxIsoTimestamp,
};

export { RetryableXeroError };
