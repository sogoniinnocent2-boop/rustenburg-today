# Rustenburg Today — Railway production deployment report

**Date:** 26 November 2026  
**Public URL:** https://www.rustenburgtoday.co.za  
**Railway project:** `rustenburg-today` (`0ef0c480-c15e-41f3-8bc7-c9c0222070d8`)

---

## Railway infrastructure

| Item | Status | Detail |
| --- | --- | --- |
| Service | **PASS** | Single Node Next.js service `rustenburg-today` |
| Architecture | **PASS** | Monolith (frontend + API + worker in one process). Not split. |
| Region | **PASS** | `iad` |
| Persistent volume | **PASS** | `rustenburg-today-volume` mounted at `/data` |
| Database | **PASS** | SQLite at `/data/rustenburg.db` (Option A — retained) |
| Media uploads | **PASS** | `/data/uploads` on the same volume |
| Build | **PASS** | `npm run build` via Nixpacks / `railway.toml` |
| Start | **PASS** | `npx next start -H 0.0.0.0 -p $PORT` |
| Healthcheck | **PASS** | `/api/v1/health` |
| Replicas | **PASS** | Single service (required for SQLite writer safety) |
| Background worker | **PASS** | Started via `src/instrumentation.ts` → `startWorker()` |

Latest deployment: `b900d443-da87-4cca-a1c2-20c9f582d221` — **SUCCESS** (22:24 +02).  
Prior attempt `e64612b4-…` **FAILED** on ESLint `prefer-const` (fixed and redeployed).

---

## Domain

| Check | Status |
| --- | --- |
| Custom domain `www.rustenburgtoday.co.za` | **PASS** (Railway ACTIVE) |
| Railway URL `*.up.railway.app` | **PASS** (ACTIVE) |
| HTTPS | **PASS** (live 200 responses over https) |
| Canonical public URL env | **PASS** (`NEXT_PUBLIC_SITE_URL=https://www.rustenburgtoday.co.za`) |
| DNS changes by this session | **NOT TESTED** / not modified — domain was already connected |

---

## Environment (production)

Configured on Railway (values not listed):

- `DATA_DIR=/data`
- `NODE_ENV=production`
- `SESSION_SECRET` (set)
- `NEXT_PUBLIC_SITE_URL`
- `SEED_DEMO=false`
- `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` (synced from local mailbox config this session)

| Provider | Status |
| --- | --- |
| Google OAuth | **BLOCKED** — credentials not set on Railway |
| Facebook OAuth | **BLOCKED** — credentials not set on Railway |
| Web Push (VAPID) | **BLOCKED** — not configured |
| Payments | **BLOCKED** — `PAYMENT_PROVIDER` unset / none |
| Off-site backups (`BACKUP_OFFSITE_DIR`) | **BLOCKED** — not configured on Railway |
| AI assistant | **BLOCKED** — provider unset |

`.env.example` updated with Railway volume notes (placeholders only).

---

## Live production checks (this session)

| Test | Result |
| --- | --- |
| `GET /api/v1/health` | **PASS** — `database: ok`, users present |
| `GET /en` homepage | **PASS** — 200; contains Latest Official Stories + Subscribe |
| `GET /en/news/official` | **PASS** — 200 |
| `GET /en/auth/sign-in` / `sign-up` | **PASS** — 200 |
| `GET /en/admin` / `/en/account` (anonymous) | **PASS** — 307 to sign-in |
| Volume DB file after deploy | **PASS** — `/data/rustenburg.db` present (~3 MB) |
| Uploads directory | **PASS** — `/data/uploads` exists (empty at check time) |
| Users survive deploy | **PASS** — health still reports 6 users |
| Google / Facebook live login | **BLOCKED** |
| Full CMS publish on production | **NOT TESTED** (no production staff login performed this pass) |
| Email delivery inbox proof | **PARTIAL** — SMTP configured; send not re-proven |
| Restart persistence drill | **PARTIAL** — volume retained across deploy; dedicated stop/start drill **NOT TESTED** |
| Mobile layout screenshots | **NOT TESTED** |

---

## Application modules (honest)

| Area | Status |
| --- | --- |
| Public site + HTTPS | **PASS** |
| API health + DB | **PASS** |
| Auth email routes available | **PASS** (forms live) |
| Social auth | **BLOCKED** |
| Official Stories / Subscribe UI | **PASS** (live HTML markers) |
| Headline / Body CMS code | **PASS** (deployed); production publish drill **NOT TESTED** |
| Marketplace / payments | **PARTIAL** / **BLOCKED** payments |
| Media uploads path | **PASS** volume; upload E2E **NOT TESTED** |

---

## Outstanding owner actions

1. Add Google / Facebook OAuth app credentials and set callback URLs to  
   `https://www.rustenburgtoday.co.za/api/auth/google/callback` and  
   `…/facebook/callback`.
2. Configure an off-site backup destination independent of the Railway volume.
3. Keep **one** replica while SQLite remains the database.
4. Optionally commit/push local source to GitHub so Git-triggered deploys match CLI uploads.

---

## Preservation

No domain purchase, no DNS edits, no redesign, no production data wipe. SQLite retained on the existing `/data` volume.
