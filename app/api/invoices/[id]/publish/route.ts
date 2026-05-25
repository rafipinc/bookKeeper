import { NextResponse } from "next/server";

import { inngest } from "@/lib/inngest/client";
import { createClient } from "@/lib/supabase/server";
import { ensureUserPlatformTenant } from "@/lib/supabase/tenant-scoped";

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: "Missing invoice id." }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const platformTenantId = await ensureUserPlatformTenant(supabase, user.id);

  const { data: invoice, error: loadError } = await supabase
    .from("xero_invoices")
    .select("id,status,type")
    .eq("id", id)
    .eq("platform_tenant_id", platformTenantId)
    .eq("type", "ACCREC")
    .single();

  if (loadError || !invoice) {
    return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
  }

  if (invoice.status === "publishing") {
    return NextResponse.json({ invoiceId: invoice.id });
  }

  const { error: updateError } = await supabase
    .from("xero_invoices")
    .update({ status: "publishing", publish_error: null })
    .eq("id", invoice.id)
    .eq("platform_tenant_id", platformTenantId);

  if (updateError) {
    return NextResponse.json({ error: "Could not queue invoice publish." }, { status: 500 });
  }

  await inngest.send({
    name: "xero/invoice.publish",
    data: {
      invoiceId: invoice.id,
    },
  });

  return NextResponse.json({ invoiceId: invoice.id });
}
