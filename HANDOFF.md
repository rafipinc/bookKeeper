# Handoff to Claude Code

This repo is empty by design — the design and planning work for Phase 1 was done in `../agent-workflow/` and the cards live in Linear. When you launch Claude Code in this directory, this file is the entry point for what to do.

## What's already done

- **Spec:** `../agent-workflow/specs/0002-bookkeeping-app-mvp.md` (status: approved)
- **ADR:** `../agent-workflow/adrs/0005-cash-basis-accounting-v1.md` (accepted)
- **Designs:** `../agent-workflow/designs/BKP-002.md`, `BKP-003.md`, `BKP-005.md` (status: draft — Rafi can approve before implementing those cards)
- **Cards in Linear:** [Bookkeeping App project](https://linear.app/rafaelpincus/project/bookkeeping-app-7473e212fd7b) — RAF-11 through RAF-17

## How to start (recommended sequence)

1. **Read first:** the spec, then the ADR, then this file. Don't skip the spec — it bounds the work.
2. **Begin with RAF-11 (BKP-001).** Pure scaffold, no blockers. Acceptance criteria are in the Linear card.
3. **After RAF-11 lands**, RAF-12, RAF-13, RAF-14 are unblocked and can be worked in any order (parallel-safe).
4. **RAF-12 and RAF-13 need designs** — read the design files in `../agent-workflow/designs/` before coding. The brief is the source of truth; ignore anything not in the brief.
5. **RAF-04 → RAF-15 → RAF-16 → RAF-17** completes Phase 1.

## Per-card workflow (whether you're using Claude Code, Codex, or hand-typing)

For each card:

1. Read the Linear issue. Pay attention to the `spec:` and `design:` reference lines at the top.
2. Open the referenced spec section in `../agent-workflow/specs/0002-bookkeeping-app-mvp.md`.
3. Open the design file in `../agent-workflow/designs/` if one exists.
4. Read every ADR in `../agent-workflow/adrs/` — especially ADR-0005 (cash basis) and any project-level ADRs (ADR-0001 through 0004 cover the orchestration system itself; not strictly load-bearing for code in *this* repo but useful background).
5. Implement against the card's acceptance criteria. **Stop when those criteria are met** — don't add adjacent features.
6. Open a PR. Title format: `[BKP-NNN] short description`. Description should reference the Linear card URL.
7. Invoke the Reviewer. The Reviewer subagent only loads from inside `../agent-workflow/` (that's where `.claude/agents/reviewer.md` lives), so open a second Terminal, `cd ../agent-workflow`, run `claude`, and say in plain English: *"Use the reviewer subagent to review PR <URL>."* Claude Code auto-routes by subagent description; you do not use a slash command. The Reviewer is advisory — once it posts comments, Rafi merges.
8. Address review comments. Rafi merges.

## Constraints that override anything you might assume

- **Stack:** Next.js 15 (App Router) + TypeScript (strict) + Tailwind + shadcn/ui + Supabase + Vercel. No deviations without a new ADR.
- **Money:** `amount_cents bigint` only. Never floats for money. Never `numeric`.
- **RLS:** every user-data row is gated by Postgres RLS, not application-layer checks. The migration that introduces RLS includes a test that proves it.
- **Cash basis:** transactions have one `date` column. No obligation/settlement split. See ADR-0005.
- **Mobile-first:** the design briefs specify mobile layouts; respect them. Desktop responsive variations are explicit.
- **No invoicing, no payroll, no AR/AP, no tax, no multi-currency UI, no multi-business UI** — even if asked. Spec non-goals section is the contract.

## What this repo doesn't have yet

- No `package.json` (BKP-001 creates it)
- No env vars (BKP-002 documents them)
- No Vercel link (BKP-007)
- No CI (deferred to Phase 2)

## If you get stuck

- **Spec is unclear:** stop. Re-open the spec, find the section, and ask Rafi rather than guessing. The system is designed for explicit handoff on ambiguity.
- **Design doesn't cover an edge case:** ask Rafi to update the design before implementing. Don't invent UI.
- **Stack default seems wrong for this card:** propose an ADR before deviating.

## Next phase

Phase 2 (core transaction logging) is unscoped at the moment. After Phase 1 lands and is deployed, re-invoke the Tech Lead with the same spec — it knows the Phase 2 scope from the phased plan and will produce the Product input for the next batch of cards.
