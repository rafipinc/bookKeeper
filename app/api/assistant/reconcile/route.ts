import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import {
  runReconcileAssistant,
  type AssistantMessage,
  type ConfirmedAssistantAction,
} from "@/lib/assistant/reconcile-assistant";
import { createClient } from "@/lib/supabase/server";
import { ensureUserPlatformTenant } from "@/lib/supabase/tenant-scoped";

type RequestBody = {
  messages?: AssistantMessage[];
  confirmedAction?: ConfirmedAssistantAction | null;
};

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const messages = normalizeMessages(body.messages);
  if (messages.length === 0 && !body.confirmedAction) {
    return NextResponse.json({ error: "Message is required." }, { status: 400 });
  }

  const platformTenantId = await ensureUserPlatformTenant(supabase, user.id);
  const { data: connection, error: connectionError } = await supabase
    .from("xero_connections")
    .select("xero_tenant_id")
    .eq("platform_tenant_id", platformTenantId)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  if (connectionError) {
    return NextResponse.json({ error: "Could not load Xero connection." }, { status: 500 });
  }

  if (!connection) {
    return NextResponse.json({
      message: "Connect Xero before using the reconciliation assistant.",
      model: "local",
      pendingConfirmation: null,
    });
  }

  const result = await runReconcileAssistant({
    supabase,
    platformTenantId,
    xeroTenantId: connection.xero_tenant_id,
    messages,
    confirmedAction: normalizeConfirmedAction(body.confirmedAction),
  });

  if (body.confirmedAction) {
    revalidatePath("/reconcile", "layout");
  }

  return NextResponse.json(result);
}

function normalizeMessages(messages: unknown): AssistantMessage[] {
  if (!Array.isArray(messages)) return [];

  return messages
    .filter((message): message is AssistantMessage => {
      if (!message || typeof message !== "object") return false;
      const record = message as Record<string, unknown>;
      return (
        (record.role === "user" || record.role === "assistant") &&
        typeof record.content === "string" &&
        record.content.trim().length > 0
      );
    })
    .slice(-8)
    .map((message) => ({
      role: message.role,
      content: message.content.slice(0, 2_000),
    }));
}

function normalizeConfirmedAction(action: unknown): ConfirmedAssistantAction | null {
  if (!action || typeof action !== "object") return null;
  const record = action as Record<string, unknown>;
  if (
    record.type === "accept_reconciliation_suggestion" &&
    typeof record.matchId === "string" &&
    record.matchId.trim()
  ) {
    return {
      type: "accept_reconciliation_suggestion",
      matchId: record.matchId.trim(),
    };
  }
  return null;
}
