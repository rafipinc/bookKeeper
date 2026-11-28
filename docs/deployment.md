# Deployment (Vercel + Supabase + Xero + Inngest)

How the live app is wired, and the checklist for a working deploy.

## Where things run

| Piece | Where | Notes |
| --- | --- | --- |
| Web app + API routes | Vercel project `book-keeper` | `develop` is the Production branch. Every push to `develop` deploys to Production. |
| Production URL | `https://book-keeper-rafael-s-projects21.vercel.app` | `book-keeper.vercel.app` is **not** this project (another account owns it). Add a custom domain before onboarding a company. |
| Database, auth, storage | Supabase project `book-keeper` (`iaenvnkvwbotdtzxxpyc`, ap-southeast-2) | Free-plan projects pause after a week idle. Upgrade to Pro before real use. |
| Background jobs | Inngest Cloud app `bookkeeping-app`, served from `/api/inngest` | Xero sync, publish, rules and AI suggestions all run here. |
| Accounting | Xero app at developer.xero.com | OAuth callback is `/api/xero/callback`. |

## Verify a deploy

```bash
curl -s https://book-keeper-rafael-s-projects21.vercel.app/api/health
```

The response is `200` with `"ok": true` when every required connector is configured and Supabase answers, and `503` otherwise. Each check reads `ok`, `dev`, `missing_config` or `unreachable`. OpenAI is reported but optional.

`GET /api/inngest` should return `{"message":"Unauthorized"}` to an anonymous request. `{"code":"internal_server_error"}` means `INNGEST_SIGNING_KEY` is missing.

## Environment variables (Vercel -> Settings -> Environment Variables)

| Variable | Production | Preview | Notes |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | required | required | Baked into the build. A Preview build fails without it. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | required | required | Baked into the build. |
| `SUPABASE_SERVICE_ROLE_KEY` | required | required | Server only. Never prefix with `NEXT_PUBLIC_`. |
| `XERO_CLIENT_ID` / `XERO_CLIENT_SECRET` | required | optional | Xero has no wildcard redirects, so Xero connect only works on URLs registered on the Xero app. |
| `XERO_REDIRECT_URI` | leave unset, or the production callback | leave unset | Unset means `${app URL}/api/xero/callback`. A localhost value is ignored on Vercel. |
| `NEXT_PUBLIC_APP_URL` | leave unset, or the custom domain | leave unset | Unset means the Vercel production URL (Production) or deployment URL (Preview). A localhost value is ignored on Vercel. |
| `INNGEST_SIGNING_KEY` / `INNGEST_EVENT_KEY` | required | required | Set automatically by the Inngest Vercel integration. |
| `OPENAI_API_KEY` | recommended | optional | AI suggestions and bill extraction. |
| `OPENAI_RECONCILIATION_MODEL`, `OPENAI_BILL_EXTRACTION_MODEL`, `BILL_ATTACHMENTS_BUCKET`, `XERO_DEBUG` | optional | optional | Defaults are in `.env.example`. |

After changing variables, redeploy (Deployments -> latest -> Redeploy). Variables only apply to new builds.

Preview deployments use the same Supabase project as Production unless you give Preview its own values. Before real company data is in the database, point Preview at a separate Supabase project.

## External dashboards

1. **Supabase -> Authentication -> URL Configuration.** Set Site URL to the production URL. Add `https://book-keeper-rafael-s-projects21.vercel.app/auth/callback` (and any custom domain's `/auth/callback`) to Redirect URLs. Magic-link sign-in redirects to `window.location.origin/auth/callback`, so an unlisted domain falls back to the Site URL.
2. **Xero developer portal -> your app -> Configuration.** Add `https://book-keeper-rafael-s-projects21.vercel.app/api/xero/callback` as a redirect URI, keeping the localhost one for development.
3. **Inngest.** Install the Inngest integration from the Vercel Marketplace and link it to `book-keeper`. It sets both Inngest keys for Production and Preview and syncs the app on every deploy. Without the integration, copy the keys from app.inngest.com and sync `https://<production URL>/api/inngest` manually after each deploy.
4. **Reconnect Xero** from Settings -> Integrations once steps 1 to 3 are done. Xero refresh tokens expire after 60 days without use.

## Database migrations

Migrations in `supabase/migrations` are not applied automatically on deploy. After merging a migration, apply it to the live project (Supabase MCP `apply_migration`, or `supabase db push` with the project linked) **before** the code that depends on it deploys. Compare `supabase_migrations.schema_migrations` with the repo when in doubt.

## CI

`.github/workflows/ci.yml` runs lint, typecheck, unit tests and a build on pushes and pull requests to `develop` and `main`, using pnpm 10 and Node 24 to match Vercel. pnpm 9 cannot install this repo, because `pnpm-workspace.yaml` has no `packages` field.
