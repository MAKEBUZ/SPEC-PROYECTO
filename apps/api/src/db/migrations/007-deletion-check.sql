CREATE TABLE deletion_checks (
  request_id uuid PRIMARY KEY,
  account_id uuid,
  operation_id uuid,
  state text NOT NULL CHECK (state IN ('pending','cancelled','deleted')),
  requested_at timestamptz,
  expires_at timestamptz,
  confirmed_at timestamptz,
  check_expires_at timestamptz,
  CHECK ((state='pending' AND account_id IS NOT NULL AND operation_id IS NOT NULL AND requested_at IS NOT NULL
    AND expires_at IS NOT NULL AND expires_at=requested_at+interval '30 days' AND confirmed_at IS NULL AND check_expires_at IS NULL)
    OR (state<>'pending' AND account_id IS NULL AND operation_id IS NULL AND requested_at IS NULL AND expires_at IS NULL
    AND confirmed_at IS NOT NULL AND check_expires_at IS NOT NULL AND check_expires_at=confirmed_at+interval '90 days'))
);
CREATE UNIQUE INDEX one_pending_account_deletion ON deletion_checks(account_id) WHERE state='pending';
CREATE TABLE deletion_check_credentials (
  id uuid PRIMARY KEY,
  request_id uuid NOT NULL REFERENCES deletion_checks(request_id),
  secret_hash text NOT NULL UNIQUE CHECK (secret_hash ~ '^[a-f0-9]{64}$'),
  issued_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE account_deletion_jobs (
  request_id uuid PRIMARY KEY REFERENCES deletion_checks(request_id),
  account_id uuid NOT NULL,
  state text NOT NULL CHECK (state IN ('queued','handed_off'))
);
CREATE FUNCTION preserve_deletion_terminal() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.state<>'pending' AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'Terminal deletion evidence is immutable';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER preserve_deletion_terminal BEFORE UPDATE ON deletion_checks
FOR EACH ROW EXECUTE FUNCTION preserve_deletion_terminal();
