import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { ensureUserPlatformTenant } from "@/lib/supabase/tenant-scoped";

export const dynamic = "force-dynamic";

const BILL_ATTACHMENTS_BUCKET = process.env.BILL_ATTACHMENTS_BUCKET ?? "xero-bill-documents";

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

  const billId = asString(body.billId);
  const filename = sanitizeFilename(asString(body.filename));
  if (!billId || !filename) {
    return NextResponse.json({ error: "billId and filename are required." }, { status: 400 });
  }

  const { data: bill, error: billError } = await supabase
    .from("xero_invoices")
    .select("id")
    .eq("id", billId)
    .eq("platform_tenant_id", platformTenantId)
    .eq("type", "ACCPAY")
    .maybeSingle();

  if (billError || !bill) {
    return NextResponse.json({ error: "Bill not found." }, { status: 404 });
  }

  const attachmentPath = `tenant/${platformTenantId}/bills/${billId}/${filename}`;
  const { data, error } = await supabase.storage
    .from(BILL_ATTACHMENTS_BUCKET)
    .createSignedUploadUrl(attachmentPath, { upsert: true });

  if (error || !data) {
    return NextResponse.json({ error: "Could not create upload URL." }, { status: 500 });
  }

  return NextResponse.json({
    bucket: BILL_ATTACHMENTS_BUCKET,
    attachmentPath,
    token: data.token,
    signedUrl: data.signedUrl,
  });
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function sanitizeFilename(value: string | null): string | null {
  if (!value) {
    return null;
  }
  const normalized = value.replace(/[^\w.\-]/g, "_");
  return normalized.length > 0 ? normalized : null;
}
