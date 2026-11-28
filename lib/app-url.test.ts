import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { appUrl } from "@/lib/app-url";
import { xeroEnv } from "@/lib/xero/env";

const KEYS = [
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_SITE_URL",
  "VERCEL_ENV",
  "VERCEL_URL",
  "VERCEL_PROJECT_PRODUCTION_URL",
  "XERO_REDIRECT_URI",
];

describe("appUrl", () => {
  beforeEach(() => {
    for (const key of KEYS) vi.stubEnv(key, "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("defaults to localhost when nothing is configured", () => {
    expect(appUrl()).toBe("http://localhost:3000");
  });

  it("uses NEXT_PUBLIC_APP_URL and trims a trailing slash", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://books.example.com/");
    expect(appUrl()).toBe("https://books.example.com");
  });

  it("keeps a localhost NEXT_PUBLIC_APP_URL outside Vercel", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
    vi.stubEnv("VERCEL_URL", "ignored.vercel.app");
    expect(appUrl()).toBe("http://localhost:3000");
  });

  it("ignores a localhost NEXT_PUBLIC_APP_URL on a Vercel production deployment", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("VERCEL_URL", "book-keeper-abc123.vercel.app");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "book-keeper.example.vercel.app");
    expect(appUrl()).toBe("https://book-keeper.example.vercel.app");
  });

  it("uses the deployment URL on a Vercel preview", () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("VERCEL_URL", "book-keeper-git-feature.vercel.app");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "book-keeper.example.vercel.app");
    expect(appUrl()).toBe("https://book-keeper-git-feature.vercel.app");
  });

  it("prefers an explicit public URL over the Vercel URL", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://books.example.com");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "book-keeper.example.vercel.app");
    expect(appUrl()).toBe("https://books.example.com");
  });
});

describe("xeroEnv.redirectUri", () => {
  beforeEach(() => {
    for (const key of KEYS) vi.stubEnv(key, "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses XERO_REDIRECT_URI when set", () => {
    vi.stubEnv("XERO_REDIRECT_URI", "https://books.example.com/api/xero/callback");
    expect(xeroEnv.redirectUri).toBe("https://books.example.com/api/xero/callback");
  });

  it("derives the callback from the app URL when unset", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://books.example.com");
    expect(xeroEnv.redirectUri).toBe("https://books.example.com/api/xero/callback");
  });

  it("ignores a localhost XERO_REDIRECT_URI on a Vercel deployment", () => {
    vi.stubEnv("XERO_REDIRECT_URI", "http://localhost:3000/api/xero/callback");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "book-keeper.example.vercel.app");
    expect(xeroEnv.redirectUri).toBe("https://book-keeper.example.vercel.app/api/xero/callback");
  });
});
