import { NextResponse } from "next/server";

import { extractBillFromDocument } from "@/lib/bills/extraction";
import { createClient } from "@/lib/supabase/server";
import { ensureUserPlatformTenant } from "@/lib/supabase/tenant-scoped";

export const dynamic = "force-dynamic";

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_CONTENT_TYPES = new Set(["application/pdf", "image/png", "image/jpeg"]);

export async function POST(request: Request): Promise<Response> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  await ensureUserPlatformTenant(supabase, user.id);

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required." }, { status: 400 });
  }

  if (!ALLOWED_CONTENT_TYPES.has(file.type)) {
    return NextResponse.json({ error: "Unsupported file type." }, { status: 400 });
  }

  if (file.size <= 0 || file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File size must be between 1 byte and 10MB." }, { status: 400 });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const extraction = await extractBillFromDocument({
    fileName: file.name || "bill-document",
    contentType: file.type,
    bytes,
  });

  return NextResponse.json({ extraction });
}

