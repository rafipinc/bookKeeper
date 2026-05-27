import { inngest } from "@/lib/inngest/client";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import type { Database } from "@/lib/supabase/types";
import { XeroClient, XeroNotModifiedError } from "@/lib/xero/client";
import { xeroTenantInitialSyncInternals } from "./xero-tenant-initial-sync";

type XeroConnectionRow = Database["public"]["Tables"]["xero_connections"]["Row"];
type XeroAccountInsert = Database["public"]["Tables"]["xero_accounts"]["Insert"];
type XeroContactInsert = Database["public"]["Tables"]["xero_contacts"]["Insert"];
type XeroTaxRateInsert = Database["public"]["Tables"]["xero_tax_rates"]["Insert"];
type XeroBankTransactionInsert = Database["public"]["Tables"]["xero_bank_transactions"]["Insert"];
type XeroBankTransactionRow = Database["public"]["Tables"]["xero_bank_transactions"]["Row"];

type DeltaConnection = Pick<
  XeroConnectionRow,
  "id" | "platform_tenant_id" | "xero_tenant_id" | "status" | "last_synced_at"
>;

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

type BankTransactionReferenceMaps = {
  accountsByXeroId: Map<string, string>;
  contactsByXeroId: Map<string, string>;
};

export const xeroTenantDeltaSyncAll = inngest.createFunction(
  {
    id: "xero-tenant-delta-sync-all",
    triggers: [{ cron: "*/15 * * * *" }],
  },
  async ({ step }) => {
    const connections = await step.run("load active connections", loadActiveConnections);

    if (!connections.length) {
      return { enqueued: 0 };
    }

    await step.run("enqueue delta syncs", async () =>
      inngest.send(
        connections.map((connection) => ({
          name: "xero/tenant.sync.delta",
          data: {
            connectionId: connection.id,
            platformTenantId: connection.platform_tenant_id,
            xeroTenantId: connection.xero_tenant_id,
          },
        })),
      ),
    );

    return { enqueued: connections.length };
  },
);

export const xeroTenantDeltaSync = inngest.createFunction(
  {
    id: "xero-tenant-delta-sync",
    retries: 5,
    concurrency: {
      key: "event.data.connectionId",
      limit: 1,
    },
    triggers: [{ event: "xero/tenant.sync.delta" }],
  },
  async ({ event, step }) => {
    const connection = await step.run("load connection", async () => loadDeltaConnection(event.data));

    if (!connection.last_synced_at) {
      await step.run("enqueue initial sync", async () =>
        inngest.send({
          name: "xero/tenant.sync.initial",
          data: {
            connectionId: connection.id,
            platformTenantId: connection.platform_tenant_id,
            xeroTenantId: connection.xero_tenant_id,
          },
        }),
      );

      return {
        connectionId: connection.id,
        redirectedToInitialSync: true,
      };
    }

    const xeroClient = new XeroClient(connection.id);
    const since = connection.last_synced_at;

    const accountsChanged = await step.run("sync accounts delta", async () =>
      syncAccountsDelta(xeroClient, connection, since),
    );
    const contactsChanged = await step.run("sync contacts delta", async () =>
      syncContactsDelta(xeroClient, connection, since),
    );
    const taxRatesChanged = await step.run("sync tax rates delta", async () =>
      syncTaxRatesDelta(xeroClient, connection, since),
    );
    const bankTransactionResult = await step.run("sync bank transactions delta", async () =>
      syncBankTransactionsDelta(xeroClient, connection, since),
    );

    if (bankTransactionResult.insertedIds.length) {
      await step.run("emit new bank transaction events", async () =>
        inngest.send(
          bankTransactionResult.insertedIds.map((transactionId) => ({
            name: "xero/bank_transaction.created",
            data: {
              transactionId,
              connectionId: connection.id,
              platformTenantId: connection.platform_tenant_id,
              xeroTenantId: connection.xero_tenant_id,
            },
          })),
        ),
      );
    }

    await step.run("update last_synced_at", async () => updateLastSyncedAt(connection.id));

    return {
      connectionId: connection.id,
      accountsChanged,
      contactsChanged,
      taxRatesChanged,
      bankTransactionsChanged: bankTransactionResult.changed,
      insertedBankTransactions: bankTransactionResult.insertedIds.length,
      newestSeenDate: bankTransactionResult.newestSeenDate,
    };
  },
);

async function loadActiveConnections(): Promise<Array<Pick<DeltaConnection, "id" | "platform_tenant_id" | "xero_tenant_id">>> {
  const { data, error } = await createServiceRoleClient()
    .from("xero_connections")
    .select("id,platform_tenant_id,xero_tenant_id")
    .eq("status", "active");

  if (error) {
    throw error;
  }

  return data ?? [];
}

async function loadDeltaConnection(payload: unknown): Promise<DeltaConnection> {
  const connectionId = asRecord(payload).connectionId;
  if (typeof connectionId !== "string" || !connectionId) {
    throw new Error("Missing connectionId.");
  }

  const { data: connection, error } = await createServiceRoleClient()
    .from("xero_connections")
    .select("id,platform_tenant_id,xero_tenant_id,status,last_synced_at")
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

async function syncAccountsDelta(client: XeroClient, connection: DeltaConnection, since: string): Promise<number> {
  const response = await getModified(() => client.listAccounts({ ifModifiedSince: since }) as Promise<XeroListAccountsResponse>);
  const rows = asArray(response?.Accounts)
    .map((account) => xeroTenantInitialSyncInternals.mapAccount(account, connection))
    .filter((value): value is XeroAccountInsert => value !== null);

  if (!rows.length) {
    return 0;
  }

  await upsertXeroAccounts(rows);
  return rows.length;
}

async function syncContactsDelta(client: XeroClient, connection: DeltaConnection, since: string): Promise<number> {
  let changed = 0;

  await paginateModified<XeroListContactsResponse & XeroListBankTransactionsResponse>(
    (page) => client.listContacts({ ifModifiedSince: since, page }) as Promise<XeroListContactsResponse & XeroListBankTransactionsResponse>,
    async (response) => {
      const rows = asArray(response.Contacts)
        .map((contact) => xeroTenantInitialSyncInternals.mapContact(contact, connection))
        .filter((value): value is XeroContactInsert => value !== null);

      if (!rows.length) {
        return false;
      }

      await upsertXeroContacts(rows);
      changed += rows.length;
      return true;
    },
  );

  return changed;
}

async function syncTaxRatesDelta(client: XeroClient, connection: DeltaConnection, since: string): Promise<number> {
  const response = await getModified(() => client.listTaxRates({ ifModifiedSince: since }) as Promise<XeroListTaxRatesResponse>);
  const rows = asArray(response?.TaxRates)
    .map((taxRate) => xeroTenantInitialSyncInternals.mapTaxRate(taxRate, connection))
    .filter((value): value is XeroTaxRateInsert => value !== null);

  if (!rows.length) {
    return 0;
  }

  await upsertXeroTaxRates(rows);
  return rows.length;
}

async function syncBankTransactionsDelta(
  client: XeroClient,
  connection: DeltaConnection,
  since: string,
): Promise<{ changed: number; insertedIds: string[]; newestSeenDate: string | null }> {
  const supabase = createServiceRoleClient();
  const referenceMaps = await loadBankTransactionReferenceMaps(supabase, connection);
  const insertedXeroIds = new Set<string>();
  let changed = 0;
  let newestSeenDate: string | null = null;

  await paginateModified<XeroListBankTransactionsResponse>(
    (page) =>
      client.listBankTransactions({
        ifModifiedSince: since,
        page,
        where: 'Status=="AUTHORISED"',
      }) as Promise<XeroListBankTransactionsResponse>,
    async (response) => {
      const mappedRows = asArray(response.BankTransactions)
        .map((transaction) => xeroTenantInitialSyncInternals.mapBankTransaction(transaction, connection, referenceMaps))
        .filter((value): value is XeroBankTransactionInsert => value !== null);

      if (!mappedRows.length) {
        return false;
      }

      const existingByXeroId = await loadExistingBankTransactions(
        supabase,
        connection.platform_tenant_id,
        connection.xero_tenant_id,
        mappedRows.map((row) => row.xero_transaction_id),
      );

      const upsertRows = mappedRows.map((row) => {
        const existing = existingByXeroId.get(row.xero_transaction_id);
        if (!existing) {
          insertedXeroIds.add(row.xero_transaction_id);
        }
        newestSeenDate = xeroTenantInitialSyncInternals.maxIsoTimestamp(newestSeenDate, row.updated_xero_at ?? null);
        return xeroTenantInitialSyncInternals.mergeBankTransactionRow(row, existing);
      });

      const upsertedRows = await upsertXeroBankTransactions(upsertRows);
      changed += upsertedRows.length;
      return true;
    },
  );

  if (!insertedXeroIds.size) {
    return { changed, insertedIds: [], newestSeenDate };
  }

  const insertedRows = await loadExistingBankTransactions(
    supabase,
    connection.platform_tenant_id,
    connection.xero_tenant_id,
    Array.from(insertedXeroIds),
  );

  return {
    changed,
    insertedIds: Array.from(insertedRows.values()).map((row) => row.id),
    newestSeenDate,
  };
}

async function getModified<T>(operation: () => Promise<T>): Promise<T | null> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof XeroNotModifiedError) {
      return null;
    }
    throw error;
  }
}

async function paginateModified<T extends { pageInfo?: { totalPages?: number }; pagination?: { pageCount?: number } }>(
  fetchPage: (page: number) => Promise<T>,
  onPage: (page: T) => Promise<boolean>,
) {
  let pageNumber = 1;

  while (true) {
    const response = await getModified(() => fetchPage(pageNumber));
    if (!response) {
      return;
    }

    const shouldContinue = await onPage(response);
    if (!shouldContinue) {
      return;
    }

    const totalPages = response.pageInfo?.totalPages ?? response.pagination?.pageCount;
    if (!totalPages || pageNumber >= totalPages) {
      return;
    }

    pageNumber += 1;
  }
}

async function loadBankTransactionReferenceMaps(
  supabase: ReturnType<typeof createServiceRoleClient>,
  connection: DeltaConnection,
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
    accountsByXeroId: new Map((accountsResult.data ?? []).map((account) => [account.xero_account_id, account.id])),
    contactsByXeroId: new Map((contactsResult.data ?? []).map((contact) => [contact.xero_contact_id, contact.id])),
  };
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

async function updateLastSyncedAt(connectionId: string) {
  const updatePayload: Database["public"]["Tables"]["xero_connections"]["Update"] = {
    last_synced_at: new Date().toISOString(),
  };

  const { error } = await createServiceRoleClient().from("xero_connections").update(updatePayload).eq("id", connectionId);
  if (error) {
    throw error;
  }
}

async function upsertXeroAccounts(rows: XeroAccountInsert[]) {
  const { error } = await createServiceRoleClient()
    .from("xero_accounts")
    .upsert(rows, { onConflict: "platform_tenant_id,xero_tenant_id,xero_account_id" });
  if (error) {
    throw error;
  }
}

async function upsertXeroContacts(rows: XeroContactInsert[]) {
  const { error } = await createServiceRoleClient()
    .from("xero_contacts")
    .upsert(rows, { onConflict: "platform_tenant_id,xero_tenant_id,xero_contact_id" });
  if (error) {
    throw error;
  }
}

async function upsertXeroTaxRates(rows: XeroTaxRateInsert[]) {
  const { error } = await createServiceRoleClient()
    .from("xero_tax_rates")
    .upsert(rows, { onConflict: "platform_tenant_id,xero_tenant_id,xero_tax_type" });
  if (error) {
    throw error;
  }
}

async function upsertXeroBankTransactions(rows: XeroBankTransactionInsert[]): Promise<XeroBankTransactionRow[]> {
  const { data, error } = await createServiceRoleClient()
    .from("xero_bank_transactions")
    .upsert(rows, { onConflict: "platform_tenant_id,xero_tenant_id,xero_transaction_id" })
    .select("*");
  if (error) {
    throw error;
  }

  return data ?? [];
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export const xeroTenantDeltaSyncInternals = {
  getModified,
  loadDeltaConnection,
  syncBankTransactionsDelta,
};

