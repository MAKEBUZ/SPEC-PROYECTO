ALTER TABLE patterns ADD CONSTRAINT pattern_project_owner UNIQUE(id,project_id,owner_id);
CREATE TABLE publications (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES accounts(id),
  project_id uuid NOT NULL,
  pattern_id uuid,
  pattern_name text,
  expected_version_id uuid,
  document_id uuid NOT NULL,
  local_revision_id text NOT NULL CHECK (local_revision_id ~ '^[a-f0-9]{64}$'),
  manifest jsonb NOT NULL,
  manifest_hash text NOT NULL CHECK (manifest_hash ~ '^[a-f0-9]{64}$'),
  state text NOT NULL DEFAULT 'staging' CHECK (state IN ('staging','validating','validated','committed','rejected','abandoned')),
  validation_state text NOT NULL DEFAULT 'pending' CHECK (validation_state IN ('pending','running','valid','invalid')),
  reservation_bytes bigint NOT NULL CHECK (reservation_bytes>=0),
  commit_operation_id uuid UNIQUE,
  commit_session_id uuid,
  validated_manifest_hash text,
  validation_error text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  committed_at timestamptz,
  FOREIGN KEY(project_id,owner_id) REFERENCES projects(id,owner_id),
  FOREIGN KEY(pattern_id,project_id,owner_id) REFERENCES patterns(id,project_id,owner_id),
  CHECK ((pattern_id IS NULL AND expected_version_id IS NULL AND pattern_name IS NOT NULL AND length(btrim(pattern_name))>0)
    OR (pattern_id IS NOT NULL AND expected_version_id IS NOT NULL AND pattern_name IS NULL)),
  CHECK ((state='committed' AND committed_at IS NOT NULL AND reservation_bytes=0 AND commit_operation_id IS NOT NULL)
    OR (state<>'committed' AND committed_at IS NULL))
);
CREATE TABLE publication_files (
  publication_id uuid NOT NULL REFERENCES publications(id),
  file_id uuid NOT NULL,
  role text NOT NULL CHECK (role IN ('editable','preview','pdf')),
  original_name text NOT NULL,
  media_type text NOT NULL,
  bytes bigint NOT NULL CHECK (bytes BETWEEN 0 AND 100000000),
  sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  private_key text NOT NULL UNIQUE,
  export_profile_id text,
  preparation_id uuid,
  preparation_hash text,
  upload_state text NOT NULL DEFAULT 'pending' CHECK (upload_state IN ('pending','received')),
  received_at timestamptz,
  PRIMARY KEY(publication_id,file_id),
  CHECK ((upload_state='pending' AND received_at IS NULL) OR (upload_state='received' AND received_at IS NOT NULL)),
  CHECK ((role='editable' AND export_profile_id IS NULL AND preparation_id IS NULL AND preparation_hash IS NULL)
    OR (role='preview' AND export_profile_id IS NOT NULL AND preparation_id IS NULL AND preparation_hash IS NULL)
    OR (role='pdf' AND export_profile_id IS NOT NULL AND preparation_id IS NOT NULL AND preparation_hash IS NOT NULL AND preparation_hash ~ '^[a-f0-9]{64}$'))
);
CREATE UNIQUE INDEX publication_single_editable ON publication_files(publication_id) WHERE role='editable';
CREATE UNIQUE INDEX publication_single_preview ON publication_files(publication_id) WHERE role='preview';
CREATE TABLE versions (
  id uuid PRIMARY KEY,
  pattern_id uuid NOT NULL REFERENCES patterns(id),
  ordinal bigint NOT NULL CHECK (ordinal>0),
  author_id uuid NOT NULL,
  document_id uuid NOT NULL,
  local_revision_id text NOT NULL CHECK (local_revision_id ~ '^[a-f0-9]{64}$'),
  publication_id uuid NOT NULL UNIQUE REFERENCES publications(id),
  commit_operation_id uuid NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(pattern_id,ordinal),
  UNIQUE(pattern_id,id),
  UNIQUE(id,document_id,local_revision_id)
);
ALTER TABLE patterns ADD CONSTRAINT pattern_latest_version FOREIGN KEY(id,latest_version_id)
  REFERENCES versions(pattern_id,id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE publications ADD CONSTRAINT publication_expected_version FOREIGN KEY(pattern_id,expected_version_id)
  REFERENCES versions(pattern_id,id) DEFERRABLE INITIALLY DEFERRED;
CREATE TABLE stored_files (
  id uuid PRIMARY KEY,
  version_id uuid NOT NULL,
  role text NOT NULL CHECK (role IN ('editable','preview','pdf')),
  original_name text NOT NULL,
  media_type text NOT NULL,
  bytes bigint NOT NULL CHECK (bytes BETWEEN 0 AND 100000000),
  sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  private_key text NOT NULL UNIQUE,
  document_id uuid NOT NULL,
  local_revision_id text NOT NULL,
  export_profile_id text,
  preparation_id uuid,
  preparation_hash text,
  FOREIGN KEY(version_id,document_id,local_revision_id) REFERENCES versions(id,document_id,local_revision_id),
  CHECK ((role='editable' AND export_profile_id IS NULL AND preparation_id IS NULL AND preparation_hash IS NULL)
    OR (role='preview' AND export_profile_id IS NOT NULL AND preparation_id IS NULL AND preparation_hash IS NULL)
    OR (role='pdf' AND export_profile_id IS NOT NULL AND preparation_id IS NOT NULL AND preparation_hash IS NOT NULL AND preparation_hash ~ '^[a-f0-9]{64}$'))
);
CREATE UNIQUE INDEX version_single_editable ON stored_files(version_id) WHERE role='editable';
CREATE UNIQUE INDEX version_single_preview ON stored_files(version_id) WHERE role='preview';
CREATE FUNCTION reject_immutable_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Immutable published content'; END $$;
CREATE TRIGGER versions_immutable BEFORE UPDATE ON versions FOR EACH ROW EXECUTE FUNCTION reject_immutable_update();
CREATE TRIGGER stored_files_immutable BEFORE UPDATE ON stored_files FOR EACH ROW EXECUTE FUNCTION reject_immutable_update();
CREATE FUNCTION protect_publication_input() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW.owner_id,NEW.project_id,NEW.pattern_id,NEW.pattern_name,NEW.expected_version_id,NEW.document_id,NEW.local_revision_id,NEW.manifest,NEW.manifest_hash)
    IS DISTINCT FROM ROW(OLD.owner_id,OLD.project_id,OLD.pattern_id,OLD.pattern_name,OLD.expected_version_id,OLD.document_id,OLD.local_revision_id,OLD.manifest,OLD.manifest_hash)
    OR (OLD.commit_operation_id IS NOT NULL AND NEW.commit_operation_id IS DISTINCT FROM OLD.commit_operation_id)
    OR (OLD.commit_session_id IS NOT NULL AND NEW.commit_session_id IS DISTINCT FROM OLD.commit_session_id)
    OR (OLD.state='committed' AND NEW IS DISTINCT FROM OLD) THEN
    RAISE EXCEPTION 'Immutable publication input';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER publication_input_immutable BEFORE UPDATE ON publications FOR EACH ROW EXECUTE FUNCTION protect_publication_input();
CREATE FUNCTION protect_publication_file() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW.publication_id,NEW.file_id,NEW.role,NEW.original_name,NEW.media_type,NEW.bytes,NEW.sha256,NEW.private_key,NEW.export_profile_id,NEW.preparation_id,NEW.preparation_hash)
    IS DISTINCT FROM ROW(OLD.publication_id,OLD.file_id,OLD.role,OLD.original_name,OLD.media_type,OLD.bytes,OLD.sha256,OLD.private_key,OLD.export_profile_id,OLD.preparation_id,OLD.preparation_hash)
    OR (OLD.upload_state='received' AND NEW IS DISTINCT FROM OLD) THEN RAISE EXCEPTION 'Immutable declared file'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER publication_file_immutable BEFORE UPDATE ON publication_files FOR EACH ROW EXECUTE FUNCTION protect_publication_file();
