# Deploying Físeán

Nothing here is required to use the app. It runs on your own machine for free,
and the [README](../README.md) covers sharing it over the club WiFi or a
Tailscale network while it still does. This is the path for when that stops
being enough — when the panel needs it available whether or not your PC is on.

---

## Why a single VPS, and not a cloud platform

The deciding factor is egress. A 3 GB match watched by 40 players is 120 GB of
traffic per round.

| | Monthly | Notes |
|---|---|---|
| **Hetzner CX32 (recommended)** | **~€6.80** | 4 vCPU, 8 GB RAM, 80 GB NVMe, **20 TB traffic included**. Holds roughly 20 matches. EU-hosted, which matters if any of the panel are minors. |
| Hetzner CX32 + 1 TB Storage Box | ~€11 | Same box, with an archive for older matches. |
| Contabo VPS S | ~€5.40 | 200 GB NVMe — cheaper disk, worse network. |
| Vercel + Cloudflare R2 | $20–23 | Zero egress on R2, best deploy experience, but two accounts and serverless body limits to work around. |
| Bunny.net Stream | ~$3 | Cheapest headline, but it takes over the video pipeline and gives you HLS — which surrenders the seek accuracy the whole tool is built on. |

**Hetzner's 20 TB allowance closes the bandwidth question permanently.** Even
the worst case — all 40 players watching a full match, every match, every
week in season — lands under 500 GB a month, roughly 2% of the allowance.
Everyone can watch full matches by design; nothing about that was restricted
to make the hosting numbers work. And because storage sits behind an adapter,
moving to R2 later is a configuration change.

Storage is the thing to watch, not bandwidth: 80 GB is around 20 matches at
1080p. Add a Storage Box and archive the ones nobody watches any more.

---

## Steps

### 1. The box

Create a Hetzner CX32 running **Ubuntu 24.04**, in Nuremberg or Helsinki. Add
your SSH key during creation. Note the IP.

### 2. DNS

Point an A record — `fisean.yourclub.ie` — at that IP. Let it propagate before
step 5, because Caddy needs to answer a challenge on that name.

### 3. Server setup

```bash
ssh root@<ip>

apt update && apt upgrade -y
curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
apt install -y nodejs git caddy build-essential

adduser --system --group --home /srv/fisean fisean
```

`build-essential` is needed to compile `better-sqlite3`. There is no ffmpeg
here on purpose — the app does not transcode.

### 4. The app

```bash
sudo -u fisean -H bash
cd /srv/fisean
git clone <your repo> app && cd app

npm ci
npm run build

mkdir -p data/media
cat > .env.local <<EOF
SESSION_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
DATABASE_PATH=/srv/fisean/app/data/fisean.db
STORAGE_DRIVER=local
MEDIA_DIR=/srv/fisean/app/data/media
NODE_ENV=production
EOF
chmod 600 .env.local

npm run db:migrate
npm run create-admin      # note the join code it prints
exit
```

### 5. Caddy

```
# /etc/caddy/Caddyfile
fisean.yourclub.ie {
	reverse_proxy 127.0.0.1:3000
	encode zstd gzip

	# Match files are large. Don't let a slow phone on bad reception time out
	# mid-clip, and don't buffer gigabytes in the proxy.
	request_body {
		max_size 8GB
	}
}
```

```bash
systemctl reload caddy
```

HTTPS is issued automatically from Let's Encrypt. No certbot, no nginx config,
no renewal cron.

### 6. Run it as a service

```ini
# /etc/systemd/system/fisean.service
[Unit]
Description=Físeán
After=network.target

[Service]
Type=simple
User=fisean
Group=fisean
WorkingDirectory=/srv/fisean/app
ExecStart=/usr/bin/npm run start
Restart=always
RestartSec=5
Environment=NODE_ENV=production
Environment=PORT=3000

[Install]
WantedBy=multi-user.target
```

```bash
systemctl daemon-reload
systemctl enable --now fisean
systemctl status fisean
```

### 7. Give the panel the link

Send them `https://fisean.yourclub.ie/join` and the join code. They enter the
code, their name and a password, and they are in. Nothing to approve.

---

## Getting footage onto the server

The ingest script is the right tool — it avoids pushing gigabytes through a
browser:

```bash
# From your machine
scp "match.mp4" fisean@<ip>:/srv/fisean/app/data/media/

# On the server
sudo -u fisean -H bash -c 'cd /srv/fisean/app && npm run ingest -- data/media/match.mp4 --match <match id>'
```

Ingest notices when a file is already inside the media directory and registers
it in place rather than copying it again.

---

## Backups

A single-file database makes this trivial. Both matter — the database holds
every clip, tag and comment, which is the actual work product.

```bash
# /etc/cron.daily/fisean-backup
#!/bin/sh
set -e
D=/srv/fisean/backups
mkdir -p "$D"
# .backup is safe against a live database, unlike copying the file.
sqlite3 /srv/fisean/app/data/fisean.db ".backup '$D/fisean-$(date +%F).db'"
find "$D" -name 'fisean-*.db' -mtime +30 -delete
```

```bash
chmod +x /etc/cron.daily/fisean-backup
apt install -y sqlite3
```

Then get it off the box — to a Hetzner Storage Box, or pull it to your own
machine:

```bash
rsync -az fisean@<ip>:/srv/fisean/backups/ ./backups/
rsync -az fisean@<ip>:/srv/fisean/app/data/media/ ./media/
```

---

## Updating

```bash
sudo -u fisean -H bash -c 'cd /srv/fisean/app && git pull && npm ci && npm run build && npm run db:migrate'
systemctl restart fisean
```

Run `npm run db:migrate`, not `db:push` — push infers a diff and can drop data.

---

## Moving to object storage later

`src/lib/storage/` defines a four-method interface with a local-disk
implementation. Adding an S3/R2 one means writing `s3.ts` against the same
interface and switching `STORAGE_DRIVER`. Nothing that calls it changes.

Worth doing if footage outgrows the box's disk. Use `aws4fetch` (~65 KB)
rather than `@aws-sdk/client-s3` (~3.3 MB) — presigning is the only thing
needed.
