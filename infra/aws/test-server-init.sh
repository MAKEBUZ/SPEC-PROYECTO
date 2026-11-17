#!/bin/bash
set -euo pipefail
# Foundation only: no application, credentials or public listener in user data.
dnf install -y docker
systemctl enable --now amazon-ssm-agent
systemctl enable --now docker
install -d -m 0750 /opt/patronaje
printf '%s\n' 'Foundation prepared; application not deployed.' > /opt/patronaje/FOUNDATION
