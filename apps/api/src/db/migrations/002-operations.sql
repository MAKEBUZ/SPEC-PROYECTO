CREATE TABLE operation_results (
  requester_id uuid NOT NULL,
  operation_type text NOT NULL,
  operation_id uuid NOT NULL,
  historical_owner_id uuid,
  request_hash text NOT NULL,
  state text NOT NULL CHECK (state IN ('pending', 'resolved')),
  outcome text CHECK (outcome IN ('success', 'failure', 'no_change')),
  confirmed_at timestamptz,
  data jsonb,
  PRIMARY KEY(requester_id, operation_type, operation_id),
  CHECK ((state = 'resolved' AND outcome IS NOT NULL AND confirmed_at IS NOT NULL)
      OR (state = 'pending' AND outcome IS NULL AND confirmed_at IS NULL))
);
-- No account cascade: purge services must anonymize/delete according to the
-- last authorized account rule, not remove evidence accidentally via a FK.
