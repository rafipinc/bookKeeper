# Handoff

Last updated: 2026-05-25

## Current State

Phase 2 Xero work is being shipped as stacked review branches from `develop`.

`gh` is not installed locally, so branches are pushed and PRs need to be opened from compare URLs.

## Branch Stack

Open PRs in this order:

1. `codex/raf-43-bkp-010a-xero-invoices-publish-error`
   - Base: `develop`
   - Scope: adds nullable `xero_invoices.publish_error` and Supabase types.

2. `codex/raf-24-bkp-014-initial-xero-sync-job`
   - Base: `codex/raf-43-bkp-010a-xero-invoices-publish-error`
   - Scope: Inngest initial Xero tenant sync for accounts, contacts, tax rates, and bank transactions.

3. `codex/raf-33-bkp-023-invoice-composer`
   - Base: `codex/raf-24-bkp-014-initial-xero-sync-job`
   - Scope: ACCREC invoice composer, save draft API, publish API, and Xero publish Inngest job.

4. `codex/raf-34-bkp-024-bill-capture`
   - Base: `codex/raf-33-bkp-023-invoice-composer`
   - Scope: ACCPAY bill capture, document extraction, attachment upload, save draft API, publish API, and Xero publish Inngest job.

## BKP-024 Takeover Point

Integration branch:

```bash
git switch codex/raf-34-bkp-024-bill-capture
```

Commits currently on the BKP-024 integration branch:

- `9bac300` `[BKP-024] Implement bill extraction and ACCPAY publish backend`
- `7939ce4` `[BKP-024] Add bill composer extraction frontend`
- `fa7ae7b` `[BKP-024] Fix bill composer attachment integration`

Worker branches used to build it:

- `codex/raf-34-bkp-024-backend` at `9877f75`
- `codex/raf-34-bkp-024-frontend` at `e5c47d6`

The integration branch includes an extra fix beyond the worker branches:

- Frontend now reads the save response from `bill`, not `invoice`.
- Frontend uploads the selected receipt/bill file through `/api/bills/attachments/upload-url`.
- After upload, the draft is resaved with `attachment_path` and `attachment_status='pending'`.
- Draft edit page selects and passes existing `attachment_path`.

## Verification Already Run

On `codex/raf-34-bkp-024-bill-capture`:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

All passed. `pnpm build` only emitted the existing Next workspace-root warning caused by multiple lockfiles.

## Still To Do

1. Push `codex/raf-34-bkp-024-bill-capture`.
2. Open stacked PRs using the branch stack above.
3. Run reviewer flow from `../agent-workflow/` after PR URLs exist:

```text
Use the reviewer subagent to review PR <URL>.
```

4. Optional manual check:
   - Start `pnpm dev`.
   - Log in.
   - Open `/compose/bill`.
   - Upload a PDF/JPEG/PNG under 10MB.
   - Confirm extraction prefill, save draft, and publish queue behavior.

## Useful Compare URLs

- BKP-010a: `https://github.com/rafipinc/bookKeeper/compare/develop...codex/raf-43-bkp-010a-xero-invoices-publish-error?expand=1`
- BKP-014: `https://github.com/rafipinc/bookKeeper/compare/codex/raf-43-bkp-010a-xero-invoices-publish-error...codex/raf-24-bkp-014-initial-xero-sync-job?expand=1`
- BKP-023: `https://github.com/rafipinc/bookKeeper/compare/codex/raf-24-bkp-014-initial-xero-sync-job...codex/raf-33-bkp-023-invoice-composer?expand=1`
- BKP-024: `https://github.com/rafipinc/bookKeeper/compare/codex/raf-33-bkp-023-invoice-composer...codex/raf-34-bkp-024-bill-capture?expand=1`

## Local Notes

- Dev server may already be running from an earlier session: `pnpm dev` on port 3000.
- OpenAI extraction uses `OPENAI_API_KEY` and `OPENAI_BILL_EXTRACTION_MODEL`, defaulting to `gpt-5`.
- Bill attachments use `BILL_ATTACHMENTS_BUCKET`, defaulting to `xero-bill-documents`.

## Hard Constraints

- Money stays in integer cents.
- RLS belongs in Postgres.
- Preserve cash-basis accounting rules.
- Keep work scoped to the active Linear card.
- PR title format: `[BKP-NNN] short description`.
