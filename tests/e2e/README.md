# E2E Smoke Tests

## Scope

- Public smoke:
  - `/login` renders expected controls.
  - Anonymous users are redirected from `/dashboard` to `/login`.
- Authenticated smoke (currently skipped):
  - Confirms transaction form is present on `/dashboard` and `/ledger` post-auth.

## Setup

1. Install Playwright and browser binaries:

```bash
pnpm add -D @playwright/test
pnpm exec playwright install --with-deps chromium
```

2. Ensure Supabase env vars are available for middleware/runtime:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

3. Run public smoke tests:

```bash
pnpm exec playwright test tests/e2e/smoke.spec.ts
```

4. Run full e2e suite:

```bash
pnpm exec playwright test
```

## Authenticated Suite Enablement

The authenticated suite is intentionally skipped until credentials and state fixture are prepared.

To enable:

1. Record an authenticated state into `tests/e2e/.auth/user.json`.
2. Replace `test.skip(true, ...)` with conditional skip logic (or remove skip).
3. Keep fixture secrets out of git.
