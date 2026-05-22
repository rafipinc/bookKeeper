import { createClient } from "@supabase/supabase-js";
import { createHash } from "crypto";

import { supabaseUrl } from "@/lib/supabase/env";
import type { Database } from "@/lib/supabase/types";

let loggedServiceRoleFingerprint = false;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing env var: ${name}`);
  }

  return stripWrappingQuotes(value.trim());
}

export function createServiceRoleClient() {
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  logServiceRoleFingerprint(serviceRoleKey);

  return createClient<Database>(stripWrappingQuotes(supabaseUrl.trim()), serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function stripWrappingQuotes(value: string) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

function logServiceRoleFingerprint(serviceRoleKey: string) {
  if (process.env.NODE_ENV === "production" && process.env.XERO_DEBUG !== "1") {
    return;
  }

  if (loggedServiceRoleFingerprint) {
    return;
  }
  loggedServiceRoleFingerprint = true;

  const payload = decodeJwtPayload(serviceRoleKey);
  console.info("[supabase.service-role] using service key", {
    supabaseHost: new URL(stripWrappingQuotes(supabaseUrl.trim())).host,
    keyLength: serviceRoleKey.length,
    keyHash: createHash("sha256").update(serviceRoleKey).digest("hex").slice(0, 12),
    role: payload?.role,
    ref: payload?.ref,
    exp: payload?.exp,
  });
}

function decodeJwtPayload(key: string): { role?: string; ref?: string; exp?: number } | null {
  const [, payload] = key.split(".");
  if (!payload) {
    return null;
  }

  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      role?: string;
      ref?: string;
      exp?: number;
    };
  } catch {
    return null;
  }
}
