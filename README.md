# bookkeeping-app

Fast bookkeeping for solo operators and microbusinesses — log expenses and revenues, stay on top of your numbers. Built with Next.js 15, TypeScript, Tailwind, shadcn/ui, and Supabase.

## How to run

1. Install dependencies:

```bash
pnpm install
```

2. Create `.env.local` with Supabase values:

```bash
NEXT_PUBLIC_SUPABASE_URL=your-supabase-project-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
INNGEST_EVENT_KEY=your-inngest-event-key
INNGEST_SIGNING_KEY=your-inngest-signing-key
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
