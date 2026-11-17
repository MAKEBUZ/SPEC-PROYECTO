CREATE TABLE projects (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES accounts(id),
  name text NOT NULL CHECK (length(btrim(name))>0),
  state text NOT NULL DEFAULT 'active' CHECK (state IN ('active','trashed')),
  resource_revision bigint NOT NULL DEFAULT 1 CHECK (resource_revision>0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  trashed_at timestamptz,
  expires_at timestamptz,
  UNIQUE(id,owner_id),
  CHECK ((state='active' AND trashed_at IS NULL AND expires_at IS NULL) OR
    (state='trashed' AND trashed_at IS NOT NULL AND expires_at=trashed_at+interval '30 days'))
);
CREATE INDEX projects_owner_page ON projects(owner_id,created_at DESC,id DESC) WHERE state='active';
CREATE TABLE patterns (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL,
  owner_id uuid NOT NULL,
  name text NOT NULL CHECK (length(btrim(name))>0),
  state text NOT NULL DEFAULT 'active' CHECK (state IN ('active','trashed')),
  latest_version_id uuid,
  resource_revision bigint NOT NULL DEFAULT 1 CHECK (resource_revision>0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  trashed_at timestamptz,
  expires_at timestamptz,
  UNIQUE(id,owner_id),
  FOREIGN KEY(project_id,owner_id) REFERENCES projects(id,owner_id),
  CHECK ((state='active' AND trashed_at IS NULL AND expires_at IS NULL) OR
    (state='trashed' AND trashed_at IS NOT NULL AND expires_at=trashed_at+interval '30 days'))
);
CREATE INDEX patterns_project_page ON patterns(project_id,created_at DESC,id DESC) WHERE state='active';
-- The composite latest-version FK is added after Version exists in migration 005.
