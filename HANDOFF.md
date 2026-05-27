# Handoff

Last updated: 2026-05-27

## Read First

`PROJECT_CONTEXT.md` is now the living source of truth for both Codex and Claude Code. Read it before implementation and update it before ending a material session.

## Current State

Phase 2.1 Xero push-to-accounting work is complete on `develop`:

- BKP-013 / RAF-23: Xero API client wrapper.
- BKP-014 / RAF-24: initial Xero sync.
- BKP-015 / RAF-25: delta Xero sync.
- BKP-010a / RAF-43: `xero_invoices.publish_error`.
- BKP-023 / RAF-33: invoice composer and publish to Xero.
- BKP-024 / RAF-34: bill capture, AI extraction, attachment upload, and publish to Xero.

**BKP-017 / RAF-44 — rules engine schema — files written, pending `supabase db push` + final verification:**

- `supabase/migrations/0013_rules_engine_schema.sql` — all five tables + RLS + indexes. Also includes the BKP-026 columns on `transaction_rule_matches` upfront (`suggestion_source`, `ai_confidence`, `ai_model`).
- `tests/db/rules-rls.test.ts` — four mock-based isolation tests (tenant A/B visibility + cross-tenant insert block).
- `vitest.config.ts` — added `tests/db/**` to include patterns.
- Feature spec: `phase-2/specs/0004-ai-reconciliation-queue.md` (source of truth for the full reconciliation feature — BKP-017, 018, 026, 019).

**Still to do for BKP-017:**

1. Create a feature branch off `develop` (`git switch -c bkp-017-rules-engine-schema`).
2. Run `supabase db push` locally to apply the migration and confirm it runs cleanly.
3. Run `supabase gen types typescript --local > lib/database.types.ts` to regenerate types.
4. Run `pnpm typecheck && pnpm lint && pnpm test` — all must pass.
5. Open PR titled `[BKP-017] rules engine schema migration`.

## Next Card

BKP-017 / RAF-44 — complete the steps above, then move to BKP-018 / RAF-45 (rules evaluator Inngest job).

## Low-Token Workflow

For each session:

1. Read `PROJECT_CONTEXT.md`.
2. Read this file.
3. Read the active Linear card.
4. Read only directly relevant code/docs.
5. Work one card only.
6. Run targeted verification.
7. Update `PROJECT_CONTEXT.md`.
8. Update this handoff only if the immediate next action changed.

## Local Notes

- For local sync/publish jobs, run Next and Inngest in separate terminals:

```bash
pnpm dev
pnpm dev:inngest
```

- `pnpm dev:inngest` explicitly registers `http://localhost:3000/api/inngest`.
- `pnpm dev` clears known stale inherited Supabase/Xero env vars before starting Next, so `.env.local` is used.
- In local development, the Inngest client defaults to dev mode even if `INNGEST_EVENT_KEY` is present.
- OpenAI extraction uses `OPENAI_API_KEY` and `OPENAI_BILL_EXTRACTION_MODEL`, defaulting to `gpt-5`.
- Bill attachments use `BILL_ATTACHMENTS_BUCKET`, defaulting to `xero-bill-documents`.
- `gh` is not installed locally.

## Hard Constraints

- Money stays in integer cents.
- RLS belongs in Postgres.
- Preserve cash-basis accounting rules.
- Keep work scoped to the active Linear card.
- PR title format: `[BKP-NNN] short description`.
