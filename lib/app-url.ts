const LOCAL_APP_URL = "http://localhost:3000";

/**
 * Public base URL of the app, used for absolute redirects (Xero OAuth and the
 * redirects back into the app).
 *
 * Order: NEXT_PUBLIC_APP_URL, then NEXT_PUBLIC_SITE_URL, then the URL Vercel
 * assigns to the deployment, then localhost.
 *
 * On a Vercel preview or production deployment a localhost value is skipped:
 * it can never be reached there, and copying `.env.local` into Vercel is the
 * most common way it ends up set.
 */
export function appUrl(): string {
  const deployed = isVercelDeployment();

  for (const candidate of [process.env.NEXT_PUBLIC_APP_URL, process.env.NEXT_PUBLIC_SITE_URL]) {
    const value = candidate?.trim();
    if (!value) continue;
    if (deployed && isLocalhostUrl(value)) continue;
    return value.replace(/\/+$/, "");
  }

  const vercelHost =
    process.env.VERCEL_ENV === "production"
      ? process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL
      : process.env.VERCEL_URL;
  if (deployed && vercelHost) {
    return `https://${vercelHost}`;
  }

  return LOCAL_APP_URL;
}

/** True on a Vercel preview or production deployment (not `vercel dev`). */
export function isVercelDeployment(): boolean {
  return process.env.VERCEL_ENV === "production" || process.env.VERCEL_ENV === "preview";
}

export function isLocalhostUrl(value: string): boolean {
  try {
    const { hostname } = new URL(value);
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
  } catch {
    return false;
  }
}
