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

## Next Card

Start with BKP-017 / RAF-44: rules engine schema migration.

Before editing, inspect the current dirty worktree. On 2026-05-27 it contained BKP-017-looking changes and two duplicate-looking ` 2.ts` files. Do not delete or overwrite user work without inspecting it.

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
