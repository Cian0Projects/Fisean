#!/usr/bin/env bash
#
# Put the latest main live. Run as root on the server:
#
#   bash /srv/fisean/app/deploy/update.sh
#
# Backs the database up first, because a migration is the one step here that
# cannot be undone by pulling an older commit.

set -euo pipefail

APP_DIR=/srv/fisean/app

if [ "$(id -u)" -ne 0 ]; then
  echo "Run this as root." >&2
  exit 1
fi

/etc/cron.daily/fisean-backup
sudo -u fisean -H bash -c "cd '$APP_DIR' && git pull --ff-only && npm ci --no-audit --no-fund && npm run build && npm run db:migrate"
systemctl restart fisean
echo "Updated to $(sudo -u fisean git -C "$APP_DIR" log -1 --format='%h %s')"
