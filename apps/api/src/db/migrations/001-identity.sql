CREATE TABLE accounts (
  id uuid PRIMARY KEY,
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  display_name text,
  verified_at timestamptz,
  status text NOT NULL CHECK (status IN ('pending_verification', 'active', 'deletion_pending')),
  deletion_deadline timestamptz,
  used_bytes bigint NOT NULL DEFAULT 0 CHECK (used_bytes >= 0),
  reserved_bytes bigint NOT NULL DEFAULT 0 CHECK (reserved_bytes >= 0),
  CHECK ((status = 'deletion_pending') = (deletion_deadline IS NOT NULL))
);

CREATE TABLE sessions (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES accounts(id),
  token_hash text NOT NULL UNIQUE,
  access_class text NOT NULL CHECK (access_class IN ('normal', 'verification', 'account_recovery')),
  started_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  CHECK (expires_at > started_at AND expires_at <= started_at + interval '7 days')
);

CREATE FUNCTION preserve_session_deadline() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.started_at IS DISTINCT FROM OLD.started_at OR NEW.expires_at IS DISTINCT FROM OLD.expires_at THEN
    RAISE EXCEPTION 'Session deadlines are immutable';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER session_deadline_immutable BEFORE UPDATE ON sessions
FOR EACH ROW EXECUTE FUNCTION preserve_session_deadline();

CREATE TABLE one_use_tokens (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES accounts(id),
  purpose text NOT NULL CHECK (purpose IN ('verify_email', 'reset_password')),
  token_hash text NOT NULL UNIQUE,
  issued_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  superseded_at timestamptz,
  CHECK (expires_at > issued_at),
  CHECK ((purpose = 'verify_email' AND expires_at = issued_at + interval '2 hours')
      OR (purpose = 'reset_password' AND expires_at = issued_at + interval '30 minutes'))
);
CREATE UNIQUE INDEX one_active_token ON one_use_tokens(account_id, purpose)
WHERE consumed_at IS NULL AND superseded_at IS NULL;
