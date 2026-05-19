"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { ensureUserPlatformTenant } from "@/lib/supabase/tenant-scoped";

export type CreateBusinessState = {
  error: string | null;
};

export async function createBusiness(
  _previousState: CreateBusinessState,
  formData: FormData,
): Promise<CreateBusinessState> {
  const name = String(formData.get("name") ?? "").trim();
  const businessTypeRaw = String(formData.get("businessType") ?? "").trim();

  if (!name) {
    return { error: "Business name is required." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Couldn't save your business. Try again." };
  }

  try {
    const platformTenantId = await ensureUserPlatformTenant(supabase, user.id);

    const { error } = await supabase.from("businesses").insert({
      platform_tenant_id: platformTenantId,
      owner_id: user.id,
      name,
      business_type: businessTypeRaw || null,
    });

    if (error) {
      if (error.code === "23505") {
        return { error: null };
      }

      return { error: "Couldn't save your business. Try again." };
    }
  } catch {
    return { error: "Couldn't save your business. Try again." };
  }

  revalidatePath("/dashboard");
  revalidatePath("/ledger");

  return { error: null };
}
