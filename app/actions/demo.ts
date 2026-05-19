"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { ensureUserPlatformTenant } from "@/lib/supabase/tenant-scoped";

export type SeedDemoState = {
  error: string | null;
  message: string | null;
};

function isoDaysAgo(daysAgo: number) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().split("T")[0];
}

export async function seedDemoData(
  // `useActionState` passes previous state + form data; not needed by this action.
  _state: SeedDemoState,
  _data: FormData,
): Promise<SeedDemoState> {
  void _state;
  void _data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be signed in.", message: null };
  }

  const platformTenantId = await ensureUserPlatformTenant(supabase, user.id);

  const { data: business } = await supabase
    .from("businesses")
    .select("id,platform_tenant_id")
    .eq("owner_id", user.id)
    .eq("platform_tenant_id", platformTenantId)
    .limit(1)
    .single();

  if (!business) {
    return { error: "Create your business profile first.", message: null };
  }

  const { data: existingDemoRows } = await supabase
    .from("transactions")
    .select("id")
    .eq("platform_tenant_id", business.platform_tenant_id)
    .eq("business_id", business.id)
    .ilike("note", "[demo]%")
    .limit(1);

  if (existingDemoRows && existingDemoRows.length > 0) {
    return { error: null, message: "Demo data already exists for this account." };
  }

  const { data: categories } = await supabase
    .from("categories")
    .select("id,name,kind")
    .eq("platform_tenant_id", business.platform_tenant_id)
    .eq("business_id", business.id);

  if (!categories || categories.length === 0) {
    return { error: "No categories found. Try creating your business again.", message: null };
  }

  const pickCategory = (kind: "income" | "expense", preferredNames: string[]) => {
    const kindRows = categories.filter((c) => c.kind === kind);
    for (const name of preferredNames) {
      const found = kindRows.find((c) => c.name === name);
      if (found) {
        return found.id;
      }
    }
    return kindRows[0]?.id ?? null;
  };

  const salesId = pickCategory("income", ["Sales", "Other Income"]);
  const softwareId = pickCategory("expense", ["Software"]);
  const mealsId = pickCategory("expense", ["Meals"]);
  const marketingId = pickCategory("expense", ["Marketing"]);
  const contractorsId = pickCategory("expense", ["Contractors"]);

  if (!salesId || !softwareId || !mealsId || !marketingId || !contractorsId) {
    return { error: "Could not map required categories for demo data.", message: null };
  }

  const rows = [
    {
      business_id: business.id,
      platform_tenant_id: business.platform_tenant_id,
      category_id: salesId,
      type: "income" as const,
      amount_cents: 420000,
      currency: "USD",
      date: isoDaysAgo(1),
      note: "[demo] Client retainer",
    },
    {
      business_id: business.id,
      platform_tenant_id: business.platform_tenant_id,
      category_id: salesId,
      type: "income" as const,
      amount_cents: 185000,
      currency: "USD",
      date: isoDaysAgo(8),
      note: "[demo] Website project milestone",
    },
    {
      business_id: business.id,
      platform_tenant_id: business.platform_tenant_id,
      category_id: softwareId,
      type: "expense" as const,
      amount_cents: 4900,
      currency: "USD",
      date: isoDaysAgo(3),
      note: "[demo] SaaS subscriptions",
    },
    {
      business_id: business.id,
      platform_tenant_id: business.platform_tenant_id,
      category_id: mealsId,
      type: "expense" as const,
      amount_cents: 3600,
      currency: "USD",
      date: isoDaysAgo(5),
      note: "[demo] Client lunch",
    },
    {
      business_id: business.id,
      platform_tenant_id: business.platform_tenant_id,
      category_id: marketingId,
      type: "expense" as const,
      amount_cents: 12500,
      currency: "USD",
      date: isoDaysAgo(6),
      note: "[demo] Ad spend",
    },
    {
      business_id: business.id,
      platform_tenant_id: business.platform_tenant_id,
      category_id: contractorsId,
      type: "expense" as const,
      amount_cents: 65000,
      currency: "USD",
      date: isoDaysAgo(10),
      note: "[demo] Design contractor",
    },
  ];

  const { error } = await supabase.from("transactions").insert(rows);
  if (error) {
    return { error: "Failed to seed demo data.", message: null };
  }

  revalidatePath("/dashboard");
  revalidatePath("/ledger");

  return { error: null, message: "Demo data added." };
}
