# Deploying Ardawn

This is the host's job, done once, for every club. Clubs never see any of it:
a club secretary opens `/start`, creates the club, drops a match file onto the
squad page, and sends the panel a join code. Each club sees only its own
matches, footage and people — every row carries its team, and footage is only
ever handed out on a signed link to someone from the club that owns it.

---

## The shape: a small server, and footage in R2

Two pieces. The app — Next.js and a SQLite file — runs on one small server.
The footage lives in a Cloudflare R2 bucket. The browser uploads straight to
the bucket and plays straight from it, so the server never carries the
gigabytes, and its disk only has to hold the database.

The deciding factor is egress. A 3 GB match watched by 40 players is 120 GB of
traffic a round, and R2 charges nothing for it. Everyone can watch full
matches by design; nothing about that was restricted to make the hosting
numbers work.

| | Monthly | Notes |
|---|---|---|
| **4 GB VPS (app)**, e.g. OVHcloud VPS-1 | **~€4** | 2 vCPU, 4 GB RAM. Holds the database for any number of clubs. EU-hosted, which matters when any of a panel are minors. |
| **Cloudflare R2 (footage)** | **$0.015 per GB stored** | Egress free. The first 10 GB are free. Ten clubs with thirty 3 GB matches each is 900 GB, about $13.50. |
| Hetzner CX32, footage on its own disk | ~€6.80 | No R2 at all: 80 GB is about 20 matches across every club. Fine for one or two clubs while you find out whether anyone wants this. |

Each club is capped by `TEAM_STORAGE_GB` (100 GB by default), so one club's
season cannot run up the bill for the rest.

---

## Before any of this: try it on your own machine

You do not need a server or a Cloudflare account to see exactly what a club
will see. With `STORAGE_DRIVER=local` (the default) the app runs its own
stand-in for R2: it hands the browser signed upload links, takes the parts at
them, stitches the file together, and plays it back from signed links — the
same steps, in the same order, with the same screens, as the hosted app. The
only difference is that the bytes land in `data/media/` instead of a bucket.

```bash
npm run db:migrate
npm run dev
```

Open `http://localhost:3000/start`, set up a club, and drag a match file onto
the squad page; give the match a title and it goes up. To feel a dropped connection, start an upload, close
the tab part-way, open the page again and drop the same file: it carries on
from where it stopped.

When a server and a bucket exist, the switch is the four `R2_` settings and
`STORAGE_DRIVER=r2` in step 4. No code changes.

---

## The short way

Steps 3 to 6 below, plus the firewall and the backup, are one script. On a
fresh Ubuntu 24.04 server, as root:

```bash
curl -fsSLO https://raw.githubusercontent.com/Cian0Projects/Fisean/main/deploy/setup.sh
bash setup.sh
```

It asks for the domain and the R2 details (leave
those blank to keep footage on the server's disk), then builds and starts
everything. It deploys what is on `main` on GitHub, so push first. Later
releases are `bash /srv/fisean/app/deploy/update.sh`.

The steps are kept in full below so that what the script does is never a
mystery, and so that any one of them can be redone by hand.

---

## Steps

### 1. The bucket

In the Cloudflare dashboard, under **R2 Object Storage**:

1. **Create bucket.** Name it, say, `ardawn-footage`. Under location, choose
   the **EU jurisdiction** — the footage is of players, some of them minors.
2. **CORS policy** (the bucket's Settings tab). Without this the browser
   refuses to send the upload parts:

   ```json
   [
     {
       "AllowedOrigins": ["https://ardawnsport.ie"],
       "AllowedMethods": ["PUT", "GET", "HEAD"],
       "AllowedHeaders": ["content-type", "range"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```

3. **Object lifecycle rules.** Keep (or add) the rule that aborts incomplete
   multipart uploads after 7 days. An upload abandoned part-way is otherwise
   paid-for storage nobody can see. Ardawn notices when R2 has cleared one and
   starts that file afresh the next time it is dropped.

   Add a second rule for the nightly database copies: prefix `backups/`,
   delete objects after 90 days. Each copy is a few megabytes, so 90 days
   costs nothing and covers a mistake nobody noticed for a month.
4. **API token** (R2 overview → Manage R2 API Tokens → Create). Permission
   **Object Read & Write**, applied to this bucket only. Note the **Access Key
   ID**, the **Secret Access Key**, and your **account ID** from the endpoint
   URL (`https://<account id>.r2.cloudflarestorage.com`).

Leave the bucket private. Nothing in it is public; every link the app hands out
is signed and expires.

### 2. The box

Any VPS with 2 vCPU, 4 GB RAM and **Ubuntu 24.04** in an EU data centre will
do. Add your SSH key during creation and note the IP.

Through 2026 a memory shortage has left cheap EU servers scarce: Hetzner has
refused most new cloud servers since June, and OVHcloud's VPS-1 (about €3.81)
sold out in every EU data centre by October. The fallbacks are **Contabo
Cloud VPS 10** in Germany (8 GB, about €4.40 a month) and IONOS's VPS line. Where an image signs you in as an ordinary user rather than `root` (OVH's
`ubuntu`, for one), run the setup script with `sudo`.

### 3. DNS and server setup

In Cloudflare's DNS for `ardawnsport.ie`, add an **A** record for `@` pointing
at that IP, and a **CNAME** for `www` pointing at `ardawnsport.ie`. Set both to
**DNS only** (the grey cloud), not proxied: Caddy fetches its own certificate
by answering a challenge on that name, and a proxy in front would answer
instead. Let them propagate before step 5.

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

cat > .env.local <<EOF
SESSION_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
DATABASE_PATH=/srv/fisean/app/data/fisean.db
STORAGE_DRIVER=r2
R2_ACCOUNT_ID=<account id>
R2_ACCESS_KEY_ID=<access key id>
R2_SECRET_ACCESS_KEY=<secret access key>
R2_BUCKET=ardawn-footage
# The EU bucket from step 1 answers only on its own hostname.
R2_JURISDICTION=eu
TEAM_STORAGE_GB=100
# Optional: where new clubs waiting to be checked are emailed. Default hello@ardawnsport.ie.
# HOST_EMAIL=hello@ardawnsport.ie
NODE_ENV=production
EOF
chmod 600 .env.local

npm run db:migrate
exit
```

Without R2 (the CX32 row above), use `STORAGE_DRIVER=local` and
`MEDIA_DIR=/srv/fisean/app/data/media` instead of the four `R2_` lines.

### 5. Caddy

```
# /etc/caddy/Caddyfile
ardawnsport.ie {
	reverse_proxy 127.0.0.1:3000
	encode zstd gzip

	# Upload parts are at most about 11 MB, and on R2 they never come here at
	# all. Anything bigger than this is not from the app.
	request_body {
		max_size 32MB
	}
}

www.ardawnsport.ie {
	redir https://ardawnsport.ie{uri} permanent
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
Description=Ardawn
After=network.target

[Service]
Type=simple
User=fisean
Group=fisean
WorkingDirectory=/srv/fisean/app
# Bound to localhost: only Caddy talks to the app.
ExecStart=/usr/bin/npm run start -- -H 127.0.0.1 -p 3000
Restart=always
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

```bash
systemctl daemon-reload
systemctl enable --now fisean
systemctl status fisean
```

### 7. Hand it to the clubs

Send a club `https://ardawnsport.ie/start`. Anyone can fill it in, with no
code to ask for. Whoever does becomes that club's admin, but the club waits
until you have checked it: you are emailed (at `HOST_EMAIL`) who it is and any
club already here with a similar name, with a link to approve or decline it.
Until you approve, its admin sees a waiting page and its join code lets
nobody in. Approving emails them that it is ready; declining deletes the club
and their account and emails them to get in touch. If the email goes astray,
`npm run pending-clubs` lists every waiting club with its link. Players go to `/join`, enter the code, their name and a password, and
they are in. Nothing to approve.

Usernames are unique across the whole instance, not per club, because signing
in asks for nothing else.

### 8. Before the first club

Run this on the server once everything above is done, and again after any
change to the `.env`:

```bash
sudo -u fisean -H bash -c 'cd /srv/fisean/app && npm run preflight'
```

It checks what would hurt a club and that nothing else would tell you about:
footage going to R2 and not this server's disk, the bucket in the EU
jurisdiction, a real test upload with the token, the CORS rule (the bucket
letting the site's address upload), sign-in emails really sending, the
per-club storage cap, and a recent database backup both
here and in the bucket. It cancels its test upload, so nothing is left
behind. Fix every `FAIL` before sending a club the link.

Then point an uptime monitor (UptimeRobot's free plan is enough) at
`https://ardawnsport.ie/api/health` every five minutes, emailing you. It
answers `ok` only when the database does, so you hear the site is down before
a manager tells you.

**During the founding period**, while places are limited and free, set these
in `.env` and restart:

```bash
TEAM_STORAGE_GB=50     # about 15 matches at 3 GB; raise it for a club that asks
```

---

## How footage gets in

Clubs upload in the browser: drag the file onto the squad page, or press
Upload video on a match. It goes up as an S3 multipart upload — 8 MB parts,
three at a time, each PUT straight to the bucket on its own signed link. A
dropped connection is retried, and an upload that dies altogether resumes when
the same file is dropped again, sending only the parts the bucket does not
already hold.

When a file is already on the server — a club posted you a USB stick — the
ingest script sends it to the bucket (or registers it on local disk) without a
browser. `--match` decides which club it belongs to:

```bash
scp "match.mp4" fisean@<ip>:/srv/fisean/
sudo -u fisean -H bash -c 'cd /srv/fisean/app && npm run ingest -- /srv/fisean/match.mp4 --match <match id>'
```

---

## Backups

The database holds every club, clip, tag and comment, which is the actual
work product. The footage in R2 is stored redundantly by Cloudflare and would
survive this server dying. The database would not, unless a copy lives
somewhere else.

`npm run backup` (`scripts/backup.ts`) takes a snapshot with SQLite's own
backup API, which is safe against the live database, keeps 30 days of them in
`/srv/fisean/app/data/backups`, and sends the same snapshot to the bucket as
`backups/fisean-<date>.db`. The bucket's lifecycle rule (step 1) keeps those
for 90 days.

It runs nightly from `/etc/cron.daily/fisean-backup`, which is
`deploy/backup-cron.sh` installed by `setup.sh` and refreshed by every
`update.sh`, and before every update. A server set up before the script
existed picks it up on its next `update.sh`. Run it once by hand to see it
work:

```bash
bash /etc/cron.daily/fisean-backup
```

On the local driver there is no bucket to send it to, so pull the backups to
your own machine as well:

```bash
rsync -az fisean@<ip>:/srv/fisean/app/data/backups/ ./backups/
```

**To restore**, stop the app, put the copy in place of the live file, and
start it again:

```bash
systemctl stop fisean
cp /srv/fisean/app/data/backups/fisean-<date>.db /srv/fisean/app/data/fisean.db
rm -f /srv/fisean/app/data/fisean.db-wal /srv/fisean/app/data/fisean.db-shm
chown fisean:fisean /srv/fisean/app/data/fisean.db
systemctl start fisean
```

---

## Closing a club

Clubs cannot delete themselves from the app. The squad page tells an admin to
email hello@ardawnsport.ie from the address they sign in with, and the data
agreement promises it is done within seven days of the club confirming.

When a request comes in, first look at what would go. This deletes nothing:

```bash
sudo -u fisean -H bash -c 'cd /srv/fisean/app && npm run close-club -- --email secretary@club.ie'
```

It finds the club by that address and refuses unless the address belongs to
an admin, so check it is the address the email came from. It prints the club
name and code, how many people, matches and files of footage it holds, and its
admins. Reply to the club with that and ask them to confirm. Once they have,
run the same command with `--yes` on the end:

```bash
sudo -u fisean -H bash -c 'cd /srv/fisean/app && npm run close-club -- --email secretary@club.ie --yes'
```

That deletes the club and everything in it, footage in storage included, and
signs every member out. Backups still hold a copy until they age out (30 days
on the server, 90 in the bucket), so a mistake can be undone from a backup
within that window. Email the club to say it is done.

---

## Updating

`bash /srv/fisean/app/deploy/update.sh` as root, which takes a backup first and
then does this:

```bash
sudo -u fisean -H bash -c 'cd /srv/fisean/app && git pull && npm ci && npm run build && npm run db:migrate'
systemctl restart fisean
```

Run `npm run db:migrate`, not `db:push` — push infers a diff and can drop data.

---

## How storage is put together

`src/lib/storage/` has one interface, shaped like S3's, and two drivers:
`r2.ts` for the bucket and `local.ts` for the stand-in. Every call to R2 is a
fetch of a presigned URL, signed by `sigv4.ts` — sixty lines over
`node:crypto`, checked against AWS's own worked example in the tests — so
there is no SDK. Playback links are signed against a six-hour window, so a page
that re-renders (a coach saving a tag) produces the identical link and the
video does not reload.

Not yet tried against a live bucket: the signing matches AWS's reference, and
the whole upload has been run end to end through the local stand-in, but the
first real R2 upload is the test of the CORS rule and the token.
