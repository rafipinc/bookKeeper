import { inngest } from "@/lib/inngest/client";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import type { Database } from "@/lib/supabase/types";

type TransactionRuleMatchInsert = Database["public"]["Tables"]["transaction_rule_matches"]["Insert"];

const DEFAULT_MODEL = process.env.OPENAI_RECONCILIATION_MODEL ?? "gpt-4o-mini";
const OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions";
const MAX_ACCOUNTS = 150;
const MAX_CONTACTS = 50;
const MAX_PAST_SUGGESTIONS = 20;
const MAX_TENANT_TXN_SAMPLE = 500;
const TOKEN_BUDGET = 6_000;
const CHARS_PER_TOKEN = 4;

export type PastSuggestion = {
  description: string | null;
  categoryId: string | null;
};

export type AISuggestionContext = {
  transactionId: string;
  description: string | null;
  amountCents: number | null;
  date: string | null;
  reference: string | null;
  transactionType: "SPEND" | "RECEIVE" | "SPEND-TRANSFER" | "RECEIVE-TRANSFER" | null;
  bankAccountName: string | null;
  accounts: Array<{ xero_account_id: string; code: string | null; name: string }>;
  contacts: Array<{ xero_contact_id: string; name: string }>;
  taxRates: Array<{ xero_tax_type: string; name: string }>;
  pastSuggestions: PastSuggestion[];
};

export type AISuggestionResult = {
  categoryId: string | null;
  contactId: string | null;
  confidence: number;
  model: string;
};

export const aiSuggestion = inngest.createFunction(
  {
    id: "ai-suggestion",
    retries: 0,
    triggers: [{ event: "xero/bank_transaction.no_rule_match" }],
  },
  async ({ event, step }) => {
    const transactionId = readString(event.data, "transactionId");
    const platformTenantId = readString(event.data, "platformTenantId");
    const xeroTenantId = readString(event.data, "xeroTenantId");

    const context = await step.run("load suggestion context", async () =>
      aiSuggestionInternals.loadContext(transactionId, platformTenantId, xeroTenantId),
    );

    if (!context) {
      return { transactionId, skipped: "transaction-not-found" };
    }

    const suggestion = await step.run("call openai", async () =>
      aiSuggestionInternals.callOpenAI(context),
    );

    if (!suggestion) {
      return { transactionId, inserted: false };
    }

    await step.run("write ai match", async () =>
      aiSuggestionInternals.writeAIMatch(transactionId, suggestion),
    );

    return { transactionId, inserted: true };
  },
);

async function loadContext(
  transactionId: string,
  platformTenantId: string,
  xeroTenantId: string,
): Promise<AISuggestionContext | null> {
  const supabase = createServiceRoleClient();

  const { data: txn, error: txnError } = await supabase
    .from("xero_bank_transactions")
    .select("id,description,total_cents,date,reference,type,bank_account_id")
    .eq("id", transactionId)
    .eq("platform_tenant_id", platformTenantId)
    .eq("xero_tenant_id", xeroTenantId)
    .maybeSingle();

  if (txnError) throw txnError;
  if (!txn) return null;

  const isSpend = txn.type === "SPEND" || txn.type === "SPEND-TRANSFER";
  const isReceive = txn.type === "RECEIVE" || txn.type === "RECEIVE-TRANSFER";
  const accountClass = isSpend ? "EXPENSE" : isReceive ? "REVENUE" : null;

  let accountsQuery = supabase
    .from("xero_accounts")
    .select("xero_account_id,code,name")
    .eq("platform_tenant_id", platformTenantId)
    .eq("xero_tenant_id", xeroTenantId)
    .eq("status", "ACTIVE")
    .limit(MAX_ACCOUNTS);

  accountsQuery = accountClass
    ? accountsQuery.eq("class", accountClass)
    : accountsQuery.in("class", ["EXPENSE", "REVENUE"]);

  const [bankAccResult, accountsResult, allContactsResult, taxRatesResult, tenantTxnsResult] =
    await Promise.all([
      txn.bank_account_id
        ? supabase
            .from("xero_accounts")
            .select("name")
            .eq("id", txn.bank_account_id)
            .eq("platform_tenant_id", platformTenantId)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      accountsQuery,
      supabase
        .from("xero_contacts")
        .select("xero_contact_id,name")
        .eq("platform_tenant_id", platformTenantId)
        .eq("xero_tenant_id", xeroTenantId),
      supabase
        .from("xero_tax_rates")
        .select("xero_tax_type,name")
        .eq("platform_tenant_id", platformTenantId)
        .eq("xero_tenant_id", xeroTenantId)
        .eq("status", "ACTIVE"),
      // Sample recent tenant transactions for few-shot past-suggestions lookup
      supabase
        .from("xero_bank_transactions")
        .select("id,description")
        .eq("platform_tenant_id", platformTenantId)
        .eq("xero_tenant_id", xeroTenantId)
        .order("date", { ascending: false })
        .limit(MAX_TENANT_TXN_SAMPLE),
    ]);

  if (bankAccResult.error) throw bankAccResult.error;
  if (accountsResult.error) throw accountsResult.error;
  if (allContactsResult.error) throw allContactsResult.error;
  if (taxRatesResult.error) throw taxRatesResult.error;
  if (tenantTxnsResult.error) throw tenantTxnsResult.error;

  const tenantTxnMap = new Map(
    (tenantTxnsResult.data ?? []).map((t) => [t.id, t.description]),
  );
  const tenantTxnIds = Array.from(tenantTxnMap.keys());

  let pastSuggestions: PastSuggestion[] = [];
  if (tenantTxnIds.length > 0) {
    const { data: matchRows, error: matchError } = await supabase
      .from("transaction_rule_matches")
      .select("xero_bank_transaction_id,suggested_category_id")
      .in("xero_bank_transaction_id", tenantTxnIds)
      .eq("action_applied", true)
      .order("accepted_at", { ascending: false })
      .limit(MAX_PAST_SUGGESTIONS);
    if (matchError) throw matchError;

    pastSuggestions = (matchRows ?? []).map((row) => ({
      description: tenantTxnMap.get(row.xero_bank_transaction_id) ?? null,
      categoryId: row.suggested_category_id,
    }));
  }

  const rankedContacts = fuzzyRankContacts(
    allContactsResult.data ?? [],
    txn.description,
  ).slice(0, MAX_CONTACTS);

  return {
    transactionId,
    description: txn.description,
    amountCents: txn.total_cents,
    date: txn.date,
    reference: txn.reference,
    transactionType: txn.type,
    bankAccountName: (bankAccResult.data as { name?: string } | null)?.name ?? null,
    accounts: accountsResult.data ?? [],
    contacts: rankedContacts,
    taxRates: taxRatesResult.data ?? [],
    pastSuggestions,
  };
}

export async function callOpenAI(
  context: AISuggestionContext,
): Promise<AISuggestionResult | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("[ai-suggestion] OPENAI_API_KEY not set");
    return null;
  }

  const model = DEFAULT_MODEL;
  const messages = buildPromptMessages(context);

  try {
    const response = await fetch(OPENAI_CHAT_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages,
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "bank_transaction_suggestion",
            strict: true,
            schema: suggestionSchema,
          },
        },
      }),
    });

    if (!response.ok) {
      console.error(`[ai-suggestion] OpenAI HTTP ${response.status}`);
      return null;
    }

    const payload = (await response.json()) as Record<string, unknown>;
    const responseModel = typeof payload.model === "string" ? payload.model : model;
    const content = extractContent(payload);
    if (!content) {
      console.error("[ai-suggestion] Missing content in OpenAI response");
      return null;
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(content) as Record<string, unknown>;
    } catch {
      console.error("[ai-suggestion] Malformed JSON in OpenAI response");
      return null;
    }

    return normalizeSuggestion(parsed, responseModel);
  } catch {
    console.error("[ai-suggestion] OpenAI request failed");
    return null;
  }
}

async function writeAIMatch(
  transactionId: string,
  suggestion: AISuggestionResult,
): Promise<void> {
  const row: TransactionRuleMatchInsert = {
    xero_bank_transaction_id: transactionId,
    rule_id: null,
    rule_version_id: null,
    suggestion_source: "ai",
    matched_at: new Date().toISOString(),
    action_applied: false,
    accepted_at: null,
    override_by_user_id: null,
    override_at: null,
    ai_confidence: suggestion.confidence,
    ai_model: suggestion.model,
    suggested_category_id: suggestion.categoryId,
    suggested_contact_id: suggestion.contactId,
    suggested_project_id: null,
    suggested_tax_rate_id: null,
  };

  const { error } = await createServiceRoleClient()
    .from("transaction_rule_matches")
    .upsert(row, { onConflict: "xero_bank_transaction_id,suggestion_source" });
  if (error) throw error;
}

export function buildPromptMessages(
  context: AISuggestionContext,
): Array<{ role: string; content: string }> {
  const systemMessage =
    "You are a bookkeeping assistant. Categorize the bank transaction using the available chart of accounts and contacts. Return category_id (a xero_account_id or null), contact_id (a xero_contact_id or null), and confidence (0–1 float).";

  const amountDollars =
    context.amountCents != null ? (context.amountCents / 100).toFixed(2) : null;

  const parts: string[] = [];

  parts.push("## Transaction");
  parts.push(`Description: ${context.description ?? "(none)"}`);
  parts.push(`Amount: ${amountDollars != null ? `$${amountDollars}` : "(unknown)"}`);
  parts.push(`Date: ${context.date ?? "(unknown)"}`);
  parts.push(`Bank account: ${context.bankAccountName ?? "(unknown)"}`);
  if (context.reference) {
    parts.push(`Reference: ${context.reference}`);
  }

  if (context.pastSuggestions.length > 0) {
    parts.push("\n## Recent accepted categorizations");
    for (const s of context.pastSuggestions) {
      parts.push(`- "${s.description ?? ""}" → ${s.categoryId ?? "(none)"}`);
    }
  }

  parts.push("\n## Chart of accounts");
  for (const acc of context.accounts) {
    const code = acc.code ? `[${acc.code}] ` : "";
    parts.push(`- ${code}${acc.name} (id: ${acc.xero_account_id})`);
  }

  if (context.contacts.length > 0) {
    parts.push("\n## Contacts");
    for (const c of context.contacts) {
      parts.push(`- ${c.name} (id: ${c.xero_contact_id})`);
    }
  }

  if (context.taxRates.length > 0) {
    parts.push("\n## Tax rates");
    for (const t of context.taxRates) {
      parts.push(`- ${t.name} (type: ${t.xero_tax_type})`);
    }
  }

  let userContent = parts.join("\n");

  // Enforce token budget by truncating at the character approximation
  const charBudget = TOKEN_BUDGET * CHARS_PER_TOKEN;
  if (userContent.length > charBudget) {
    userContent = userContent.slice(0, charBudget);
  }

  return [
    { role: "system", content: systemMessage },
    { role: "user", content: userContent },
  ];
}

function fuzzyRankContacts(
  contacts: Array<{ xero_contact_id: string; name: string }>,
  description: string | null,
): Array<{ xero_contact_id: string; name: string }> {
  if (!description) return contacts;

  const descWords = new Set(description.toLowerCase().match(/\w+/g) ?? []);
  if (!descWords.size) return contacts;

  return [...contacts].sort((a, b) => {
    return wordOverlapScore(b.name, descWords) - wordOverlapScore(a.name, descWords);
  });
}

function wordOverlapScore(name: string, descWords: Set<string>): number {
  const words = name.toLowerCase().match(/\w+/g) ?? [];
  return words.filter((w) => descWords.has(w)).length;
}

function extractContent(payload: Record<string, unknown>): string | null {
  const choices = Array.isArray(payload.choices) ? payload.choices : [];
  const first = choices[0];
  if (!first || typeof first !== "object") return null;
  const message = (first as Record<string, unknown>).message;
  if (!message || typeof message !== "object") return null;
  const content = (message as Record<string, unknown>).content;
  return typeof content === "string" && content.trim().length > 0 ? content : null;
}

function normalizeSuggestion(
  parsed: Record<string, unknown>,
  model: string,
): AISuggestionResult | null {
  if (typeof parsed.confidence !== "number" || !Number.isFinite(parsed.confidence)) {
    return null;
  }
  const confidence = Math.max(0, Math.min(1, parsed.confidence));

  const categoryId =
    typeof parsed.category_id === "string" && parsed.category_id.trim().length > 0
      ? parsed.category_id.trim()
      : null;

  const contactId =
    typeof parsed.contact_id === "string" && parsed.contact_id.trim().length > 0
      ? parsed.contact_id.trim()
      : null;

  return { categoryId, contactId, confidence, model };
}

function readString(payload: unknown, field: string): string {
  if (typeof payload !== "object" || payload === null) {
    throw new Error("Event payload missing object body.");
  }
  const value = (payload as Record<string, unknown>)[field];
  if (typeof value !== "string" || !value) {
    throw new Error(`Event payload missing ${field}.`);
  }
  return value;
}

const suggestionSchema = {
  type: "object",
  additionalProperties: false,
  required: ["category_id", "contact_id", "confidence"],
  properties: {
    category_id: { type: ["string", "null"] },
    contact_id: { type: ["string", "null"] },
    confidence: { type: "number" },
  },
} as const;

export const aiSuggestionInternals = {
  loadContext,
  callOpenAI,
  writeAIMatch,
};
