CREATE TABLE trash_batches (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES accounts(id),
  cause_operation_id uuid NOT NULL UNIQUE,
  root_kind text NOT NULL CHECK(root_kind IN ('project','pattern')),
  root_id uuid NOT NULL,
  member_ids uuid[] NOT NULL,
  confirmed_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  state text NOT NULL DEFAULT 'trashed' CHECK(state IN ('trashed','restored','purging','purged')),
  CHECK(expires_at=confirmed_at+interval '30 days')
);
ALTER TABLE projects ADD COLUMN trash_batch_id uuid REFERENCES trash_batches(id);
ALTER TABLE patterns ADD COLUMN trash_batch_id uuid REFERENCES trash_batches(id);
CREATE TABLE purge_jobs (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL,
  operation_id uuid NOT NULL UNIQUE,
  root_kind text NOT NULL CHECK(root_kind IN ('project','pattern','account')),
  root_id uuid NOT NULL,
  scope_revision text NOT NULL,
  member_ids uuid[] NOT NULL,
  object_keys text[] NOT NULL,
  completed_keys text[] NOT NULL DEFAULT '{}',
  state text NOT NULL CHECK(state IN ('intent','objects','metadata','complete')),
  suppression_id uuid NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  completed_at timestamptz,
  CHECK(completed_keys <@ object_keys),
  CHECK((state='complete')=(completed_at IS NOT NULL))
);
CREATE FUNCTION protect_trash_batch() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  IF ROW(NEW.id,NEW.owner_id,NEW.cause_operation_id,NEW.root_kind,NEW.root_id,NEW.member_ids,NEW.confirmed_at,NEW.expires_at)
    IS DISTINCT FROM ROW(OLD.id,OLD.owner_id,OLD.cause_operation_id,OLD.root_kind,OLD.root_id,OLD.member_ids,OLD.confirmed_at,OLD.expires_at)
    THEN RAISE EXCEPTION 'Immutable trash scope'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trash_scope_immutable BEFORE UPDATE ON trash_batches FOR EACH ROW EXECUTE FUNCTION protect_trash_batch();
CREATE FUNCTION protect_purge_input() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  IF ROW(NEW.id,NEW.owner_id,NEW.operation_id,NEW.root_kind,NEW.root_id,NEW.scope_revision,NEW.member_ids,NEW.object_keys,NEW.suppression_id)
    IS DISTINCT FROM ROW(OLD.id,OLD.owner_id,OLD.operation_id,OLD.root_kind,OLD.root_id,OLD.scope_revision,OLD.member_ids,OLD.object_keys,OLD.suppression_id)
    OR NOT OLD.completed_keys <@ NEW.completed_keys THEN RAISE EXCEPTION 'Immutable purge input'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER purge_input_immutable BEFORE UPDATE ON purge_jobs FOR EACH ROW EXECUTE FUNCTION protect_purge_input();
