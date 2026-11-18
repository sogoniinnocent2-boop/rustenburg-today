# Deployment

The app runs locally. It is not deployed, and no domain or host has been purchased.

## Host for this release

Use one virtual private server with a persistent disk, not a serverless platform. Vercel, Netlify and any host that runs more than one Node process would not keep this SQLite file consistent. The server runs `next start` as a single process. `DATA_DIR` points at a directory on that server's disk, which survives a process restart. HTTPS is terminated by Caddy or nginx with a certificate for the public domain. The cookie is marked Secure only when the request arrives over HTTPS.

A South African VPS is the better first machine if the people, orders and uploaded files should stay in South Africa. Afrihost, xneelo and similar local providers sell a single Ubuntu server with a disk that persists across reboots. A small Hetzner or DigitalOcean server is a workable alternative, with the database then stored in Europe or the United States. Do not buy the server or register the domain until the owner approves the provider and the name.

Off-site backups go to a second disk or a separate storage account, such as another provider's object storage. A second folder on the same VPS disk is not off-site. OneDrive sync of this project folder is the same disk as the application.

## Local

1. Node.js 20 or newer. This workspace used Node 24.
2. `npm install`
3. `npm run dev` or `npm run build && npm start`
4. Data directory defaults to `./data`. Override with `DATA_DIR`.
5. Set `SESSION_SECRET` to a long random string before any shared or production process.
6. Set `NEXT_PUBLIC_SITE_URL` to the public origin so origin checks and links match.
7. Leave `SEED_DEMO=false` on a public server if you do not want the labelled demonstration article and tone.

## Not ready for a public launch

- Keep this release on one Node process and SQLite. Do not move it to Postgres or apply `supabase/migrations`. A managed database and shared media store are a separate plan, and only if the host must run more than one application instance.
- Set `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` and `SMTP_FROM`, then send a real message. The send path is already in `src/server/mail.ts`. Until a message is delivered, verification links stay in the outbox and production must not reveal them.
- PayFast is the prepared South African provider. Set its merchant values and `PAYMENT_WEBHOOK_SECRET`, then pass a sandbox payment and a signed webhook. Keep `payment_mode` disabled until that test is signed off. Naming the provider does not turn payments on.
- Put the site behind HTTPS. The cookie is not marked Secure unless the request is HTTPS.
- Set `BACKUP_OFFSITE_DIR` to a different disk. `npm run backup` fails when that copy does not succeed.
- Add error monitoring and an uptime check. `/api/v1/health` only reports that the process answered.

## Environments

Use separate `DATA_DIR`, secrets and databases for development, staging and production. Do not copy `data/dev-secret.txt` or `data/bootstrap-admin.txt` between them.

Vercel can host the Next.js app, but the SQLite file and `data/uploads` are local disk. A serverless host will not keep them. The suitable host for this release is one Node process with a persistent `DATA_DIR`.

## Where data lives

- SQLite file: `$DATA_DIR/rustenburg.db`. The default is `./data/rustenburg.db`.
- Uploaded photographs and files: `$DATA_DIR/uploads`, served by the application.
- Sessions: the `rt_session` cookie is signed with `SESSION_SECRET`. The session row is in SQLite, so a restart keeps the session when the file and the secret both survive.
- Migrations run when the process opens the database. They are the `applyMigrations` steps in `src/server/db.ts`. Do not run a second schema by hand.
- Two processes on one SQLite file can lock or diverge. Do not start a second instance against the same file.

## Backup and restore

`npm run backup` checkpoints SQLite, copies `$DATA_DIR/rustenburg.db` and `$DATA_DIR/uploads` to a timestamped pair, checks the copy with `PRAGMA integrity_check`, then copies that pair to `BACKUP_OFFSITE_DIR`. The command exits with an error if the off-site directory is missing, is inside the data directory, is on the same disk, or fails its integrity check. A local copy left behind in that case is not a successful backup. Success and failure are appended to `$DATA_DIR/backup-log.jsonl`. A failure also writes `$DATA_DIR/backup-alert.txt`.

Local staging copies are kept for 7 days. Off-site copies are kept for 30 days. Older timestamped files in those two folders are removed. The live database is never deleted by this prune.

`npm run backup:check` reads the latest log line and the off-site file. It fails when the latest attempt failed, the file is missing, smaller than 4 KB, older than 26 hours, or fails the integrity check. Schedule it once a day on the host with the operating system's scheduler, after `BACKUP_OFFSITE_DIR` is a different disk. On this Windows machine the command is `powershell -File scripts/schedule-backup.ps1`. Until that disk exists, the scheduled run fails and leaves the alert file. That failure is the operator alert. Email is not sent, because SMTP is not configured.

Recovery on a disposable copy:

1. Stop the only application process.
2. Copy the off-site `.db` file to `$DATA_DIR/rustenburg.db`.
3. Replace `$DATA_DIR/uploads` with the matching `-uploads` directory.
4. Start the process with the same `SESSION_SECRET`.
5. Compare users, profiles, posts, books, listings, orders, sessions and upload files with the counts taken before the backup.

A restore of the only live database waits until a second off-site copy is confirmed. The measured time for the disposable drill is printed by `npx tsx scripts/restore-drill.ts`. That drill uses two temporary folders and does not restore `data/rustenburg.db`.

## Production data

Generated production data belongs in `DATA_DIR` only. `.next` and `.next-prod` are build output and can be deleted. Sessions remain valid across a restart when `rustenburg.db` and the same `SESSION_SECRET` both survive. Migrations run when the process opens the database.
