-- Migration 016: 'paused' run status
--
-- Enables human review gating: when the human_review node enqueues pending
-- approval items, the run transitions to 'paused' and execution stops.
-- Once the last item is decided, the run resumes and transitions back to 'running'.

BEGIN;

ALTER TABLE runs DROP CONSTRAINT IF EXISTS chk_runs_status;
ALTER TABLE runs ADD CONSTRAINT chk_runs_status CHECK (
    status IN (
        'pending', 'running', 'completed', 'failed', 'cancelled',
        'completed_with_persistence_gap', 'paused'
    )
);

CREATE OR REPLACE FUNCTION enforce_run_status_transition() RETURNS TRIGGER AS $$
DECLARE
  valid_transitions JSONB := '{
    "pending": ["running"],
    "running": ["completed", "failed", "cancelled", "completed_with_persistence_gap", "paused"],
    "paused": ["running", "cancelled"]
  }'::jsonb;
  allowed_next JSONB;
BEGIN
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;
  allowed_next := valid_transitions -> OLD.status;
  IF allowed_next IS NULL OR NOT (allowed_next ? NEW.status) THEN
    RAISE EXCEPTION 'Invalid run status transition: % → %', OLD.status, NEW.status;
  END IF;
  NEW.version := OLD.version + 1;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMIT;
