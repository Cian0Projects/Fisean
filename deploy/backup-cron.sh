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

# Then remove what admins deleted more than twenty days ago
# (scripts/purge-deleted.ts). After the backup, so tonight's copy still has
# the rows; like the sweep, a failure is reported and does not stop a deploy.
sudo -u fisean -H bash -c "cd /srv/fisean/app && npm run --silent purge-deleted" \
  || echo "fisean-backup: purging deleted footage failed, see the output above" >&2

# Then sweep the bucket for files no video uses (scripts/reconcile-storage.ts).
# After the backup, so a bad sweep still leaves tonight's copy. update.sh runs
# this file too, before it pulls and builds, so a failed sweep must not stop a
# deploy: it is reported on stderr (cron mails it) and the script carries on.
sudo -u fisean -H bash -c "cd /srv/fisean/app && npm run --silent reconcile" \
  || echo "fisean-backup: storage reconcile failed, see the output above" >&2
