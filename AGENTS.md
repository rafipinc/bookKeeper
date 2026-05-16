# AGENTS.md — bookkeeping-app

Loaded automatically when Codex launches in this directory. Brief on purpose; the long-form context lives in the agent-workflow repo.

## What this repo is

A web bookkeeping app for solo operators — log expenses/revenues, see a monthly summary. Driven by the spec at `../agent-workflow/specs/0002-bookkeeping-app-mvp.md`.

## Driving artifacts (live in ../agent-workflow/)

- **HANDOFF.md** (this repo) — what to do next when starting a session
- **Spec:** `../agent-workflow/specs/0002-bookkeeping-app-mvp.md` (status: approved)
- **Critical ADR:** `../agent-workflow/adrs/0005-cash-basis-accounting-v1.md`
- **Designs:** `../agent-workflow/designs/BKP-002.md`, `BKP-003.md`, `BKP-005.md`
- **Cards:** [Linear — Bookkeeping App project](https://linear.app/rafaelpincus/project/bookkeeping-app-7473e212fd7b) (RAF-11 through RAF-17 for Phase 1)
- **Role subagents** live in `../agent-workflow/.Codex/agents/` — not loaded in this session. Switch to that directory's Codex to invoke Reviewer, Tech Lead, etc.

## Stack (do not deviate without a new ADR)

Next.js 15 (App Router) · TypeScript (strict) · Tailwind · shadcn/ui · Supabase (auth/DB/storage) · Vercel. pnpm package manager.

## Hard rules

- **Money in cents.** `amount_cents bigint`. Never floats. Never `numeric`.
- **RLS in Postgres**, never in application code. Every user-data table has a policy and a test proving it.
- **Cash basis.** Transactions have one `date` column. No obligation/settlement split. See ADR-0005.
- **Mobile-first.** Design briefs specify mobile layouts; respect them.
- **Spec non-goals are real.** No invoicing, payroll, AR/AP, tax, multi-currency UI, or multi-business UI — even if a card seems to imply one.
- **One card at a time.** Implement only the card's acceptance criteria. Stop when they're met.
- **PR title format:** `[BKP-NNN] short description`. PR body references the Linear card URL.

## Reviewer flow

After opening a PR, switch to a Codex session in `../agent-workflow/` and say *"Use the reviewer subagent to review PR <URL>."* The Reviewer is advisory — Rafi makes the final merge call.

## When to push back

If a card is unclear, if the design doesn't cover an edge case, or if the stack default seems wrong for the work — **stop and ask Rafi**. The system is designed for explicit handoff on ambiguity, not silent improvisation.

## Where you are right now

Phase 1 of 5. No app code exists yet. Start with HANDOFF.md, which points you at RAF-11.
