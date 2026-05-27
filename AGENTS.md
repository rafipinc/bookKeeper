# AGENTS.md - bookkeeping-app

Loaded automatically when Codex launches in this directory.

## Mandatory Start

Before doing any implementation work, read:

1. `PROJECT_CONTEXT.md`
2. `HANDOFF.md`
3. The active Linear card only

Do not load full specs, ADRs, designs, or broad file trees unless the active card explicitly needs them. Follow the context budget in `PROJECT_CONTEXT.md`.

## Shared Agent Rules

- Codex and Claude Code must both treat `PROJECT_CONTEXT.md` as the living source of truth.
- Every material session must update `PROJECT_CONTEXT.md` before ending.
- Work one Linear card at a time.
- Implement only the active card's acceptance criteria.
- Prefer local repo evidence over old planning docs when they disagree.
- Ask Rafi before changing architecture, scope, product behavior, or accounting assumptions.

## Stack

Next.js 15 App Router, TypeScript strict, Tailwind, shadcn/ui, Supabase auth/DB/storage, Inngest, Xero, Vercel, pnpm.

## Hard Product Rules

- Money stays in integer cents: `amount_cents bigint`. Never floats. Never `numeric`.
- RLS belongs in Postgres, not application code. User-data tables need RLS tests.
- Cash basis only. Transactions have one `date` column.
- Mobile-first UI.
- No invoicing/payroll/AR/AP/tax/multi-currency/multi-business scope unless a current card and ADR explicitly allow it.
- PR title format: `[BKP-NNN] short description`.

## Branching

Follow the current repo branch strategy in `PROJECT_CONTEXT.md` and `docs/branching-strategy.md`. Never merge to `main` without Rafi's explicit instruction.
