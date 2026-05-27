-- BKP-018: race-safe idempotency for the rules evaluator.
-- One match row per (transaction, suggestion_source) so that concurrent
-- evaluator runs cannot insert duplicate match rows for the same transaction.

alter table public.transaction_rule_matches
  add constraint transaction_rule_matches_txn_source_uniq
  unique (xero_bank_transaction_id, suggestion_source);
