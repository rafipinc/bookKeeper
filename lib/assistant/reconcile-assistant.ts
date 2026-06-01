import type { TypedSupabaseClient } from "@/lib/supabase/tenant-scoped";

const DEFAULT_MODEL = process.env.OPENAI_ASSISTANT_MODEL ?? "gpt-5.4-nano";
const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const MAX_TOOL_ROUNDS = 2;

export type AssistantMessage = {
  role: "user" | "assistant";
  content: string;
};

export type PendingAssistantConfirmation = {
  type: "accept_reconciliation_suggestion";
  matchId: string;
  summary: string;
};

export type ConfirmedAssistantAction = {
  type: "accept_reconciliation_suggestion";
  matchId: string;
};

export type AssistantRunInput = {
  supabase: TypedSupabaseClient;
  platformTenantId: string;
  xeroTenantId: string;
  messages: AssistantMessage[];
  confirmedAction?: ConfirmedAssistantAction | null;
};

export type AssistantRunResult = {
  message: string;
  model: string;
  pendingConfirmation: PendingAssistantConfirmation | null;
};

type ToolContext = Pick<
  AssistantRunInput,
  "supabase" | "platformTenantId" | "xeroTenantId"
>;

type ToolCall = {
  callId: string;
  name: string;
  argumentsJson: string;
};

type ToolResult = {
  output: unknown;
  pendingConfirmation?: PendingAssistantConfirmation;
};

export async function runReconcileAssistant(
  input: AssistantRunInput,
): Promise<AssistantRunResult> {
  if (input.confirmedAction) {
    const result = await acceptReconciliationSuggestion(input, {
      match_id: input.confirmedAction.matchId,
      confirmed: true,
    });

    if (isRecord(result.output) && result.output.status === "accepted") {
      return {
        message: "Accepted the suggestion. It is ready for the final reconciliation step in Xero.",
        model: "local-action",
        pendingConfirmation: null,
      };
    }

    return {
      message: "I could not accept that suggestion. It may already be accepted or no longer be available.",
      model: "local-action",
      pendingConfirmation: null,
    };
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      message:
        "AI assistant is not configured yet. Add OPENAI_API_KEY and set OPENAI_ASSISTANT_MODEL to a low-cost model to enable it.",
      model: DEFAULT_MODEL,
      pendingConfirmation: null,
    };
  }

  const model = DEFAULT_MODEL;
  let pendingConfirmation: PendingAssistantConfirmation | null = null;
  let response = await createResponse({
    apiKey,
    body: {
      model,
      instructions: assistantInstructions,
      input: buildInputMessages(input.messages),
      tools,
      tool_choice: "auto",
    },
  });

  for (let i = 0; i < MAX_TOOL_ROUNDS; i += 1) {
    const calls = extractToolCalls(response);
    if (calls.length === 0) break;

    const toolOutputs = [];
    for (const call of calls) {
      const result = await executeTool(call, input);
      if (result.pendingConfirmation) {
        pendingConfirmation = result.pendingConfirmation;
      }
      toolOutputs.push({
        type: "function_call_output",
        call_id: call.callId,
        output: JSON.stringify(result.output),
      });
    }

    response = await createResponse({
      apiKey,
      body: {
        model,
        instructions: assistantInstructions,
        input: [...extractOutputItems(response), ...toolOutputs],
        tools,
        tool_choice: "auto",
      },
    });
  }

  return {
    message: extractOutputText(response) ?? "I could not produce an answer. Try asking again with a narrower question.",
    model: extractModel(response) ?? model,
    pendingConfirmation,
  };
}

async function createResponse({
  apiKey,
  body,
}: {
  apiKey: string;
  body: Record<string, unknown>;
}): Promise<Record<string, unknown>> {
  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    return {
      output_text: "The AI assistant is temporarily unavailable. Try again shortly.",
      model: DEFAULT_MODEL,
    };
  }

  return (await response.json()) as Record<string, unknown>;
}

function buildInputMessages(messages: AssistantMessage[]) {
  return messages.slice(-8).map((message) => ({
    role: message.role,
    content: [{ type: "input_text", text: message.content }],
  }));
}

async function executeTool(call: ToolCall, context: ToolContext): Promise<ToolResult> {
  let args: Record<string, unknown> = {};
  try {
    args = JSON.parse(call.argumentsJson) as Record<string, unknown>;
  } catch {
    return { output: { error: "invalid_tool_arguments" } };
  }

  switch (call.name) {
    case "get_reconciliation_queue":
      return getReconciliationQueue(context, args);
    case "get_transaction_detail":
      return getTransactionDetail(context, args);
    case "search_xero_accounts":
      return searchXeroAccounts(context, args);
    case "search_xero_contacts":
      return searchXeroContacts(context, args);
    case "get_xero_sync_status":
      return getXeroSyncStatus(context);
    case "accept_reconciliation_suggestion":
      return acceptReconciliationSuggestion(context, args);
    default:
      return { output: { error: "unknown_tool" } };
  }
}

async function getReconciliationQueue(
  context: ToolContext,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const limit = clampLimit(args.limit, 25);
  const { data, error } = await context.supabase
    .from("xero_bank_transactions")
    .select(
      `id, description, date, total_cents, type,
       transaction_rule_matches (
         id, suggestion_source, suggested_category_id, action_applied, accepted_at,
         override_at, ai_confidence
       )`,
    )
    .eq("platform_tenant_id", context.platformTenantId)
    .eq("xero_tenant_id", context.xeroTenantId)
    .eq("is_reconciled", false)
    .order("date", { ascending: false })
    .limit(limit);

  if (error) return { output: { error: "queue_lookup_failed" } };

  const items = (data ?? []).map((row) => {
    const matches = Array.isArray(row.transaction_rule_matches)
      ? row.transaction_rule_matches
      : [];
    const match = matches.find((m) => m.suggestion_source === "rule") ?? matches[0] ?? null;

    return {
      id: row.id,
      description: row.description,
      date: row.date,
      amount_cents: row.total_cents,
      type: row.type,
      suggestion: match
        ? {
            match_id: match.id,
            source: match.suggestion_source,
            category_id: match.suggested_category_id,
            confidence: match.ai_confidence,
            status: match.override_at
              ? "overridden"
              : match.action_applied
                ? "accepted"
                : "pending",
          }
        : null,
    };
  });

  return {
    output: {
      count: items.length,
      items,
      limitation: "Final bank reconciliation must still be completed in Xero.",
    },
  };
}

async function getTransactionDetail(
  context: ToolContext,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const transactionId = readString(args.transaction_id);
  if (!transactionId) return { output: { error: "transaction_id_required" } };

  const { data, error } = await context.supabase
    .from("xero_bank_transactions")
    .select(
      `id, description, date, reference, total_cents, type, status, is_reconciled,
       bank_account_id, contact_id,
       transaction_rule_matches (
         id, suggestion_source, suggested_category_id, suggested_contact_id,
         action_applied, accepted_at, override_at, ai_model, ai_confidence
       )`,
    )
    .eq("platform_tenant_id", context.platformTenantId)
    .eq("xero_tenant_id", context.xeroTenantId)
    .eq("id", transactionId)
    .maybeSingle();

  if (error) return { output: { error: "transaction_lookup_failed" } };
  if (!data) return { output: { error: "transaction_not_found" } };

  return { output: data };
}

async function searchXeroAccounts(
  context: ToolContext,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const query = readString(args.query)?.toLowerCase() ?? "";
  const limit = clampLimit(args.limit, 20);
  let request = context.supabase
    .from("xero_accounts")
    .select("xero_account_id, code, name, type, class, status")
    .eq("platform_tenant_id", context.platformTenantId)
    .eq("xero_tenant_id", context.xeroTenantId)
    .eq("status", "ACTIVE")
    .order("code", { ascending: true })
    .limit(limit);

  if (query) {
    request = request.or(`name.ilike.%${escapeIlike(query)}%,code.ilike.%${escapeIlike(query)}%`);
  }

  const { data, error } = await request;
  return { output: error ? { error: "accounts_lookup_failed" } : { accounts: data ?? [] } };
}

async function searchXeroContacts(
  context: ToolContext,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const query = readString(args.query)?.toLowerCase() ?? "";
  const limit = clampLimit(args.limit, 20);
  let request = context.supabase
    .from("xero_contacts")
    .select("xero_contact_id, name, email, is_customer, is_supplier")
    .eq("platform_tenant_id", context.platformTenantId)
    .eq("xero_tenant_id", context.xeroTenantId)
    .order("name", { ascending: true })
    .limit(limit);

  if (query) {
    request = request.ilike("name", `%${escapeIlike(query)}%`);
  }

  const { data, error } = await request;
  return { output: error ? { error: "contacts_lookup_failed" } : { contacts: data ?? [] } };
}

async function getXeroSyncStatus(context: ToolContext): Promise<ToolResult> {
  const { data, error } = await context.supabase
    .from("xero_connections")
    .select("xero_tenant_name, status, last_synced_at")
    .eq("platform_tenant_id", context.platformTenantId)
    .eq("xero_tenant_id", context.xeroTenantId)
    .maybeSingle();

  return { output: error ? { error: "sync_status_lookup_failed" } : { connection: data } };
}

async function acceptReconciliationSuggestion(
  context: ToolContext,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const matchId = readString(args.match_id);
  const confirmed = args.confirmed === true;
  if (!matchId) return { output: { error: "match_id_required" } };

  if (!confirmed) {
    const pendingConfirmation = {
      type: "accept_reconciliation_suggestion" as const,
      matchId,
      summary: "Accept this suggestion and mark it ready for the final reconciliation step in Xero.",
    };

    return {
      pendingConfirmation,
      output: {
        status: "confirmation_required",
        confirmation: pendingConfirmation,
      },
    };
  }

  const now = new Date().toISOString();
  const { error } = await context.supabase
    .from("transaction_rule_matches")
    .update({ action_applied: true, accepted_at: now })
    .eq("id", matchId);

  return { output: error ? { error: "accept_failed" } : { status: "accepted", match_id: matchId } };
}

function extractToolCalls(payload: Record<string, unknown>): ToolCall[] {
  const output = extractOutputItems(payload);
  return output
    .filter((item) => item.type === "function_call")
    .map((item) => ({
      callId: typeof item.call_id === "string" ? item.call_id : "",
      name: typeof item.name === "string" ? item.name : "",
      argumentsJson: typeof item.arguments === "string" ? item.arguments : "{}",
    }))
    .filter((call) => call.callId && call.name);
}

function extractOutputItems(payload: Record<string, unknown>): Record<string, unknown>[] {
  return Array.isArray(payload.output)
    ? payload.output.filter((item): item is Record<string, unknown> => isRecord(item))
    : [];
}

function extractOutputText(payload: Record<string, unknown>): string | null {
  if (typeof payload.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text;
  }

  for (const item of extractOutputItems(payload)) {
    const content = Array.isArray(item.content) ? item.content : [];
    for (const part of content) {
      if (isRecord(part) && part.type === "output_text" && typeof part.text === "string") {
        return part.text;
      }
    }
  }

  return null;
}

function extractModel(payload: Record<string, unknown>): string | null {
  return typeof payload.model === "string" ? payload.model : null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function clampLimit(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(1, Math.min(50, Math.floor(value)));
}

function escapeIlike(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const assistantInstructions = [
  "You are the bookkeeping assistant inside a cash-basis Xero bookkeeping app.",
  "Use the provided tools for tenant-scoped Xero data. Do not invent accounts, contacts, transactions, or balances.",
  "Money values are provided in integer cents; when speaking to the user, format them as currency.",
  "You can help inspect unreconciled transactions and explain suggestions.",
  "You must not say that you completed final Xero bank reconciliation. The final step remains in Xero.",
  "Before accepting a suggestion, call accept_reconciliation_suggestion with confirmed=false and ask the user to confirm.",
].join("\n");

const nullableString = { type: ["string", "null"] };
const nullableNumber = { type: ["number", "null"] };

export const tools = [
  {
    type: "function",
    name: "get_reconciliation_queue",
    description: "List unreconciled Xero bank transactions and their current app-side suggestions.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["limit"],
      properties: {
        limit: nullableNumber,
      },
    },
  },
  {
    type: "function",
    name: "get_transaction_detail",
    description: "Fetch one synced Xero bank transaction with suggestion details.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["transaction_id"],
      properties: {
        transaction_id: { type: "string" },
      },
    },
  },
  {
    type: "function",
    name: "search_xero_accounts",
    description: "Search the active Xero chart of accounts by account name or code.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["query", "limit"],
      properties: {
        query: nullableString,
        limit: nullableNumber,
      },
    },
  },
  {
    type: "function",
    name: "search_xero_contacts",
    description: "Search synced Xero contacts by name.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["query", "limit"],
      properties: {
        query: nullableString,
        limit: nullableNumber,
      },
    },
  },
  {
    type: "function",
    name: "get_xero_sync_status",
    description: "Return the active Xero connection status and last sync timestamp.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      required: [],
      properties: {},
    },
  },
  {
    type: "function",
    name: "accept_reconciliation_suggestion",
    description:
      "Accept an existing app-side reconciliation suggestion only after explicit user confirmation. This does not complete final reconciliation in Xero.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["match_id", "confirmed"],
      properties: {
        match_id: { type: "string" },
        confirmed: { type: "boolean" },
      },
    },
  },
] as const;

export const reconcileAssistantInternals = {
  acceptReconciliationSuggestion,
  executeTool,
  extractOutputText,
  extractToolCalls,
};
