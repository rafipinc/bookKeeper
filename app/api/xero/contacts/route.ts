import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { ensureUserPlatformTenant } from "@/lib/supabase/tenant-scoped";
import { XeroClient } from "@/lib/xero/client";

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

  const xeroConnectionId = asString(body.xeroConnectionId);
  const name = asString(body.name);
  const email = asNullableString(body.email);
  const isCustomer = asBoolean(body.is_customer);

  if (!xeroConnectionId || !name) {
    return NextResponse.json({ error: "xeroConnectionId and name are required." }, { status: 400 });
  }

  const { data: connection, error: connectionError } = await supabase
    .from("xero_connections")
    .select("id,xero_tenant_id")
    .eq("platform_tenant_id", platformTenantId)
    .eq("id", xeroConnectionId)
    .eq("status", "active")
    .single();

  if (connectionError || !connection) {
    return NextResponse.json({ error: "Active Xero connection not found." }, { status: 404 });
  }

  const xeroClient = new XeroClient(connection.id);
  const xeroContact = await xeroClient.createContactRecord({
    Name: name,
    EmailAddress: email,
    IsCustomer: isCustomer ?? true,
  });

  const { data: contact, error: upsertError } = await supabase
    .from("xero_contacts")
    .upsert(
      {
        platform_tenant_id: platformTenantId,
        xero_tenant_id: connection.xero_tenant_id,
        xero_contact_id: xeroContact.ContactID,
        name: xeroContact.Name ?? name,
        email: xeroContact.EmailAddress ?? email,
        is_customer: xeroContact.IsCustomer ?? isCustomer ?? true,
        is_supplier: xeroContact.IsSupplier ?? false,
        raw_json: xeroContact,
      },
      { onConflict: "platform_tenant_id,xero_tenant_id,xero_contact_id" },
    )
    .select("*")
    .single();

  if (upsertError || !contact) {
    return NextResponse.json({ error: "Could not mirror Xero contact locally." }, { status: 500 });
  }

  return NextResponse.json({ contact });
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

function asBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") {
    return value;
  }
  return null;
}
