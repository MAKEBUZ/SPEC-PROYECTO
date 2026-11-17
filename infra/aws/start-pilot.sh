#!/bin/bash
set -euo pipefail
cd /opt/patronaje
test -s runtime.env && test -s postgres.env && test -f state/initialized
docker network inspect patronaje >/dev/null 2>&1 || docker network create patronaje >/dev/null
docker run -d --name patronaje-postgres --restart unless-stopped --network patronaje --network-alias postgres --env-file postgres.env --mount type=bind,source=/opt/patronaje/postgres,target=/var/lib/postgresql --mount type=bind,source=/opt/patronaje/db-init.sh,target=/docker-entrypoint-initdb.d/10-patronaje.sh,readonly --memory=2g --log-opt max-size=10m --log-opt max-file=2 postgres:18.7-bookworm >/dev/null
for attempt in $(seq 1 60); do
 if docker exec patronaje-postgres pg_isready -U patronaje -d patronaje >/dev/null; then break; fi
 sleep 2
done
docker exec patronaje-postgres pg_isready -U patronaje -d patronaje >/dev/null
docker run -d --name patronaje-api --restart unless-stopped --network patronaje --network-alias api --env-file runtime.env --mount type=bind,source=/opt/patronaje/state,target=/state --mount type=bind,source=/opt/patronaje/assets,target=/assets,readonly --mount type=bind,source=/opt/patronaje/password-index,target=/password-index,readonly --memory=3g --log-opt max-size=10m --log-opt max-file=2 patronaje-pilot:20261116 >/dev/null
for attempt in $(seq 1 90); do
 if docker logs patronaje-api 2>&1 | grep -q '^API_READY$'; then break; fi
 sleep 2
done
docker logs patronaje-api 2>&1 | grep -q '^API_READY$'
docker run -d --name patronaje-web --restart unless-stopped --network patronaje --network-alias web --entrypoint node --memory=1g --log-opt max-size=10m --log-opt max-file=2 patronaje-pilot:20261116 node_modules/next/dist/bin/next start apps/web --hostname 0.0.0.0 --port 3000 >/dev/null
docker run -d --name patronaje-https --restart unless-stopped --network patronaje -p 80:80 -p 443:443 --env PUBLIC_HOST=patronaje.77-113-63-190.sslip.io --mount type=bind,source=/opt/patronaje/Caddyfile,target=/etc/caddy/Caddyfile,readonly --mount type=bind,source=/opt/patronaje/caddy-data,target=/data --memory=256m --log-opt max-size=10m --log-opt max-file=2 caddy:2.10.2 >/dev/null
echo PILOT_STARTED
