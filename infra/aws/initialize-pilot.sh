#!/bin/bash
set -euo pipefail
umask 077
cd /opt/patronaje
# Explicit first-install gate. Never regenerate secrets during an update.
test ! -e runtime.env && test ! -e postgres.env && test ! -e state/initialized
install -d -m 0700 state state/backups postgres caddy-data
# PGDATA is the protected 18/docker child; its postgres user must traverse the
# bind mount parent after the official entrypoint drops root privileges.
chmod 0755 postgres
admin_password=$(openssl rand -hex 32)
app_password=$(openssl rand -hex 32)
operation_key=$(openssl rand -hex 32)
outbox_key=$(openssl rand -hex 32)
cat >postgres.env <<EOF
POSTGRES_USER=patron_admin
POSTGRES_PASSWORD=$admin_password
POSTGRES_DB=patronaje
PATRON_DB_PASSWORD=$app_password
EOF
cat >runtime.env <<EOF
APP_ENV=production
NODE_ENV=production
AWS_REGION=us-east-2
AWS_ACCOUNT_ID=847205414980
PUBLIC_ORIGIN=https://patronaje.77-113-63-190.sslip.io
DATABASE_URL=postgresql://patronaje:$app_password@postgres:5432/patronaje
BACKUP_DATABASE_URL=postgresql://patron_admin:$admin_password@postgres:5432/patronaje
BLOB_BUCKET=patronaje-test-847205414980-files
BACKUP_BUCKET=patronaje-test-847205414980-backups
MAIL_SENDER=patronaje277353@gmail.com
OPERATION_HMAC_KEY=$operation_key
OUTBOX_KEY=$outbox_key
KEY_VERSION=pilot-v1
STATE_DIRECTORY=/state
PASSWORD_INDEX_ROOT=/password-index
ASSETS_DIRECTORY=/assets
PORT=3001
EOF
printf '%s\n' 'First install 2026-11-16; do not recreate on restore.' >state/initialized
chown -R 1000:1000 state
chmod -R a+rX assets password-index
echo PILOT_SECRETS_CREATED
