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
```

3. Start the app:

```bash
pnpm dev
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
pnpm dlx vercel --prod
```

After linking, connect the GitHub repo in Vercel so pushes to `main` create production deployments and PRs create preview deployments.
