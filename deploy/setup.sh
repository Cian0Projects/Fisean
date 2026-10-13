#!/usr/bin/env bash
#
# Set up Ardawn on a fresh Ubuntu 24.04 server. Run once, as root:
#
#   curl -fsSLO https://raw.githubusercontent.com/Cian0Projects/Fisean/main/deploy/setup.sh
#   bash setup.sh
#
# It asks for the domain, an optional sign-up code and the R2 details, then
# does every step in docs/DEPLOYMENT.md: Node, Caddy, the app user, the build,
# the database, HTTPS, the service, the firewall and the nightly backup.
#
# Safe to run again. An existing .env.local is kept, because it holds the
# session secret — replacing that would sign every coach and player out.

set -euo pipefail

REPO="${REPO:-https://github.com/Cian0Projects/Fisean.git}"
BRANCH="${BRANCH:-main}"
HOME_DIR=/srv/fisean
APP_DIR="$HOME_DIR/app"
ENV_FILE="$APP_DIR/.env.local"

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }

if [ "$(id -u)" -ne 0 ]; then
  echo "Run this as root (ssh root@<server ip>, then bash setup.sh)." >&2
  exit 1
fi

# Prompts read from the terminal, not stdin, so the questions still work when
# the script itself arrives on stdin. A value already in the environment is
# used without asking, which lets the whole thing run unattended.
ask() {
  local var=$1 prompt=$2 default=${3:-} reply
  if [ -n "${!var:-}" ]; then return; fi
  read -r -p "$prompt${default:+ [$default]}: " reply </dev/tty
  printf -v "$var" '%s' "${reply:-$default}"
}

ask_secret() {
  local var=$1 prompt=$2 reply
  if [ -n "${!var:-}" ]; then return; fi
  read -r -s -p "$prompt: " reply </dev/tty
  echo
  printf -v "$var" '%s' "$reply"
}

say "Ardawn setup"

ask DOMAIN "Domain the site will answer on" "ardawnsport.ie"

if [ -f "$ENV_FILE" ]; then
  echo "Keeping the existing $ENV_FILE (and its session secret)."
else
  ask SIGNUP_CODE "Code a club must enter at /start (leave blank to let anyone sign up)"
  echo
  echo "Footage: with an R2 bucket it lives at Cloudflare and costs nothing to"
  echo "watch. Without one it stays on this server's disk, which suits a pilot."
  ask R2_ACCOUNT_ID "R2 account ID (leave blank to keep footage on this server)"
  if [ -n "$R2_ACCOUNT_ID" ]; then
    ask R2_ACCESS_KEY_ID "R2 access key ID"
    ask_secret R2_SECRET_ACCESS_KEY "R2 secret access key (hidden)"
    ask R2_BUCKET "R2 bucket name" "ardawn-footage"
    ask R2_JURISDICTION "R2 jurisdiction (eu, or blank for none)" "eu"
  fi
fi

export DEBIAN_FRONTEND=noninteractive

say "Updating the system and installing Node 24, Caddy and build tools"
apt-get update -q
apt-get upgrade -y -q -o Dpkg::Options::=--force-confold
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 24 ]; then
  curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
fi
# build-essential compiles better-sqlite3. No ffmpeg, on purpose: the app
# never transcodes.
apt-get install -y -q nodejs git caddy build-essential sqlite3 ufw

# A 4 GB server builds Next comfortably, but a little swap stops a build that
# coincides with a busy evening from being killed outright.
if ! swapon --show | grep -q .; then
  say "Adding 2 GB of swap"
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

say "Creating the app user and fetching the code"
if ! id fisean >/dev/null 2>&1; then
  adduser --system --group --home "$HOME_DIR" fisean
fi
if [ -d "$APP_DIR/.git" ]; then
  sudo -u fisean -H git -C "$APP_DIR" pull --ff-only
else
  sudo -u fisean -H git clone --branch "$BRANCH" "$REPO" "$APP_DIR"
fi

if [ ! -f "$ENV_FILE" ]; then
  say "Writing $ENV_FILE"
  SESSION_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
  {
    echo "SESSION_SECRET=$SESSION_SECRET"
    echo "DATABASE_PATH=$APP_DIR/data/fisean.db"
    if [ -n "${R2_ACCOUNT_ID:-}" ]; then
      echo "STORAGE_DRIVER=r2"
      echo "R2_ACCOUNT_ID=$R2_ACCOUNT_ID"
      echo "R2_ACCESS_KEY_ID=$R2_ACCESS_KEY_ID"
      echo "R2_SECRET_ACCESS_KEY=$R2_SECRET_ACCESS_KEY"
      echo "R2_BUCKET=$R2_BUCKET"
      if [ -n "${R2_JURISDICTION:-}" ]; then echo "R2_JURISDICTION=$R2_JURISDICTION"; fi
    else
      echo "STORAGE_DRIVER=local"
      echo "MEDIA_DIR=$APP_DIR/data/media"
    fi
    echo "TEAM_STORAGE_GB=100"
    if [ -n "${SIGNUP_CODE:-}" ]; then echo "SIGNUP_CODE=$SIGNUP_CODE"; fi
  } > "$ENV_FILE"
  chown fisean:fisean "$ENV_FILE"
  chmod 600 "$ENV_FILE"
fi

say "Installing dependencies, building and migrating the database (a few minutes)"
sudo -u fisean -H bash -c "cd '$APP_DIR' && mkdir -p data && npm ci --no-audit --no-fund && npm run build && npm run db:migrate"

say "Running the app as a service"
cat > /etc/systemd/system/fisean.service <<EOF
[Unit]
Description=Ardawn
After=network.target

[Service]
Type=simple
User=fisean
Group=fisean
WorkingDirectory=$APP_DIR
# Bound to localhost: only Caddy talks to the app, so port 3000 is never
# reachable from outside even if the firewall were off.
ExecStart=/usr/bin/npm run start -- -H 127.0.0.1 -p 3000
Restart=always
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable fisean >/dev/null
systemctl restart fisean

say "Configuring HTTPS for $DOMAIN and www.$DOMAIN"
cat > /etc/caddy/Caddyfile <<EOF
$DOMAIN {
	reverse_proxy 127.0.0.1:3000
	encode zstd gzip

	# Upload parts are at most about 11 MB, and on R2 they never come here at
	# all. Anything bigger than this is not from the app.
	request_body {
		max_size 32MB
	}
}

www.$DOMAIN {
	redir https://$DOMAIN{uri} permanent
}
EOF
systemctl reload caddy

say "Firewall: SSH, HTTP and HTTPS only"
ufw allow OpenSSH >/dev/null
ufw allow 80/tcp >/dev/null
ufw allow 443 >/dev/null
ufw --force enable >/dev/null

say "Nightly database backup, kept for 30 days"
cat > /etc/cron.daily/fisean-backup <<EOF
#!/bin/sh
set -e
D=$HOME_DIR/backups
mkdir -p "\$D"
# .backup is safe against a live database, unlike copying the file.
sqlite3 $APP_DIR/data/fisean.db ".backup '\$D/fisean-\$(date +%F).db'"
find "\$D" -name 'fisean-*.db' -mtime +30 -delete
EOF
chmod +x /etc/cron.daily/fisean-backup

say "Checking the app answers"
for _ in $(seq 1 30); do
  if curl -fs -o /dev/null http://127.0.0.1:3000/; then
    APP_UP=1
    break
  fi
  sleep 2
done

if [ -n "${APP_UP:-}" ]; then
  say "Done. Ardawn is running."
  echo "Open https://$DOMAIN — the certificate is issued on the first visit once"
  echo "DNS points here, which can take a minute."
  echo "Set up your own club at https://$DOMAIN/start"
  echo "To update later: bash $APP_DIR/deploy/update.sh"
else
  say "The app did not answer on port 3000. Its log:"
  journalctl -u fisean -n 40 --no-pager
  exit 1
fi
