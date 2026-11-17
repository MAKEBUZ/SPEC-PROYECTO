#!/bin/bash
set -euo pipefail
# Run through SSM; only stop EC2 after this command succeeds.
cd /opt/patronaje
test "$(docker inspect -f '{{.State.Running}}' patronaje-api)" = true
started=$(date +%s)
docker update --restart=no patronaje-api >/dev/null
trap 'docker update --restart=unless-stopped patronaje-api >/dev/null' EXIT
docker kill --signal=USR2 patronaje-api >/dev/null
for attempt in $(seq 1 180); do
 if test "$(docker inspect -f '{{.State.Running}}' patronaje-api)" = false; then break; fi
 sleep 2
done
test "$(docker inspect -f '{{.State.Running}}' patronaje-api)" = false
test "$(docker inspect -f '{{.State.ExitCode}}' patronaje-api)" = 0
test -f state/shutdown-ready.json
test "$(stat -c %Y state/shutdown-ready.json)" -ge "$started"
docker stop patronaje-https patronaje-web patronaje-postgres >/dev/null
echo BACKUP_VERIFIED_HOST_STOP_ALLOWED
