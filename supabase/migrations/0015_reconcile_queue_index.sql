-- BKP-019: Performance index for the pre-reconciliation queue.
-- Satisfies the < 500ms render requirement for tenants with 1,000+
-- unreconciled transactions. Partial index on is_reconciled = false so
-- the planner skips already-reconciled rows entirely.

create index if not exists xero_bank_transactions_reconcile_queue_idx
  on public.xero_bank_transactions (platform_tenant_id, xero_tenant_id, date desc)
  where is_reconciled = false;
