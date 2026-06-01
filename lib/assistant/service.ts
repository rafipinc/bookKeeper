import { ensureUserPlatformTenant, type TypedSupabaseClient } from "@/lib/supabase/tenant-scoped";

const OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions";
const DEFAULT_MODEL = "gpt-4.1-nano";
const MAX_TOOL_ROUNDS = 3;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 25;

export type AssistantConnectionSummary = {
  id: string;
  xero_tenant_id: string;
  xero_tenant_name: string | null;
  status: "active" | "reauth_required" | "disconnected";
  last_synced_at: string | null;
  scopes: string[];
  created_at: string;
};

export type AssistantTenantContext = {
  platformTenantId: string;
  connections: AssistantConnectionSummary[];
  activeConnection: AssistantConnectionSummary | null;
};

export type AssistantToolName =
  | "queue_summary"
  | "queue_detail"
  | "account_lookup"
  | "contact_lookup"
  | "sync_status"
  | "accept_suggestion";

export type AssistantToolCall = {
  id: string;
  name: AssistantToolName;
  arguments: string;
};

export type AssistantToolExecutionResult = {
  toolCallId: string;
  name: AssistantToolName;
  output: Record<string, unknown>;
};

export type AssistantRunResult =
  | {
      status: "ok";
      model: string;
      reply: string;
      toolTrace: AssistantToolExecutionResult[];
    }
  | {
      status: "fallback";
      model: string;
      reason: string;
      reply: string | null;
      toolTrace: AssistantToolExecutionResult[];
    };

type QueryLike = {
  select: (columns: string, options?: { count?: "exact"; head?: boolean }) => QueryLike;
  eq: (column: string, value: string | boolean | null) => QueryLike;
  in: (column: string, values: string[]) => QueryLike;
  ilike: (column: string, value: string) => QueryLike;
  order: (column: string, options?: { ascending?: boolean }) => QueryLike;
  limit: (value: number) => QueryLike;
  maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: Error | null }>;
  single?: () => Promise<{ data: Record<string, unknown> | null; error: Error | null }>;
  update?: (values: Record<string, unknown>) => QueryLike;
};

type AssistantSupabaseClient = Pick<TypedSupabaseClient, "from" | "rpc">;

type OpenAIChatResponse = {
  choices?: Array<{
    message?: {
      content?: string | null;
      tool_calls?: Array<{
        id: string;
        type: "function";
        function: {
          name: AssistantToolName;
          arguments: string;
        };
      }>;
    };
  }>;
  model?: string;
};

const assistantToolDefinitions = [
  {
    type: "function" as const,
    function: {
      name: "queue_summary",
      description:
        "Summarise the current tenant's unreconciled Xero bank feed queue, including count and recent items.",
      strict: true,
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "queue_detail",
      description:
        "Load a single unreconciled transaction and its suggestion history for the current tenant.",
      strict: true,
      parameters: {
        type: "object",
        properties: {
          transaction_id: { type: "string" },
        },
        required: ["transaction_id"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "account_lookup",
      description:
        "Search the current tenant's chart of accounts for matching account names or codes.",
      strict: true,
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
          limit: { type: "integer", minimum: 1, maximum: MAX_LIMIT },
        },
        required: ["query"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "contact_lookup",
      description:
        "Search the current tenant's synced contacts for a matching name or email fragment.",
      strict: true,
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
          limit: { type: "integer", minimum: 1, maximum: MAX_LIMIT },
        },
        required: ["query"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "sync_status",
      description:
        "Report the current tenant's Xero connection health, sync timestamps, and scopes.",
      strict: true,
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "accept_suggestion",
      description:
        "Accept one existing reconciliation suggestion after explicit user confirmation.",
      strict: true,
      parameters: {
        type: "object",
        properties: {
          match_id: { type: "string" },
          confirm: { type: "boolean" },
        },
        required: ["match_id", "confirm"],
        additionalProperties: false,
      },
    },
  },
] as const;

export function resolveAssistantModel(env: NodeJS.ProcessEnv = process.env): string {
  const candidate = env.OPENAI_ASSISTANT_MODEL?.trim();
  return candidate && candidate.length > 0 ? candidate : DEFAULT_MODEL;
}

export function buildAssistantTools() {
  return assistantToolDefinitions;
}

export async function loadAssistantTenantContext(
  supabase: AssistantSupabaseClient,
  userId: string,
): Promise<AssistantTenantContext> {
  const platformTenantId = await ensureUserPlatformTenant(supabase, userId);

  const { data, error } = await supabase
    .from("xero_connections")
    .select("id,xero_tenant_id,xero_tenant_name,status,last_synced_at,scopes,created_at")
    .eq("platform_tenant_id", platformTenantId)
    .order("created_at", { ascending: false });

  if (error) throw error;

  const connections = (data ?? []) as AssistantConnectionSummary[];
  const activeConnection = connections.find((connection) => connection.status === "active") ?? null;

  return { platformTenantId, connections, activeConnection };
}

export async function loadQueueSummary(
  supabase: AssistantSupabaseClient,
  context: AssistantTenantContext,
): Promise<Record<string, unknown>> {
  if (!context.activeConnection) {
    return {
      ok: false,
      error: "no_active_connection",
      connections: context.connections.map(connectionSummary),
    };
  }

  const { platformTenantId, activeConnection } = context;
  const { xero_tenant_id: xeroTenantId } = activeConnection;

  const [countResult, rowsResult] = await Promise.all([
    supabase
      .from("xero_bank_transactions")
      .select("id", { count: "exact", head: true })
      .eq("platform_tenant_id", platformTenantId)
      .eq("xero_tenant_id", xeroTenantId)
      .eq("is_reconciled", false),
    supabase
      .from("xero_bank_transactions")
      .select(
        `id, description, date, total_cents, type,
         transaction_rule_matches (
           id, suggestion_source, action_applied, accepted_at, override_at,
           ai_model, ai_confidence, suggested_category_id, suggested_contact_id
         )`,
      )
      .eq("platform_tenant_id", platformTenantId)
      .eq("xero_tenant_id", xeroTenantId)
      .eq("is_reconciled", false)
      .order("date", { ascending: false })
      .limit(5),
  ]);

  if (countResult.error) throw countResult.error;
  if (rowsResult.error) throw rowsResult.error;

  return {
    ok: true,
    queue: {
      count: countResult.count ?? 0,
      connection: connectionSummary(activeConnection),
      recent: (rowsResult.data ?? []).map(normalizeQueueRow),
    },
  };
}

export async function loadQueueDetail(
  supabase: AssistantSupabaseClient,
  context: AssistantTenantContext,
  transactionId: string,
): Promise<Record<string, unknown>> {
  if (!context.activeConnection) {
    return {
      ok: false,
      error: "no_active_connection",
      transaction_id: transactionId,
    };
  }

  const { platformTenantId, activeConnection } = context;
  const { xero_tenant_id: xeroTenantId } = activeConnection;

  const { data: txn, error: txnError } = await supabase
    .from("xero_bank_transactions")
    .select(
      `id, description, date, total_cents, type, reference, bank_account_id, raw_json,
       transaction_rule_matches (
         id, suggestion_source,
         suggested_category_id, suggested_contact_id,
         suggested_project_id, suggested_tax_rate_id,
         action_applied, accepted_at, override_at, ai_model, ai_confidence,
         rule_id, rule_version_id, matched_at
       )`,
    )
    .eq("id", transactionId)
    .eq("platform_tenant_id", platformTenantId)
    .eq("xero_tenant_id", xeroTenantId)
    .maybeSingle();

  if (txnError) throw txnError;
  if (!txn) {
    return { ok: false, error: "transaction_not_found", transaction_id: transactionId };
  }

  const matches = normalizeMatches(txn.transaction_rule_matches);
  const match = matches.find((entry) => entry.suggestion_source === "rule") ?? matches.find((entry) => entry.suggestion_source === "ai") ?? null;

  const [bankAccountName, category, contact, accounts, contacts] = await Promise.all([
    txn.bank_account_id
      ? supabase
          .from("xero_accounts")
          .select("name")
          .eq("id", String(txn.bank_account_id))
          .eq("platform_tenant_id", platformTenantId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    match?.suggested_category_id
      ? supabase
          .from("xero_accounts")
          .select("name,code")
          .eq("platform_tenant_id", platformTenantId)
          .eq("xero_tenant_id", xeroTenantId)
          .eq("xero_account_id", String(match.suggested_category_id))
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    match?.suggested_contact_id
      ? supabase
          .from("xero_contacts")
          .select("name")
          .eq("platform_tenant_id", platformTenantId)
          .eq("xero_tenant_id", xeroTenantId)
          .eq("xero_contact_id", String(match.suggested_contact_id))
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase
      .from("xero_accounts")
      .select("xero_account_id,name,code")
      .eq("platform_tenant_id", platformTenantId)
      .eq("xero_tenant_id", xeroTenantId)
      .eq("status", "ACTIVE")
      .in("class", ["EXPENSE", "REVENUE"])
      .order("name"),
    supabase
      .from("xero_contacts")
      .select("xero_contact_id,name,email")
      .eq("platform_tenant_id", platformTenantId)
      .eq("xero_tenant_id", xeroTenantId)
      .order("name")
      .limit(DEFAULT_LIMIT),
  ]);

  if (bankAccountName.error) throw bankAccountName.error;
  if (category.error) throw category.error;
  if (contact.error) throw contact.error;
  if (accounts.error) throw accounts.error;
  if (contacts.error) throw contacts.error;

  const suggestionHistory = matches.map((entry) => ({
    id: entry.id,
    suggestion_source: entry.suggestion_source,
    matched_at: entry.matched_at,
    action_applied: entry.action_applied,
    accepted_at: entry.accepted_at,
    override_at: entry.override_at,
    ai_model: entry.ai_model,
    ai_confidence: entry.ai_confidence,
    rule_id: entry.rule_id,
    rule_version_id: entry.rule_version_id,
  }));

  return {
    ok: true,
    transaction: {
      id: txn.id,
      description: txn.description,
      date: txn.date,
      total_cents: txn.total_cents,
      type: txn.type,
      reference: txn.reference,
      bank_account_name: valueOrNull(bankAccountName.data, "name"),
      suggestion: match
        ? {
            ...match,
            suggested_category_name: valueOrNull(category.data, "name"),
            suggested_category_code: valueOrNull(category.data, "code"),
            suggested_contact_name: valueOrNull(contact.data, "name"),
          }
        : null,
      suggestion_history: suggestionHistory,
      account_options: (accounts.data ?? []).map((row) => ({
        id: row.xero_account_id,
        code: row.code,
        name: row.name,
      })),
      contact_options: (contacts.data ?? []).map((row) => ({
        id: row.xero_contact_id,
        name: row.name,
        email: row.email,
      })),
    },
  };
}

export async function loadAccountLookup(
  supabase: AssistantSupabaseClient,
  context: AssistantTenantContext,
  query: string,
  limit = DEFAULT_LIMIT,
): Promise<Record<string, unknown>> {
  if (!context.activeConnection) {
    return { ok: false, error: "no_active_connection", query };
  }

  const normalizedLimit = clampLimit(limit);
  const { platformTenantId, activeConnection } = context;

  const { data, error } = await supabase
    .from("xero_accounts")
    .select("xero_account_id,code,name,class,status")
    .eq("platform_tenant_id", platformTenantId)
    .eq("xero_tenant_id", activeConnection.xero_tenant_id)
    .eq("status", "ACTIVE")
    .in("class", ["EXPENSE", "REVENUE"])
    .or(`name.ilike.%${escapeLike(query)}%,code.ilike.%${escapeLike(query)}%`)
    .order("name")
    .limit(normalizedLimit);

  if (error) throw error;

  return {
    ok: true,
    query,
    results: (data ?? []).map((row) => ({
      id: row.xero_account_id,
      code: row.code,
      name: row.name,
      class: row.class,
      status: row.status,
    })),
  };
}

export async function loadContactLookup(
  supabase: AssistantSupabaseClient,
  context: AssistantTenantContext,
  query: string,
  limit = DEFAULT_LIMIT,
): Promise<Record<string, unknown>> {
  if (!context.activeConnection) {
    return { ok: false, error: "no_active_connection", query };
  }

  const normalizedLimit = clampLimit(limit);
  const { platformTenantId, activeConnection } = context;

  const { data, error } = await supabase
    .from("xero_contacts")
    .select("xero_contact_id,name,email,is_customer,is_supplier")
    .eq("platform_tenant_id", platformTenantId)
    .eq("xero_tenant_id", activeConnection.xero_tenant_id)
    .or(`name.ilike.%${escapeLike(query)}%,email.ilike.%${escapeLike(query)}%`)
    .order("name")
    .limit(normalizedLimit);

  if (error) throw error;

  return {
    ok: true,
    query,
    results: (data ?? []).map((row) => ({
      id: row.xero_contact_id,
      name: row.name,
      email: row.email,
      is_customer: row.is_customer,
      is_supplier: row.is_supplier,
    })),
  };
}

export async function loadSyncStatus(
  context: AssistantTenantContext,
): Promise<Record<string, unknown>> {
  return {
    ok: true,
    platform_tenant_id: context.platformTenantId,
    active_connection: context.activeConnection ? connectionSummary(context.activeConnection) : null,
    connections: context.connections.map(connectionSummary),
  };
}

export async function acceptSuggestion(
  supabase: AssistantSupabaseClient,
  context: AssistantTenantContext,
  matchId: string,
  confirm: boolean,
): Promise<Record<string, unknown>> {
  if (!confirm) {
    return {
      ok: false,
      error: "confirmation_required",
      match_id: matchId,
    };
  }

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("transaction_rule_matches")
    .update({
      action_applied: true,
      accepted_at: now,
    })
    .eq("id", matchId)
    .select("id")
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    return {
      ok: false,
      error: "match_not_found",
      match_id: matchId,
      accepted_at: now,
    };
  }

  return {
    ok: true,
    match_id: matchId,
    accepted_at: now,
    platform_tenant_id: context.platformTenantId,
  };
}

export async function executeAssistantTool(
  supabase: AssistantSupabaseClient,
  context: AssistantTenantContext,
  toolCall: AssistantToolCall,
): Promise<AssistantToolExecutionResult> {
  const args = parseToolArguments(toolCall.name, toolCall.arguments);

  switch (toolCall.name) {
    case "queue_summary":
      return {
        toolCallId: toolCall.id,
        name: toolCall.name,
        output: await loadQueueSummary(supabase, context),
      };
    case "queue_detail":
      return {
        toolCallId: toolCall.id,
        name: toolCall.name,
        output: args.ok
          ? await loadQueueDetail(supabase, context, args.value.transaction_id)
          : {
              ok: false,
              error: args.error,
            },
      };
    case "account_lookup":
      return {
        toolCallId: toolCall.id,
        name: toolCall.name,
        output: args.ok
          ? await loadAccountLookup(
              supabase,
              context,
              args.value.query,
              args.value.limit ?? DEFAULT_LIMIT,
            )
          : { ok: false, error: args.error },
      };
    case "contact_lookup":
      return {
        toolCallId: toolCall.id,
        name: toolCall.name,
        output: args.ok
          ? await loadContactLookup(
              supabase,
              context,
              args.value.query,
              args.value.limit ?? DEFAULT_LIMIT,
            )
          : { ok: false, error: args.error },
      };
    case "sync_status":
      return {
        toolCallId: toolCall.id,
        name: toolCall.name,
        output: await loadSyncStatus(context),
      };
    case "accept_suggestion":
      return {
        toolCallId: toolCall.id,
        name: toolCall.name,
        output: args.ok
          ? await acceptSuggestion(supabase, context, args.value.match_id, args.value.confirm)
          : { ok: false, error: args.error },
      };
  }
}

export async function createAssistantService(deps: {
  supabase: AssistantSupabaseClient;
  userId: string;
  apiKey?: string;
  fetchImpl?: typeof fetch;
  env?: NodeJS.ProcessEnv;
}) {
  const model = resolveAssistantModel(deps.env ?? process.env);
  const fetchImpl = deps.fetchImpl ?? fetch;

  return {
    model,
    tools: buildAssistantTools(),
    async run(message: string): Promise<AssistantRunResult> {
      if (!(deps.apiKey ?? deps.env?.OPENAI_API_KEY ?? process.env.OPENAI_API_KEY)) {
        return {
          status: "fallback",
          model,
          reason: "missing_openai_api_key",
          reply: null,
          toolTrace: [],
        };
      }

      const context = await loadAssistantTenantContext(deps.supabase, deps.userId);
      const messages: Array<Record<string, unknown>> = [
        { role: "system", content: buildSystemPrompt(context) },
        { role: "user", content: message },
      ];
      const toolTrace: AssistantToolExecutionResult[] = [];

      for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
        const response = await callOpenAI({
          apiKey: deps.apiKey ?? deps.env?.OPENAI_API_KEY ?? process.env.OPENAI_API_KEY ?? "",
          fetchImpl,
          model,
          messages,
        });

        if (!response.ok) {
          return {
            status: "fallback",
            model,
            reason: response.reason,
            reply: null,
            toolTrace,
          };
        }

        const assistantMessage = response.message;
        if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
          messages.push({
            role: "assistant",
            content: assistantMessage.content ?? null,
            tool_calls: assistantMessage.tool_calls,
          });

          for (const rawCall of assistantMessage.tool_calls) {
            const toolCall: AssistantToolCall = {
              id: rawCall.id,
              name: rawCall.function.name,
              arguments: rawCall.function.arguments,
            };
            const result = await executeAssistantTool(deps.supabase, context, toolCall);
            toolTrace.push(result);
            messages.push({
              role: "tool",
              tool_call_id: toolCall.id,
              content: JSON.stringify(result.output),
            });
          }

          continue;
        }

        const reply = assistantMessage.content?.trim() ?? "";
        if (reply.length === 0) {
          return {
            status: "fallback",
            model,
            reason: "missing_assistant_content",
            reply: null,
            toolTrace,
          };
        }

        return {
          status: "ok",
          model,
          reply,
          toolTrace,
        };
      }

      return {
        status: "fallback",
        model,
        reason: "tool_round_limit_exceeded",
        reply: null,
        toolTrace,
      };
    },
  };
}

async function callOpenAI(input: {
  apiKey: string;
  fetchImpl: typeof fetch;
  model: string;
  messages: Array<Record<string, unknown>>;
}): Promise<{ ok: true; message: NonNullable<OpenAIChatResponse["choices"]>[number]["message"] } | { ok: false; reason: string }> {
  try {
    const response = await input.fetchImpl(OPENAI_CHAT_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: input.model,
        messages: input.messages,
        tools: buildAssistantTools(),
        tool_choice: "auto",
      }),
    });

    if (!response.ok) {
      return { ok: false, reason: `openai_http_${response.status}` };
    }

    const payload = (await response.json()) as OpenAIChatResponse;
    const message = payload.choices?.[0]?.message;
    if (!message) {
      return { ok: false, reason: "missing_assistant_message" };
    }

    return { ok: true, message };
  } catch {
    return { ok: false, reason: "openai_request_failed" };
  }
}

function buildSystemPrompt(context: AssistantTenantContext): string {
  const base =
    "You are a bookkeeping assistant for a reconciliation workflow. Use only the provided tools for tenant data. " +
    "You may explain unreconciled queue items, transaction details, chart of accounts, contacts, and sync status. " +
    "Do not claim to complete final Xero bank reconciliation; final reconciliation must happen in Xero. " +
    "Only call accept_suggestion when the user explicitly confirms they want to accept that exact suggestion.";

  if (!context.activeConnection) {
    return `${base} The tenant currently has no active Xero connection. Use sync_status to inspect connection state.`;
  }

  return `${base} Active Xero connection: ${context.activeConnection.xero_tenant_name ?? context.activeConnection.xero_tenant_id}. Last synced: ${
    context.activeConnection.last_synced_at ?? "unknown"
  }.`;
}

function parseToolArguments(
  name: AssistantToolName,
  rawArguments: string,
): { ok: true; value: Record<string, unknown> } | { ok: false; error: string } {
  let parsed: unknown;
  try {
    parsed = rawArguments ? JSON.parse(rawArguments) : {};
  } catch {
    return { ok: false, error: `invalid_arguments_for_${name}` };
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { ok: false, error: `invalid_arguments_for_${name}` };
  }

  const record = parsed as Record<string, unknown>;

  switch (name) {
    case "queue_summary":
    case "sync_status":
      return { ok: true, value: {} };
    case "queue_detail":
      return typeof record.transaction_id === "string" && record.transaction_id.length > 0
        ? { ok: true, value: { transaction_id: record.transaction_id } }
        : { ok: false, error: "transaction_id_required" };
    case "account_lookup":
    case "contact_lookup": {
      if (typeof record.query !== "string" || record.query.trim().length === 0) {
        return { ok: false, error: "query_required" };
      }
      const limit = record.limit === undefined ? undefined : clampLimit(record.limit);
      return {
        ok: true,
        value: {
          query: record.query.trim(),
          limit,
        },
      };
    }
    case "accept_suggestion":
      if (typeof record.match_id !== "string" || record.match_id.length === 0) {
        return { ok: false, error: "match_id_required" };
      }
      if (typeof record.confirm !== "boolean") {
        return { ok: false, error: "confirm_required" };
      }
      return {
        ok: true,
        value: {
          match_id: record.match_id,
          confirm: record.confirm,
        },
      };
  }
}

function normalizeQueueRow(row: Record<string, unknown>) {
  const matches = normalizeMatches(row.transaction_rule_matches);
  const match = matches.find((entry) => entry.suggestion_source === "rule") ?? matches.find((entry) => entry.suggestion_source === "ai") ?? null;

  return {
    id: row.id ?? null,
    description: row.description ?? null,
    date: row.date ?? null,
    total_cents: row.total_cents ?? null,
    type: row.type ?? null,
    suggestion_status: match
      ? match.override_at
        ? "overridden"
        : match.action_applied
          ? "accepted"
          : "pending"
      : "no-suggestion",
    suggestion_source: match?.suggestion_source ?? null,
    ai_confidence: match?.ai_confidence ?? null,
    suggested_category_id: match?.suggested_category_id ?? null,
    suggested_contact_id: match?.suggested_contact_id ?? null,
  };
}

function normalizeMatches(value: unknown) {
  const matches = Array.isArray(value) ? value : [];
  return matches.map((match) => {
    const record = asRecord(match);
    return {
      id: asString(record.id),
      suggestion_source: record.suggestion_source === "ai" ? "ai" : "rule",
      action_applied: Boolean(record.action_applied),
      accepted_at: asNullableString(record.accepted_at),
      override_at: asNullableString(record.override_at),
      ai_model: asNullableString(record.ai_model),
      ai_confidence: asNullableNumber(record.ai_confidence),
      rule_id: asNullableString(record.rule_id),
      rule_version_id: asNullableString(record.rule_version_id),
      matched_at: asNullableString(record.matched_at),
      suggested_category_id: asNullableString(record.suggested_category_id),
      suggested_contact_id: asNullableString(record.suggested_contact_id),
      suggested_project_id: asNullableString(record.suggested_project_id),
      suggested_tax_rate_id: asNullableString(record.suggested_tax_rate_id),
    };
  });
}

function connectionSummary(connection: AssistantConnectionSummary) {
  return {
    id: connection.id,
    xero_tenant_id: connection.xero_tenant_id,
    xero_tenant_name: connection.xero_tenant_name,
    status: connection.status,
    last_synced_at: connection.last_synced_at,
    scopes: connection.scopes,
    created_at: connection.created_at,
  };
}

function clampLimit(value: unknown): number {
  const numeric = typeof value === "number" && Number.isFinite(value) ? value : Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return DEFAULT_LIMIT;
  return Math.min(Math.max(Math.trunc(numeric), 1), MAX_LIMIT);
}

function escapeLike(value: string): string {
  return value.replace(/[%_\\]/g, "\\$&");
}

function valueOrNull<T extends Record<string, unknown>>(value: Record<string, unknown> | null, key: string): string | null {
  if (!value) return null;
  return asNullableString(value[key]);
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asNullableString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asNullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
