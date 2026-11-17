#!/bin/bash
set -euo pipefail
docker start patronaje-postgres >/dev/null
for attempt in $(seq 1 60); do
 if docker exec patronaje-postgres pg_isready -U patronaje -d patronaje >/dev/null; then break; fi
 sleep 2
done
docker exec patronaje-postgres pg_isready -U patronaje -d patronaje >/dev/null
docker update --restart=unless-stopped patronaje-api >/dev/null
started=$(date -u +%Y-%m-%dT%H:%M:%SZ)
docker start patronaje-api >/dev/null
for attempt in $(seq 1 90); do
 if docker logs --since "$started" patronaje-api 2>&1 | grep -q '^API_READY$'; then break; fi
 sleep 2
done
docker logs --since "$started" patronaje-api 2>&1 | grep -q '^API_READY$'
docker start patronaje-web patronaje-https >/dev/null
echo PILOT_RESUMED
