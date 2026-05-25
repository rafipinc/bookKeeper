import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { ensureUserPlatformTenant } from "@/lib/supabase/tenant-scoped";
import type { Database } from "@/lib/supabase/types";
import { computeDraftTotals, normalizeLineItems, toJsonLineItems } from "@/lib/xero/invoice-payload";

type XeroInvoiceInsert = Database["public"]["Tables"]["xero_invoices"]["Insert"];
type XeroInvoiceUpdate = Database["public"]["Tables"]["xero_invoices"]["Update"];

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const platformTenantId = await ensureUserPlatformTenant(supabase, user.id);
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const id = asString(body.id);
  const xeroConnectionId = asString(body.xeroConnectionId);
  const contactId = asString(body.contactId);
  const date = asDateString(body.date);
  const dueDate = asDateString(body.dueDate);
  const reference = asNullableString(body.reference);
  const invoiceNumber = asNullableString(body.invoiceNumber);
  const attachmentPath = asNullableString(body.attachmentPath);
  const attachmentStatus = asNullableString(body.attachmentStatus);

  if (!xeroConnectionId) {
    return NextResponse.json({ error: "xeroConnectionId is required." }, { status: 400 });
  }

  if (attachmentPath && !isAllowedAttachmentPath(attachmentPath, platformTenantId, id)) {
    return NextResponse.json({ error: "Invalid attachment path for this bill." }, { status: 400 });
  }

  const lineItemsInput = body.lineItems;
  let normalizedLineItems;
  try {
    normalizedLineItems = normalizeLineItems(lineItemsInput);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid line items." },
      { status: 400 },
    );
  }

  const { subtotalCents, taxCents, totalCents } = computeDraftTotals(normalizedLineItems);

  const { data: connection, error: connectionError } = await supabase
    .from("xero_connections")
    .select("xero_tenant_id")
    .eq("platform_tenant_id", platformTenantId)
    .eq("id", xeroConnectionId)
    .eq("status", "active")
    .single();

  if (connectionError || !connection) {
    return NextResponse.json({ error: "Active Xero connection not found." }, { status: 404 });
  }

  if (contactId) {
    const { data: existingContact, error: contactError } = await supabase
      .from("xero_contacts")
      .select("id")
      .eq("platform_tenant_id", platformTenantId)
      .eq("xero_tenant_id", connection.xero_tenant_id)
      .eq("id", contactId)
      .maybeSingle();

    if (contactError || !existingContact) {
      return NextResponse.json({ error: "Contact not found for this tenant." }, { status: 404 });
    }
  }

  const payloadBase: XeroInvoiceInsert = {
    platform_tenant_id: platformTenantId,
    xero_tenant_id: connection.xero_tenant_id,
    type: "ACCPAY",
    status: "draft_local",
    contact_id: contactId,
    date,
    due_date: dueDate,
    reference,
    xero_invoice_number: invoiceNumber,
    line_items_json: toJsonLineItems(normalizedLineItems),
    subtotal_cents: subtotalCents,
    tax_cents: taxCents,
    total_cents: totalCents,
    attachment_path: attachmentPath,
    attachment_status: attachmentStatus,
    publish_error: null,
    published_to_xero_at: null,
    created_by: user.id,
  };

  const invoiceResult = id
    ? await updateDraftBill(supabase, id, platformTenantId, payloadBase)
    : await createDraftBill(supabase, payloadBase);

  if (invoiceResult.error || !invoiceResult.data) {
    console.error("[bills.save-draft] failed to persist draft", invoiceResult.error);
    return NextResponse.json({ error: "Could not save bill draft." }, { status: 500 });
  }

  return NextResponse.json({ bill: invoiceResult.data });
}

async function createDraftBill(
  supabase: Awaited<ReturnType<typeof createClient>>,
  payload: XeroInvoiceInsert,
) {
  return supabase.from("xero_invoices").insert(payload).select("*").single();
}

async function updateDraftBill(
  supabase: Awaited<ReturnType<typeof createClient>>,
  invoiceId: string,
  platformTenantId: string,
  payload: XeroInvoiceInsert,
) {
  const updatePayload: XeroInvoiceUpdate = {
    xero_tenant_id: payload.xero_tenant_id,
    type: payload.type,
    status: payload.status,
    contact_id: payload.contact_id,
    date: payload.date,
    due_date: payload.due_date,
    reference: payload.reference,
    xero_invoice_number: payload.xero_invoice_number,
    line_items_json: payload.line_items_json,
    subtotal_cents: payload.subtotal_cents,
    tax_cents: payload.tax_cents,
    total_cents: payload.total_cents,
    attachment_path: payload.attachment_path,
    attachment_status: payload.attachment_status,
    publish_error: null,
    published_to_xero_at: null,
  };

  return supabase
    .from("xero_invoices")
    .update(updatePayload)
    .eq("id", invoiceId)
    .eq("platform_tenant_id", platformTenantId)
    .eq("type", "ACCPAY")
    .select("*")
    .single();
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function asNullableString(value: unknown): string | null {
  return asString(value);
}

function asDateString(value: unknown): string | null {
  const dateValue = asString(value);
  if (!dateValue) {
    return null;
  }
  return /^\d{4}-\d{2}-\d{2}$/.test(dateValue) ? dateValue : null;
}

function isAllowedAttachmentPath(
  attachmentPath: string,
  platformTenantId: string,
  billId: string | null,
): boolean {
  if (!billId) {
    return false;
  }
  return attachmentPath.startsWith(`tenant/${platformTenantId}/bills/${billId}/`);
}
