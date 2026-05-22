# bookkeeping-app

Fast bookkeeping for solo operators and microbusinesses — log expenses and revenues, stay on top of your numbers. Built with Next.js 15, TypeScript, Tailwind, shadcn/ui, and Supabase.

## How to run

1. Install dependencies:

```bash
pnpm install
```

2. Create `.env.local` with Supabase and Xero values:

```bash
NEXT_PUBLIC_SUPABASE_URL=your-supabase-project-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
NEXT_PUBLIC_APP_URL=http://localhost:3000
XERO_CLIENT_ID=your-xero-client-id
XERO_CLIENT_SECRET=your-xero-client-secret
XERO_REDIRECT_URI=http://localhost:3000/api/xero/callback
INNGEST_EVENT_KEY=your-inngest-event-key
INNGEST_SIGNING_KEY=your-inngest-signing-key
```

For the current Phase 2 work, `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY` can stay blank until the Xero sync jobs are implemented. Xero OAuth requires the redirect URI in `.env.local` to match the redirect URI configured in the Xero Developer app exactly.

If a shell exports stale Supabase or Xero env vars, those values can override `.env.local`. For local OAuth debugging, start the dev server with inherited integration env vars cleared:

```bash
env -u SUPABASE_SERVICE_ROLE_KEY \
  -u NEXT_PUBLIC_SUPABASE_URL \
  -u NEXT_PUBLIC_SUPABASE_ANON_KEY \
  -u NEXT_PUBLIC_APP_URL \
  -u NEXT_PUBLIC_SITE_URL \
  -u XERO_CLIENT_ID \
  -u XERO_CLIENT_SECRET \
  -u XERO_REDIRECT_URI \
  pnpm dev
```

3. Start the app:

```bash
pnpm dev
```

4. In a second terminal, start the Inngest dev server:

```bash
pnpm dev:inngest
```

Useful checks:

```bash
pnpm lint       # ESLint
pnpm typecheck  # TypeScript type check
pnpm build      # production build
```

## Deploy

Vercel project URL: [book-keeper](https://vercel.com/rafael-s-projects21/book-keeper)

Required environment variables for both `preview` and `production`:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_APP_URL=
XERO_CLIENT_ID=
XERO_CLIENT_SECRET=
XERO_REDIRECT_URI=
INNGEST_EVENT_KEY=
INNGEST_SIGNING_KEY=
```

Recommended deploy flow:

```bash
pnpm dlx vercel link
pnpm dlx vercel env add NEXT_PUBLIC_SUPABASE_URL preview
pnpm dlx vercel env add NEXT_PUBLIC_SUPABASE_URL production
pnpm dlx vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY preview
pnpm dlx vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production
pnpm dlx vercel env add SUPABASE_SERVICE_ROLE_KEY preview
pnpm dlx vercel env add SUPABASE_SERVICE_ROLE_KEY production
pnpm dlx vercel env add NEXT_PUBLIC_APP_URL preview
pnpm dlx vercel env add NEXT_PUBLIC_APP_URL production
pnpm dlx vercel env add XERO_CLIENT_ID preview
pnpm dlx vercel env add XERO_CLIENT_ID production
pnpm dlx vercel env add XERO_CLIENT_SECRET preview
pnpm dlx vercel env add XERO_CLIENT_SECRET production
pnpm dlx vercel env add XERO_REDIRECT_URI preview
pnpm dlx vercel env add XERO_REDIRECT_URI production
pnpm dlx vercel env add INNGEST_EVENT_KEY preview
pnpm dlx vercel env add INNGEST_EVENT_KEY production
pnpm dlx vercel env add INNGEST_SIGNING_KEY preview
pnpm dlx vercel env add INNGEST_SIGNING_KEY production
pnpm dlx vercel --prod
```

After linking, connect the GitHub repo in Vercel so pushes to `main` create production deployments and PRs create preview deployments.

## Background jobs

Inngest functions are served from `/api/inngest` and are deployed with the Next.js app on Vercel. Local development needs both the Next.js server and the Inngest dev server:

```bash
pnpm dev
pnpm dev:inngest
```

The initial smoke function is `helloPing`, triggered by `app/hello.ping`. You can invoke it from any server-side code with:

```ts
await inngest.send({
  name: "app/hello.ping",
  data: { message: "hi" },
});
```

Local runs appear in the Inngest dev UI. Preview and production run history lives in the Inngest Cloud dashboard for the connected app.


Branching model: feature branches target develop.

## Current Phase 2 Status

Phase 2 Xero integration is in progress on `develop`.

Current local state as of 2026-05-22:
- RAF-22 token encryption/refresh is implemented with Supabase RPC encryption, advisory-lock refresh, disconnect revocation, and reauth-required handling.
- Localhost Xero OAuth has been manually verified end to end.
- Live Supabase `book-keeper` has had token-encryption and OAuth-state migrations applied.
- Local `/login` redirect loop was fixed by restoring the magic-link form for signed-out users.
- Next planning/development step is RAF-23 / BKP-013: Xero API client wrapper.

Before handing off or continuing, read `HANDOFF.md` for the current Phase 2 status and next-card context.
