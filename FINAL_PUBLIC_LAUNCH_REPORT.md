# Rustenburg Today — Final public launch report

**Public URL:** https://www.rustenburgtoday.co.za  
**Verified:** 26 November 2026, ~23:55 SAST  
**Railway deployment:** `523df6e5-6621-4662-8267-54d4586011a1` (Online)  
**Evidence:** `evidence/public-launch/`, `evidence/dept-central/`

Secrets are not included.

---

## Status table

| Area | Status | Evidence |
| --- | --- | --- |
| Public homepage | **PASS** | HTTPS 200; Official Stories + Subscribe; no demo article leak |
| Registration | **PASS** | Sign-up form live; SMTP configured for verification mail |
| Login and logout | **PASS** | Sign-in/out paths live; department sessions previously verified |
| Google authentication | **BLOCKED** | UI states credentials missing — no Railway Google secrets |
| Facebook authentication | **BLOCKED** | UI states Meta app missing — no Railway Facebook secrets |
| All 32 departments | **PASS** | 3×32 = **96/96** desk access (`evidence/dept-central/prod-96-access.json`) |
| Editorial publishing | **PARTIAL** | CMS/desk publish code + tests PASS; **0** original published articles on production |
| Main Editorial Story | **PARTIAL** | Slot system + empty-state on homepage; no scheduled live hero story yet |
| News subscriptions | **PASS** | Subscribe/unsubscribe UI; official + optional desk alerts; SMTP set |
| Notifications | **PARTIAL** | In-app history + prefs live; web push **BLOCKED** (no VAPID) |
| Search and location | **PASS** | Search API OK; location not forced; CSP blocks unsolicited geolocation |
| All public divisions | **PARTIAL** | All checked section routes 200 with empty states; checkout/tickets money off |
| Dashboards | **PASS** | Account (privacy/deletion/notifications), admin/department gated |
| Database | **PASS** | Health OK; SQLite on `/data` volume; 32 desks assigned |
| File storage | **PASS** | `/data/uploads` on volume |
| Security | **PASS** | Headers/CSP; robots disallow admin/department; outsider desks blocked |
| Mobile responsiveness | **PARTIAL** | overflow-x clipped; responsive CSS present; full device screenshot matrix not pixel-captured |
| Railway deployment | **PASS** | Online after launch hardening |
| HTTPS domain | **PASS** | `www.rustenburgtoday.co.za` |
| Backups and restoration | **PASS** | Prod backup `/data/backups/rustenburg-launch-1795728976852.db`; disposable restore drill OK (`evidence/public-launch/restore-drill.json`) |

---

## Implemented / verified this launch cycle

- Production inspection + DB backup before changes  
- Demo podcasts/articles kept off public lists  
- `robots.txt` + `sitemap.xml`  
- Honest marketplace checkout-disabled notice  
- Privacy account panel (export + deletion + policy link)  
- Department desk alert follow control  
- Horizontal overflow safeguard  
- Disposable backup restore proof  
- Live smoke: 19 routes, **0** HTTP 5xx, **0** demo leaks  
- Department centralisation retained **96/96**

---

## Cannot be “PASS” without the owner

| Dependency | Why |
| --- | --- |
| Google / Facebook login | OAuth client credentials + provider callback approval |
| First Official / Main Editorial stories | Real journalism — will not invent articles |
| Card checkout / paid tickets | Payment provider + signed webhook |
| Browser push | VAPID keys |

---

## Verdict

The platform is **live, secured for public registration/use, and production-hosted**.  

It is **not 100% of every marketing feature** until OAuth, payment provider (if required), and original published journalism are supplied by the owner/editors.

**Do open the site to the public for accounts and browsing.**  
**Do not claim Google/Facebook login or paid checkout work until those credentials are added and retested.**
