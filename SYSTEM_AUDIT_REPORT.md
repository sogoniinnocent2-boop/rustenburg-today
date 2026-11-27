# Rustenburg Today — System-wide technical audit & Main Editorial Story

**Date:** 26 November 2026  
**Branch:** `main` (dirty working tree; not deployed)  
**Recommendation:** **FUNCTIONAL BUT NOT READY FOR PUBLIC LAUNCH**

---

## A. System architecture

| Layer | Technology |
| --- | --- |
| Frontend | Next.js 15 App Router, React Server Components, Midnight Glass CSS |
| Backend | Next.js server actions + `/api` routes, SQLite (`node:sqlite`) |
| Auth | Cookie sessions, email verification, optional Google/Apple/Facebook (closed until credentials) |
| Storage | `DATA_DIR` SQLite file + upload directory |
| Payments | Provider hooks present; browser-side payment success refused; unpaid orders only |
| Email / AI | Provider-gated; unavailable without configuration |
| Hosting | Railway-oriented config exists; **no production deploy in this pass** |

**Request path:** Browser → App Router page / form → server action or API → `src/server/*` services → SQLite → redirect or RSC render.

---

## B. Database audit

- Engine: SQLite with `schema.sql` bootstrap + incremental migrations in `src/server/db.ts`.
- Foreign keys enabled; migrations recorded in `schema_migrations`.
- **Applied this pass**
  - `0018_community_profiles` — `profiles.cover_url`, `profiles.website_url`, community location index.
  - `0019_main_editorial` — `main_editorial_slots` for scheduled Main Editorial Story (article-only, location-optional, start/end, editor, status).
- Integrity: Main hero rejects unpublished, demo, or missing articles; expired/ineligible slots are deactivated when selected.
- Remaining risks: SQLite single-writer limits under multi-instance hosting; payment and email providers not production-configured.

---

## C. Backend audit (selected)

| Area | Status | Notes |
| --- | --- | --- |
| Registration / session | PASS (unit) | Covered by platform tests |
| Editorial CMS | PASS | Publish/review/breaking |
| Main editorial hero API | PASS | `scheduleMainEditorial`, `clearMainEditorial`, `getMainEditorialStory` |
| Community feed / follows | PASS (unit) | Existing stack reused |
| Marketplace orders | PASS (unit) | Orders stay unpaid; browser payment refused |
| Tickets / jobs / courses | PASS (unit) | Existing platform tests |
| AI | BLOCKED | Route stays unavailable without provider |
| PayFast / live payments | BLOCKED | Credentials / sandbox not verified this pass |
| SMTP verification mail | BLOCKED | Honest failure when SMTP missing |

---

## D. Homepage Main Editorial Story (implemented)

**Required order now:**

1. Header / navigation  
2. Homepage search (inside existing `HeroStage`)  
3. **Main Editorial Story** (`MainEditorialStory`)  
4. Edition bar, scenic ViewRail, Top Five, latest wires, remaining sections  

**Rules enforced**

- Only published original Rustenburg Today articles (`is_demo = 0`).
- External wires and sponsored items cannot be scheduled.
- Editors with `articles.publish` set/clear via Admin → **Main story** (`/admin/hero`).
- Optional start/end schedule and optional location scope; national default when location blank.
- Explicit editor selection beats location fallback; if no live slot, falls back to featured/latest **original** article only — never an external wire labelled as original.
- Empty state when no eligible original story exists.

**Files**

- `src/server/newsedition.ts` — selection, schedule, clear, listing  
- `src/server/db.ts` — migration `0019_main_editorial`  
- `src/server/actions.ts` — `main-editorial` desk intent  
- `src/components/city-admin.tsx` — Main story desk  
- `src/components/main-editorial.tsx` — homepage block  
- `src/app/[locale]/page.tsx` — placement under search  
- `src/app/globals.css` — responsive layout  
- `src/lib/i18n.ts` — EN/AF/TN strings  
- `tests/newsedition.test.ts` — hero eligibility test  

---

## E. End-to-end workflow status

| Journey | Result | Evidence |
| --- | --- | --- |
| Automated suite | PASS | `npm test` → **50/50** |
| Main editorial schedule | PASS | newsedition test |
| Registration / community / marketplace / jobs | PASS (unit) | platform / commercial / shelf tests |
| Production build | FAIL (pre-existing `/404` Html/document conflict) | See section H; packaging blocker |
| Browser homepage probe | PASS (dev) | `GET /en` → Main Editorial after search |
| Browser / viewport matrix | PARTIAL / NOT TESTED | Device lab matrix not run this pass |
| Sandbox payments | BLOCKED | Provider config |
| Email verification delivery | BLOCKED | SMTP |
| Full responsive 9-viewport device lab | NOT TESTED | CSS responsive rules present; device lab not run |

---

## F. Security notes

- Permission-gated hero scheduling (`articles.publish`).
- Ownership checks remain on marketplace/community actions (prior tests).
- Upload MIME validation exists in upload path (prior).
- Outstanding: production secret review, CSRF posture for cookie forms, legal POPIA review — not claimed complete.

---

## G. Performance

- Homepage now one additional indexed query for main editorial slots.
- No load test run in this pass.

---

## H. Infrastructure

- Local SQLite + uploads under `DATA_DIR`.
- Backup verification covered by operations tests (off-site copy required for success).
- Deploy / DNS / SSL: **not changed**.
- **Production build:** `npm run build` fails while prerendering `/404` with `Error: <Html> should not be imported outside of pages/_document` (Next 15.5.29). Compiles and typechecks past the app routes; failure is in static error-page generation. Dev server serves the site correctly (`GET /en` 200 with Main Editorial after search). Treating as a **packaging / launch blocker**, not as proof that application routes are non-functional.
- Root layout kept free of `cookies()`/`headers()` during static generation; theme restored via inline cookie script; locale layout remains `force-dynamic`.

---

## I. Outstanding issues

**Critical / launch blockers**

1. Email provider not configured → verification and recovery incomplete in real delivery.  
2. Payment provider not verified → marketplace paid checkout blocked.  
3. `npm run build` fails on `/404` Html/document prerender (packaging blocker).  
4. No full device-viewport evidence pack for all divisions on this pass.

**High**

4. Phase 5–8 community/marketplace/property/education polish remains incomplete relative to those master prompts.  
5. Location personalisation of homepage content beyond the new hero slot is partial (cookie location + discovery already exist).

**Medium / Low**

6. Incomplete creator studio / feed mode upgrades from the interrupted Phase 5 pass.  
7. Open Graph / NewsArticle schema still missing (Phase 4 note).

---

## J. Final readiness

**FUNCTIONAL BUT NOT READY FOR PUBLIC LAUNCH**

Evidence: automated tests pass including the new Main Editorial Story controls; production build must succeed for packaging; external email/payment and full browser certification remain open. Original homepage structure and branding preserved; Main Editorial Story inserted immediately under search without replacing the site.
