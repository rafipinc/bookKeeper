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
    return NextResponse.json({ error: "Missing bill id." }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const platformTenantId = await ensureUserPlatformTenant(supabase, user.id);

  const { data: bill, error: loadError } = await supabase
    .from("xero_invoices")
    .select("id,status,type")
    .eq("id", id)
    .eq("platform_tenant_id", platformTenantId)
    .eq("type", "ACCPAY")
    .single();

  if (loadError || !bill) {
    return NextResponse.json({ error: "Bill not found." }, { status: 404 });
  }

  if (bill.status === "publishing") {
    return NextResponse.json({ billId: bill.id });
  }

  const { error: updateError } = await supabase
    .from("xero_invoices")
    .update({ status: "publishing", publish_error: null })
    .eq("id", bill.id)
    .eq("platform_tenant_id", platformTenantId);

  if (updateError) {
    return NextResponse.json({ error: "Could not queue bill publish." }, { status: 500 });
  }

  await inngest.send({
    name: "xero/bill.publish",
    data: {
      billId: bill.id,
    },
  });

  return NextResponse.json({ billId: bill.id });
}

