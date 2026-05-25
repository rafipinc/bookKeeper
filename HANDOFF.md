# Handoff

Last updated: 2026-05-25

## Current State

Phase 2 Xero work through BKP-024 has been reviewed and merged locally into `develop`.

The merged stack includes:

- BKP-010a: `xero_invoices.publish_error`
- BKP-014: initial Xero tenant sync Inngest job
- BKP-023: ACCREC invoice composer and publish flow
- BKP-024: ACCPAY bill capture, extraction, attachment upload, and publish flow

## Review Fixes Applied Before Merge

- Initial sync now imports the full Xero chart of accounts, not only bank accounts, so invoice revenue accounts and bill expense accounts are available after sync.
- Bill attachment upload now verifies the bill belongs to the current platform tenant before issuing a signed upload URL.
- Bill draft save rejects attachment paths that do not belong to the current tenant and bill.
- Bill composer avoids duplicate draft creation when uploading an attachment immediately after the first save.
- Bill extraction prefill now understands the backend's structured snake_case extraction response.
- Published bills without attachments no longer remain stuck with `attachment_status='pending'`.

## Verification Run

On the reviewed stack before merging into `develop`:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

All passed. `pnpm build` emitted only the existing Next workspace-root warning caused by multiple lockfiles.

## Still To Do

1. Push `develop` if it has not already been pushed:

```bash
git switch develop
git status --short --branch
git push origin develop
```

2. Optional manual check:
   - Start `pnpm dev`.
   - Log in.
   - Confirm Xero initial sync produces revenue and expense accounts.
   - Open `/compose/invoice` and `/compose/bill`.
   - Upload a PDF/JPEG/PNG under 10MB on `/compose/bill`.
   - Confirm extraction prefill, save draft, and publish queue behavior.

## Local Notes

- OpenAI extraction uses `OPENAI_API_KEY` and `OPENAI_BILL_EXTRACTION_MODEL`, defaulting to `gpt-5`.
- Bill attachments use `BILL_ATTACHMENTS_BUCKET`, defaulting to `xero-bill-documents`.
- `gh` is not installed locally.

## Hard Constraints

- Money stays in integer cents.
- RLS belongs in Postgres.
- Preserve cash-basis accounting rules.
- Keep work scoped to the active Linear card.
- PR title format: `[BKP-NNN] short description`.
