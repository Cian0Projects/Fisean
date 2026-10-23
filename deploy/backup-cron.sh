#!/bin/sh
#
# Installed as /etc/cron.daily/fisean-backup by setup.sh and refreshed by
# update.sh, so a server set up before this file existed picks it up on its
# next update. scripts/backup.ts takes the snapshot, keeps 30 days on this
# server, and sends a copy to the R2 bucket when footage is there, so the only
# copy of the database is never on this one disk.

set -e
# No BACKUP_DIR here: the script's default (data/backups in the app folder)
# is also where npm run preflight looks, so the two cannot disagree.
sudo -u fisean -H bash -c "cd /srv/fisean/app && npm run --silent backup"
