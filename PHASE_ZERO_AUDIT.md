# Phase Zero — Complete technical and functional audit

**Project:** Rustenburg Today  
**Audit date:** 26 November 2026  
**Scope:** Read-only inspection of repository, local SQLite, production host status, and `D:\MASTER DEVELOPMENT PROMPT.docx`  
**Rule followed:** No large-scale implementation, no deploy, no DNS change, no destructive DB work during this phase.

---

## Executive verdict

Rustenburg Today is already a **broad digital-city platform** (12 navigation divisions, 36 section routes, auth, marketplace, jobs, events, learning, SafeTrack, department desks, wire ingestion code, multi-locale UI). Relative to the **Master Development Prompt** (premium digital newsroom + NFIS + SEO/news discovery + newsletter), it is a **PARTIAL news publication** sitting on top of a much wider city product.

**Do not treat the product as launch-complete for the news organisation brief.** Preserve the city platform; upgrade the newsroom on top of it.

Production note (stale docs corrected): **`DEPLOYMENT.md` still says the app is not deployed.** In reality the linked Railway service is **Online** at `https://www.rustenburgtoday.co.za` with volume `DATA_DIR=/data`. Local `./data/rustenburg.db` is **not** the production volume and is **behind** code migrations.

---

## 1. Architecture report

### Stack (inspected)

| Layer | Reality | Evidence |
| --- | --- | --- |
| Framework | Next.js 15.5.x App Router, React 19, TypeScript | `package.json` |
| UI | Server components + server actions; Tailwind 4; Midnight Glass / Liquid Glass CSS | `src/app`, `src/components`, `globals.css` |
| Backend | Domain services under `src/server/*.ts`; façade `actions.ts`; `/api/v1` | `SYSTEM_ARCHITECTURE.md`, source |
| Database | SQLite via `node:sqlite`; `PRAGMA journal_mode=DELETE`; file `$DATA_DIR/rustenburg.db` | `src/server/db.ts` |
| Auth | scrypt passwords; HMAC httpOnly cookie `rt_session`; roles/permissions | `auth.ts`, `session.ts`, `access.ts` |
| i18n | Locales `en` / `af` / `tn`; middleware sets `rt_locale` | `src/lib/i18n.ts`, `middleware.ts` |
| Worker | `instrumentation.ts` → `worker.ts` (~60s): due articles, wire pull, expiries, SMTP outbox, SafeTrack | `worker.ts` |
| Media | Local `$DATA_DIR/uploads`; magic-byte checks; video = YouTube/Vimeo/Mux embeds only | `uploads.ts`, `INTEGRATIONS.md` |
| Search | First-party `search_documents`; Ask returns only stored hits | `engage.ts`, `search` |
| Postgres path | `supabase/migrations/0001_init.sql` exists (RLS on, no policies); **not used by running app** | `INTEGRATIONS.md` |

### Production host (inspected via Railway CLI)

| Item | Status |
| --- | --- |
| Service | `rustenburg-today` · Online |
| URL | `https://www.rustenburgtoday.co.za` |
| Volume | `rustenburg-today-volume` · `/data` |
| Constraint | Single Node process + SQLite (do not scale out against one file) |

### Entry points

- Browser → middleware locale → `src/app/[locale]/…`
- Forms → server actions → domain services → SQLite
- `/api/v1/*` → session + permission + origin checks (payment webhook = HMAC exception)
- OAuth: `/api/auth/{google,apple,facebook}` (disabled without credentials)

---

## 2. Taxonomy — divisions and departments

### Divisions (12) — MATCH

From `src/lib/divisions.ts`: news, events, market, property, business, learn, jobs, community, discover, talent, life, city.

### Sections / departments (36) — MISMATCH vs “30”

From `src/lib/sections.ts` (36 slugs):  
news, community, podcasts, tv, radio, music, talent, marketplace, jobs, learn, events, business, advertising, property, food, sports, youth, support, transport, tourism, health, voice, deals, competitions, history, services, agriculture, faith, family, technology, productivity, notices, creators, map, briefing, ask.

| Claim | Actual | Recommendation |
| --- | --- | --- |
| 12 divisions | 12 | Keep |
| 30 departments | 36 section routes | **Do not delete.** Document extras (`map`, `briefing`, `ask`, `productivity`; radio/music split) as platform sections beyond the original 30. Obtain approval before any rename/merge. |
| Orphan | `productivity` not listed under any division `slugs` | P2: attach to a division or document intentional platform-only placement |

**Preservation rule:** Existing working city departments must not be collapsed into a news-only site.

---

## 3. Route inventory

**44** `page.tsx` files under `src/app`. **8** API `route.ts` files (OAuth ×6, AI, catch-all v1).

### Public (locale-prefixed) — real DB / honest empty when empty

| Area | Routes (representative) | Data? | Notes |
| --- | --- | --- | --- |
| Home | `/[locale]` | Yes | Edition, discovery, hero; many panels empty without content |
| Departments | `/[locale]/[section]`, `/new`, `/[slug]` | Yes | Shared section body + desk stories + department wires |
| News detail | `/news/[slug]` | Yes | Articles + wire items |
| Auth | `/auth/*` | Yes | Register/sign-in/reset; OAuth gated |
| Account | `/account/[[...tab]]` | Yes | Profile, privacy export/delete, listings, orders… |
| Admin | `/admin/[[...tab]]` | Yes | City desks; requires staff roles |
| Department staff | `/department/[[...tab]]` | Yes | Content-owner desks |
| City desks catalogue | `/desk/[[...tab]]` | Yes | Desk catalog |
| Discovery | search, map, ask, briefing, edition, live, watch | Mixed | Ask/search DB-backed; weather via Open-Meteo |
| Tools | study, k53, languages, tools, play, planner… | Mixed | Free tools; AI off |
| SafeTrack | `/safetrack`, `/safetrack/desk` | Yes | Family safety module |
| Legal/about | `/about`, `/legal/[doc]` | Mostly static policy copy | |
| Commercial | tickets, plans, loyalty, advertising | Partial | Payments disabled until webhook provider live |

### Completeness rule applied

HTTP 200 ≠ complete. Many department pages load with **honest empty states**. That is correct behaviour, not “fully implemented product coverage.”

### Browser testing (Phase Zero)

| Check | Result |
| --- | --- |
| Production home (en/af) | Loads; logo + locale chrome present (post recent deploy) |
| Automated e2e (Playwright/Cypress) | **None in repo** |
| Mobile device lab | **Not run in this audit** — responsive CSS exists; physical-device pass outstanding |
| Local `npm test` | **44** Node service tests passing (prior session); not re-run as mutation gate here |

---

## 4. Feature implementation matrix (traceable)

Statuses used:  
`FULLY IMPLEMENTED AND TESTED` · `IMPLEMENTED BUT NOT FULLY TESTED` · `PARTIALLY IMPLEMENTED` · `INTERFACE ONLY` · `REQUIRES EXTERNAL INTEGRATION` · `NOT IMPLEMENTED` · `BLOCKED BY DEPENDENCY`

### A. Platform core

| Requirement | Existing | Evidence | Status | Missing | Priority | Acceptance test |
| --- | --- | --- | --- | --- | --- | --- |
| Accounts / sessions / roles | Register, verify queue, roles, admin seed | `auth.ts`, tests | IMPLEMENTED BUT NOT FULLY TESTED | Live SMTP verify; OAuth live | P0 | Register → email arrives → verify → session cookie |
| Locale UI en/af/tn | Catalog + middleware cookie | `i18n.ts`, chrome, home | PARTIALLY IMPLEMENTED | Many section/admin English strings; professional translation review | P1 | Switch locale; chrome + home fully in target language |
| Theme light/dark | Cookie + CSS | chrome, globals | IMPLEMENTED BUT NOT FULLY TESTED | Contrast audit | P2 | Toggle persists; reduced-motion respected |
| Search / Ask | Indexed docs; no invented facts | engage/search | PARTIALLY IMPLEMENTED | Filters (author/date/tag), news SEO surfaces | P1 | Search returns only stored entities |
| Payments | HMAC webhook path | `payments.ts` | REQUIRES EXTERNAL INTEGRATION | PayFast (or approved) merchant + sandbox proof | P0 | Browser cannot mark paid; webhook does |
| Email | Outbox + SMTP worker | `mail.ts` | REQUIRES EXTERNAL INTEGRATION | `SMTP_*` credentials + delivery proof | P0 | Real mailbox receives verify/reset |
| Uploads | Type/size/magic checks | `uploads.ts` | IMPLEMENTED BUT NOT FULLY TESTED | Malware scan | P1 | Disguised file rejected; image by id works |
| Backup | Off-site integrity copy | `backup.ts` | PARTIALLY IMPLEMENTED | Production off-site disk + restore drill signed | P0 | `backup` + `backup:check` green on prod host |
| Postgres / RLS | Migration file only | supabase/… | NOT IMPLEMENTED | Approved migration plan | P3 | N/A until approved |

### B. Newsroom (Master Prompt)

| Requirement | Existing | Evidence | Status | Missing | Priority | Acceptance test |
| --- | --- | --- | --- | --- | --- | --- |
| Editorial categories nav (Breaking, Politics, World…) | Local `article_categories` chips; not Master IA | editorial seed, news page | PARTIALLY IMPLEMENTED | Primary news nav + landing pages per Master list | P0 | Each category URL shows real filtered published stories or honest empty |
| Editorial homepage (ticker, most-read, Africa/World hubs…) | City home + top five + latest wires | `page.tsx`, citydesk | PARTIALLY IMPLEMENTED | Newsroom homepage layout; most-read/trending; NFIS preview; newsletter block | P0 | Sections filled only from DB; no invented stories |
| CMS workflow Draft→Review→Schedule→Publish→Archive | Service statuses + revisions/meta columns | `editorial.ts`, tests | PARTIALLY IMPLEMENTED | Full journalist UI; archive; developing-story tools; richer SEO UI | P1 | Journalist draft → editor publish → public URL |
| Department desk publish | `/department` live publish with media | departments.ts, tests | IMPLEMENTED BUT NOT FULLY TESTED | Broader journalist role model | P1 | Assigned staff publish; unassigned denied |
| Corrections | Corrections list on news | editorial | PARTIALLY IMPLEMENTED | Visible on article + policy page linkage | P1 | Correction appears on article |
| Multi-source ingestion | Curated RSS + intervals + diversity admin | `multisource.ts`, `CONTENT_SOURCES.md`, tests | PARTIALLY IMPLEMENTED | More ZA/NW sources; local DB migration lag; API sources | P0 | ≥2 non-SAnews sources active; coverage desk accurate |
| SAnews not sole source | Code installs many feeds | curated catalog | PARTIALLY IMPLEMENTED | Prove on **production** volume after boot; local DB still SAnews-era | P0 | Diversity report shows multi-publisher published items |
| Attribution / headline+link rights | Default `headline_link`; sensitive → review | citydesk | IMPLEMENTED BUT NOT FULLY TESTED | Copyright review queue UI | P1 | External item shows publisher + original link |
| Duplicate detection | url_hash + 72h headline/publisher | citydesk | IMPLEMENTED BUT NOT FULLY TESTED | Admin duplicate monitor | P2 | Second identical URL not inserted |
| News sitemap / NewsArticle schema / OG | Not found in codebase | grep | NOT IMPLEMENTED | sitemap.xml, news sitemap, JSON-LD | P0 | Validators accept NewsArticle; robots allows |
| Newsletter subscriptions | Only “newsletter sponsorship” ad product / desk | seed, desk-catalog | NOT IMPLEMENTED | Subscriber store, double opt-in, send path | P0 | User subscribes; confirms; appears in admin |
| Reader tip / submit news | Community posts / moderated reports | community | PARTIALLY IMPLEMENTED | Dedicated tip workflow + editorial routing | P2 | Tip held until review |
| Comments / polls / bookmarks / share | Present in platform | community, engage, share | PARTIALLY IMPLEMENTED | Hardening + news-specific UX | P2 | Moderated comment; bookmark persists |

### C. Sports / NFIS

| Requirement | Existing | Evidence | Status | Missing | Priority | Acceptance test |
| --- | --- | --- | --- | --- | --- | --- |
| Local clubs/fixtures/results | Tables + services | `city.ts` | PARTIALLY IMPLEMENTED | Content + richer sports news | P1 | Published fixture/result visible |
| NFIS Football Intelligence | **No code references** | repo grep | NOT IMPLEMENTED | Locate NFIS API; auth; honest unavailable UI | P0 | Live fixtures from NFIS or clear unavailable state — never fake |

### D. Multimedia

| Requirement | Existing | Evidence | Status | Missing | Priority | Acceptance test |
| --- | --- | --- | --- | --- | --- | --- |
| Podcasts / TV embeds / radio desk | Records + moderation | media.ts | PARTIALLY IMPLEMENTED | Live streaming provider; galleries CMS | P1 | Published podcast plays; unapproved video hidden |
| Photo library with rights | Media library admin | media-library | PARTIALLY IMPLEMENTED | Galleries; photojournalism centre | P2 | Rights note required before homepage use |

### E. Wider ecosystem (preserve)

| Division area | Status (honest) | Notes |
| --- | --- | --- |
| Marketplace / orders | PARTIALLY IMPLEMENTED | Unpaid until webhook; payment_mode disabled |
| Property | PARTIALLY IMPLEMENTED | Listings/viewings; no live booking pay |
| Jobs | PARTIALLY IMPLEMENTED | Employer flow in tests; often empty publicly |
| Events / tickets | PARTIALLY IMPLEMENTED | Capacity + codes after webhook |
| Learn | PARTIALLY IMPLEMENTED | Quizzes/certificates non-accredited |
| Business / ads | PARTIALLY IMPLEMENTED | Campaigns need approval + payment/waiver |
| Community / creators | PARTIALLY IMPLEMENTED | Moderation gates |
| SafeTrack | PARTIALLY IMPLEMENTED | Web module; native/SMS/SAPS not built |
| City info / notices / voice | PARTIALLY IMPLEMENTED | Not municipal channel (disclaimed) |

### F. Admin / analytics

| Requirement | Existing | Status | Missing | Priority |
| --- | --- | --- | --- | --- |
| Source manager / ingest / coverage / editorial | Admin tabs | PARTIALLY IMPLEMENTED | API source types; richer analytics | P1 |
| Fake dashboard metrics | Counts from DB | Low risk if honest | Do not invent traffic | P0 |
| Visitor analytics / traffic sources | First-party events thin | PARTIALLY IMPLEMENTED | Privacy-safe analytics product | P2 |

---

## 5. Database and data-integrity report

### Local workspace DB (read-only)

Path: `./data/rustenburg.db`  
Migrations applied: **through `0012_department_desks` only** (12 rows).  
Code also defines **`0013`–`0016`** (stories, video, reactions, multisource) — **not yet applied on this local file** until next `ensureReady()` boot against it.

| Entity | Count (local) |
| --- | ---: |
| users | 9 |
| articles | 1 (demo/published era) |
| news_sources | **1 (SAnews)** |
| news_items | 58 |
| community_posts | 4 |
| products | 2 |
| marketplace_orders | 2 |
| jobs / events / businesses | 0 |
| podcasts | 1 |
| department_assignments | 3 |
| email_outbox | 6 |

**Integrity actions taken:** none destructive. Temp count script removed.

### Production DB

Not opened from this workstation. Lives on Railway volume `/data`. Prior operational work provisioned staff accounts and deployed multisource code — **production counts must be verified via approved ops access**, not assumed equal to local.

**Rule:** Never overwrite production volume with local `data/rustenburg.db`.

---

## 6. External integration report

| Provider | Purpose | Configured? | Prod status | Failure behaviour |
| --- | --- | --- | --- | --- |
| SMTP | Auth/reset/notice mail | Env-dependent | Assumed off unless set on Railway | Queues outbox; may show dev link in non-prod |
| Google/Apple/Facebook OAuth | Social sign-in | Code ready | Disabled without secrets | Honest “not configured” |
| Payment webhook | Orders/campaigns/courses | Code ready | `payment_mode` disabled until merchant | Browser cannot mark paid |
| Open-Meteo | Weather | Public API | Used | Empty/error without inventing |
| OSM / Leaflet | Map tiles | Used | Used | Map empty without verified points |
| YouTube/Vimeo/Mux | Video | Allowlist embeds | Used when IDs valid | Non-allowlisted rejected |
| RSS publishers (SAnews, BBC, AJ, WHO, ReliefWeb) | Headline discovery | Curated in code | Deployed in app code; DB apply on boot | Per-source errors; others continue |
| NFIS | Football intelligence | **Unknown / not in repo** | Not integrated | Must show unavailable — never fabricate |
| Web push | Alerts | Tables only | Not registered | No push sent |
| AI model | Ask/productivity | Gated off | Off | Route unavailable |

---

## 7. Security and privacy findings

| Finding | Severity | Notes |
| --- | --- | --- |
| SMTP missing → verify/reset unreliable for public users | P0 | Do not claim production auth complete |
| SQLite single-process constraint | P0 ops | Multi-instance against one file = corruption risk |
| Off-site backup disk may be unset | P0 | `backup` fails closed without different disk |
| CSP still allows `unsafe-inline` / `unsafe-eval` | P1 | Hardening debt |
| No malware scanner on uploads | P1 | Type/size/magic only |
| Demo seed on public host | P0 if `SEED_DEMO=true` | Keep false on public |
| Private DMs for minors blocked | OK | Preserve |
| Account export/delete paths exist | OK | POPIA-oriented; not a legal sign-off |
| Docs drift (`DEPLOYMENT.md` “not deployed”) | P1 | Update after approval — not done in Phase Zero code changes beyond this audit file |

---

## 8. Content and department coverage

| Coverage type | Reality |
| --- | --- |
| Original desk journalism | Workflow exists; volume depends on staff |
| Wire / multi-source | Engine in code; local DB still SAnews-centric; production needs post-boot verification |
| Local NW municipal feeds | Gap — scarce public RSS; do not invent |
| Jobs/events/property content | Mostly empty publicly — honest empties |
| Sports intelligence | Local sports tables only; **no NFIS** |
| Empty-state honesty | Generally good — keep |

---

## 9. UI/UX audit

| Area | Finding |
| --- | --- |
| Brand | Official logo now in chrome/hero/footer/desks (recent) |
| Design system | Midnight Glass / Liquid Glass present; premium direction aligned |
| Homepage | City ecosystem home ≠ Master Prompt newsroom homepage — intentional gap |
| Nav | City primary nav; Master news category nav not implemented |
| Mobile | CSS responsive; **no formal device lab in this audit** |
| Accessibility | Skip links, some `lang=`; contrast/keyboard audit incomplete |
| i18n | Shared chrome improved; deep pages still English-heavy |

---

## 10. Automated testing report

| Suite | Result |
| --- | --- |
| `tests/*.test.ts` (11 files) | Service/integration style via `tsx --test` |
| Coverage themes | Auth, editorial, community, payments rules, departments/reactions, multisource, OAuth closed, backup disk rules, SafeTrack, desks, shelf |
| Browser e2e | **Absent** |
| Load/performance CI | **Absent** |
| Typecheck | Used in recent work (`tsc --noEmit`) |

**Gap:** Master Prompt acceptance needs browser journeys + content acceptance tests, not only Node tests.

---

## 11. Browser testing report (Phase Zero)

| Journey | Done? | Result |
| --- | --- | --- |
| Production homepage load | Spot check | 200; logo/locale signals after last deploy |
| Afrikaans chrome | Spot check | Nav/home support strings present |
| Full Master news nav | No | Not built |
| NFIS pages | No | Not built |
| Admin ingest/coverage on prod | Not re-verified this phase | Exists in code |
| Mobile Safari/Chrome lab | No | Outstanding |
| Payment sandbox | No | Blocked by merchant |

---

## 12. Critical issues and dependencies

### P0 — blockers / integrity

1. Treat **SMTP**, **SESSION_SECRET**, **HTTPS**, **durable single-process DATA_DIR**, **off-site backup** as production baseline; verify each on Railway explicitly.  
2. **NFIS** missing entirely — do not ship “Football Intelligence” UI with fake data.  
3. **News SEO**: no sitemap / NewsArticle schema.  
4. **Newsletter** product missing (sponsorship ≠ subscriptions).  
5. **Master news IA** (Breaking/Politics/World…) missing as first-class navigation.  
6. **Docs drift** and **local vs prod DB drift** (migrations/sources) risk false claims.  
7. **Do not overwrite** production volume; do not scale SQLite horizontally.

### P1 — essential product

- Full journalist CMS UI on top of existing editorial service  
- Expand legitimate ZA/NW sources  
- Editorial homepage hierarchy without overcrowding city home (or dedicated `/edition` news face)  
- Payments sandbox  
- Professional language review  
- Physical mobile pass  

### P2 — important

- Duplicate monitor UI, copyright review queue  
- Tip line, polls hardening, multimedia galleries  
- Attach `productivity` to a division  
- Privacy-safe visitor analytics  

### P3 — later

- Postgres/RLS migration (only with approved plan)  
- Web push  
- Live streaming provider  
- Native SafeTrack  

### External dependencies awaiting owner decisions

| Dependency | Needed for |
| --- | --- |
| SMTP mailbox | Auth mail |
| PayFast (or approved) merchant | Tickets/orders/ads money |
| NFIS API access + docs | Football intelligence |
| Extra licensed/partner feeds | Local/dept coverage |
| Off-site backup disk | Ops readiness |
| Approval to change DNS / buy services | Explicit — **not done in Phase Zero** |

---

## Prioritised implementation roadmap (for review — not started)

Aligned with directive phases, adjusted to **preserve city platform** and actual dependencies.

| Phase | Focus | Gate before starting |
| --- | --- | --- |
| **1** | Architecture/docs truth, design tokens, nav defects, locale completeness for chrome | Approve Phase Zero |
| **2** | News IA + editorial homepage sections fed only from DB | Agree: extend city home vs dedicated news face |
| **3** | Multi-source hardening (more feeds, prod verification, diversity alerts) | Source list approval |
| **4** | Newsroom CMS UI + workflow polish + corrections | Role model confirmation |
| **5** | Search filters + sitemaps + NewsArticle/OG | — |
| **6** | NFIS inspect-then-integrate | **NFIS credentials/API must exist** |
| **7** | Multimedia centre | Streaming provider decision |
| **8** | Newsletter + engagement | SMTP live |
| **9** | Advertising packages/reporting | Payment mode tests |
| **10** | Admin analytics (honest metrics only) | — |
| **11** | Security/a11y/perf/e2e | — |
| **12** | Ops readiness (backup drill, monitoring, restore) | Explicit deploy approval each time |

**STOP.** Large-scale implementation waits for review and phase-boundary approval.

---

## Sources consulted

- `D:\MASTER DEVELOPMENT PROMPT.docx` (extracted full requirements text)  
- This directive (Parts 1–20)  
- Repo: `SYSTEM_ARCHITECTURE.md`, `IMPLEMENTATION_STATUS.md`, `DEPLOYMENT.md`, `INTEGRATIONS.md`, `CONTENT_SOURCES.md`, `SECURITY.md`, `TESTING.md`  
- Code: `src/lib/{sections,divisions,i18n}.ts`, `src/server/{db,editorial,citydesk,multisource,worker,auth}.ts`, `src/components/city-admin.tsx`, App Router tree  
- Local SQLite read-only counts  
- Railway CLI status (production Online)

---

## What Phase Zero deliberately did **not** do

- No feature implementation beyond writing this audit  
- No deploy / DNS / purchases  
- No production DB download or overwrite  
- No invented NFIS, analytics, or news content  
- No claim that a page is complete because it returns 200
