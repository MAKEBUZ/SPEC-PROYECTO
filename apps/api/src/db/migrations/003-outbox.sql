CREATE TABLE outbox_jobs (
  id uuid PRIMARY KEY,
  kind text NOT NULL CHECK (kind = 'account_token'),
  deduplication_key text NOT NULL UNIQUE,
  account_id uuid NOT NULL REFERENCES accounts(id),
  token_id uuid NOT NULL UNIQUE REFERENCES one_use_tokens(id),
  state text NOT NULL CHECK (state IN ('pending','delivered','invalidated')),
  key_id text,
  payload bytea,
  nonce bytea,
  auth_tag bytea,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  completed_at timestamptz,
  CHECK ((state='pending' AND key_id IS NOT NULL AND payload IS NOT NULL AND nonce IS NOT NULL AND auth_tag IS NOT NULL AND octet_length(nonce)=12 AND octet_length(auth_tag)=16 AND completed_at IS NULL)
    OR (state<>'pending' AND key_id IS NULL AND payload IS NULL AND nonce IS NULL AND auth_tag IS NULL AND completed_at IS NOT NULL))
);
CREATE INDEX outbox_pending ON outbox_jobs(next_attempt_at) WHERE state='pending';

CREATE FUNCTION invalidate_token_delivery() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.consumed_at IS NOT NULL OR NEW.superseded_at IS NOT NULL THEN
    UPDATE outbox_jobs SET state='invalidated',key_id=NULL,payload=NULL,nonce=NULL,auth_tag=NULL,completed_at=clock_timestamp()
    WHERE token_id=NEW.id AND state='pending';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER invalidate_token_delivery AFTER UPDATE ON one_use_tokens
FOR EACH ROW EXECUTE FUNCTION invalidate_token_delivery();
