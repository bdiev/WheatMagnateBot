-- A player can call a Pearl Loader request off ("cancel") before the trapdoor is touched.
ALTER TABLE pearl_loader_requests DROP CONSTRAINT IF EXISTS pearl_loader_requests_outcome_check;
ALTER TABLE pearl_loader_requests ADD CONSTRAINT pearl_loader_requests_outcome_check
  CHECK (outcome IN ('completed', 'no_pearl', 'failed', 'cancelled'));
