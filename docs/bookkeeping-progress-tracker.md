# Bookkeeping Progress Tracker

Last updated: 2026-05-27

## Current Delivery State

The Xero push-to-accounting path is now usable on `develop`:

- BKP-013 / RAF-23: Xero API client wrapper - Done.
- BKP-014 / RAF-24: Initial Xero sync job - Done.
- BKP-010a / RAF-43: `xero_invoices.publish_error` schema addendum - Done.
- BKP-023 / RAF-33: ACCREC invoice composer and publish flow - Done.
- BKP-024 / RAF-34: ACCPAY bill capture, extraction, attachment upload, and publish flow - Done.

Rafi has manually confirmed local progress: expenses and bills can now be added through the Xero integration flow.

## Update From 2026-05-27

Completed a delivery-alignment follow-up for the invoice and bill composers:

- Added shared composer readiness helper at `lib/xero/composer-readiness.ts`.
- Added unit coverage at `lib/xero/composer-readiness.test.ts`.
- Updated `/compose/invoice`, `/compose/invoice/[id]`, `/compose/bill`, and `/compose/bill/[id]` so composers only expose Xero organisations with the required synced contacts, accounts, and tax rates.
- Draft edit routes now block drafts whose Xero organisation is not ready, rather than allowing partial synced state through the composer.

Verification run:

- `pnpm typecheck`
- `pnpm lint`
- `pnpm test`

## Linear Alignment

Updated Linear on 2026-05-27:

- Marked RAF-23, RAF-24, RAF-33, RAF-34, and RAF-43 as Done.
- Added a delivery note to RAF-34 covering the composer readiness follow-up and verification.
- Moved RAF-25 / BKP-015 to Todo because BKP-014 is now complete and it is the next sync-related implementation candidate.
- Moved stale governance issue RAF-41 out of In Progress and back to Backlog.
- Left duplicate/deferred cards non-actionable rather than treating them as active work.

## Next Candidate

Next implementation candidate: BKP-015 / RAF-25 - Delta Xero sync.

Why:

- BKP-014 initial sync is now complete.
- BKP-015 is the next sync card and blocks BKP-018 rules evaluation.
- BKP-025 / RAF-39 was inspected but is marked Duplicate and deferred to RAF-35, so it should not be implemented unless the product direction changes.

## Workspace Notes

Duplicate local worktree folders and stale ` 2` copy artifacts were removed on 2026-05-27. The repo should now be treated as a single project rooted at `/Users/rafipincus/Documents/Projects/bookkeeping-app`.
