#!/bin/bash
set -euo pipefail
psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --set ON_ERROR_STOP=1 --set app_password="$PATRON_DB_PASSWORD" <<'SQL'
CREATE ROLE patronaje LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD :'app_password';
ALTER DATABASE patronaje OWNER TO patronaje;
SQL
