#!/bin/sh
# Serve the production build on :3131 against the throwaway database that
# setup.mjs made, so the videos never touch data/fisean.db. Run from tutorials/.
W="$(pwd)/.work"
cd .. && DATABASE_PATH="$W/tutorial.db" MEDIA_DIR="$W/media" MAIL_OUTBOX="$W/outbox" \
  APP_URL="http://localhost:3131" npx next start -p 3131
