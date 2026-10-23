#!/bin/sh
#
# Installed as /etc/cron.daily/fisean-backup by setup.sh and refreshed by
# update.sh, so a server set up before this file existed picks it up on its
# next update. scripts/backup.ts takes the snapshot, keeps 30 days on this
# server, and sends a copy to the R2 bucket when footage is there, so the only
# copy of the database is never on this one disk.

set -e
sudo -u fisean -H bash -c "cd /srv/fisean/app && BACKUP_DIR=/srv/fisean/backups npm run --silent backup"
