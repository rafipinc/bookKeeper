import { NextResponse } from "next/server";

import { appUrl, isLocalhostUrl, isVercelDeployment } from "@/lib/app-url";

export const dynamic = "force-dynamic";

type CheckStatus = "ok" | "dev" | "missing_config" | "unreachable";

/**
 * Deployment health check: GET /api/health.
 *
 * Reports whether each connector is configured (and whether Supabase is
 * reachable) so a deploy can be verified with one request. It reports status
 * words only, never values or env var contents.
 *
 * Returns 503 when a required check fails. OpenAI is reported but optional:
 * the app works without it, minus AI suggestions and bill extraction.
 */
export async function GET(): Promise<Response> {
  const required = {
    supabase: await checkSupabase(),
    appUrl: checkAppUrl(),
    xero: hasEnv("XERO_CLIENT_ID", "XERO_CLIENT_SECRET") ? "ok" : "missing_config",
    inngest: checkInngest(),
  } satisfies Record<string, CheckStatus>;

  const optional = {
    openai: hasEnv("OPENAI_API_KEY") ? "ok" : "missing_config",
  } satisfies Record<string, CheckStatus>;

  const ok = Object.values(required).every((status) => status === "ok" || status === "dev");

  return NextResponse.json(
    {
      ok,
      environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
      commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
      checks: { ...required, ...optional },
    },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}

function hasEnv(...names: string[]): boolean {
  return names.every((name) => Boolean(process.env[name]?.trim()));
}

function checkAppUrl(): CheckStatus {
  // On a deployment, localhost means neither a public app URL nor a Vercel URL was found.
  return isVercelDeployment() && isLocalhostUrl(appUrl()) ? "missing_config" : "ok";
}

function checkInngest(): CheckStatus {
  if (process.env.NODE_ENV !== "production") return "dev";
  return hasEnv("INNGEST_SIGNING_KEY", "INNGEST_EVENT_KEY") ? "ok" : "missing_config";
}

async function checkSupabase(): Promise<CheckStatus> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey || !hasEnv("SUPABASE_SERVICE_ROLE_KEY")) return "missing_config";

  try {
    const response = await fetch(`${url.replace(/\/+$/, "")}/auth/v1/health`, {
      headers: { apikey: anonKey },
      cache: "no-store",
      signal: AbortSignal.timeout(3000),
    });
    return response.ok ? "ok" : "unreachable";
  } catch {
    return "unreachable";
  }
}
