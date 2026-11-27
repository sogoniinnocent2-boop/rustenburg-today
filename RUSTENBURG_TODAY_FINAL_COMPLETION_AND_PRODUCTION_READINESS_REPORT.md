# Rustenburg Today — Final Completion and Production Readiness Report

**Date:** 26 November 2026  
**Workspace:** local development repository (not a live public deploy)  
**Evidence:** `evidence/final-completion/`

---

## A. Executive verdict

**FUNCTIONAL BUT NOT FULLY COMPLETE — NOT PRODUCTION READY for public launch.**

The platform is a real Next.js + SQLite application with working registration, sessions, editorial workflows, Main Story Manager, commerce/jobs/events foundations, and provider-gated Google/Facebook OAuth. Automated tests and a production build pass. Live Google/Facebook end-to-end login, live payments, SMTP delivery, AI, and production hosting remain **BLOCKED** on external credentials/approvals. Do not treat this as COMPLETE AND VERIFIED.

---

## B. Division-by-division status

Statuses reflect code + automated tests, not full browser journey matrices for every department.

| Division / area | Departments / surfaces | Status | Notes |
| --- | --- | --- | --- |
| News & Media | News, edition, story, editorial desks | **PASS** (core) | Original articles, review/publish, breaking, Main Story Manager |
| Multi-source discovery | Sources, ingest, attribution | **PARTIAL** | Curated sources + ingest exist; scheduled ops need hosting |
| Events & Tickets | Events, tickets, scan | **PARTIAL** | Create/publish/ticket inventory/scan covered in tests; live pay BLOCKED |
| Marketplace | Products, orders, sellers | **PARTIAL** | Listings/orders work; unpaid until signed webhook; live pay BLOCKED |
| Property & Accommodation | Property listings, viewing/booking requests | **PARTIAL** | Requests and ownership checks exist; full booking UX varies |
| Business Hub | Business, advertising | **PARTIAL** | Registration/verification/campaigns; payments gated |
| Education & Learning | Learn, courses, K53, study | **PARTIAL** | Enrol/lesson/quiz paths tested; certificates limited |
| Jobs & Opportunities | Jobs, applications | **PARTIAL** | Publish/apply/employer flows tested |
| Community & Social | Community, people, follows | **PARTIAL** | Posts/comments/reactions/follows; no private chat product |
| Discover / Talent / Creators | Creators, talent, media | **PARTIAL** | Profiles and posts exist; live A/V infra not claimed |
| Services & Lifestyle | Food, sports, services, deals, etc. | **PARTIAL** | Section routes + records; depth varies by desk |
| City Information | Transport, tourism, health, notices, map | **PARTIAL** | Map/notices/records; health disclaimers present |
| AI & Productivity | Ask / productivity tools | **BLOCKED** | Honest 503 until AI provider configured |
| Administration | `/admin/*`, departments, moderation | **PARTIAL→PASS** for hero | Main Story Manager complete; other admin tools present |
| Auth (email/password) | Register, verify, login, reset | **PASS** (automated) | SMTP delivery BLOCKED without credentials |
| Auth (Google / Facebook) | Continue with Google / Facebook | **BLOCKED** live / **PASS** closed-state + unit | Implementation ready; credentials required |

---

## C. Functional inventory (critical features)

| Feature | E2E / automated result |
| --- | --- |
| Homepage Main Editorial Story placement after search | **PASS** (code + unit) |
| Add / replace / schedule / cancel / restore / remove main story | **PASS** (`tests/newsedition.test.ts`) |
| Remove does not delete article | **PASS** |
| Empty / fallback when no eligible hero | **PASS** |
| Google/Facebook buttons without credentials | **PASS** (honest unavailable) |
| OAuth account create + profile completion | **PASS** (unit; Facebook missing email) |
| No silent email merge; password-confirmed link | **PASS** |
| Registration / session / password reset | **PASS** |
| Editorial publish workflow | **PASS** |
| Marketplace order stays unpaid without webhook | **PASS** |
| Live PayFast checkout | **BLOCKED** |
| Live Google consent → session | **BLOCKED** (no credentials) |
| Live Facebook consent → session | **BLOCKED** (no credentials) |
| AI assistant | **BLOCKED** |
| Production deploy / DNS | **BLOCKED** (not performed; approval required) |
| Full 12 responsive viewport browser matrix | **NOT TESTED** (no screenshot lab this pass) |
| Browser journeys 1–12 interactive | **PARTIAL** (covered mainly by automated platform tests) |

---

## D. Frontend ↔ backend integration (critical workflows)

### Main Editorial Story

| Layer | Location |
| --- | --- |
| Homepage UI | `src/components/main-editorial.tsx`, `src/app/[locale]/page.tsx` |
| Admin UI | `src/components/city-admin.tsx` → Main Story Manager (`/admin/hero`) |
| Actions | `cityDeskAction` intent `main-editorial` in `src/server/actions.ts` |
| Service | `scheduleMainEditorial`, `clearMainEditorial`, `cancelScheduledMainEditorial`, `restoreMainEditorial`, `getMainEditorialStory`, `listMainEditorialSlots` in `src/server/newsedition.ts` |
| Database | `main_editorial_slots` (migration `0019_main_editorial`) |
| Permission | `articles.publish` |

### Google / Facebook OAuth

| Layer | Location |
| --- | --- |
| Auth UI | `src/app/[locale]/auth/[action]/page.tsx` |
| Finish profile | `src/app/[locale]/auth/google-profile/page.tsx` |
| Account link/unlink | Account → Security in `src/app/[locale]/account/[[...tab]]/page.tsx` |
| Start / callback | `/api/auth/google`, `/api/auth/google/callback`, `/api/auth/facebook`, `/api/auth/facebook/callback` |
| Providers | `src/server/google.ts`, `src/server/facebook.ts` |
| Identity | `src/server/oauth.ts` → `oauth_identities` |
| Env / docs | `.env.example`, `docs/OAUTH_SETUP.md` |

---

## E. Test evidence

| Check | Result |
| --- | --- |
| Automated tests | **53 passed, 0 failed, 0 skipped** (`evidence/final-completion/npm-test.txt`) |
| Typecheck | **PASS** (`tsc --noEmit`) |
| Lint during build | Warnings only (`no-img-element`, unused imports) — build continues |
| Production build | **PASS** when `NODE_ENV=production` (`scripts/build.js` forces this; `evidence/final-completion/npm-build.txt`) |
| Main editorial schedule/cancel/replace/restore | **PASS** |
| OAuth closed-state + no silent merge + link/unlink | **PASS** |
| Browser screenshots | **NOT TESTED** — see `evidence/final-completion/README.md` |
| Live provider OAuth | **BLOCKED** |

**Build note:** A shell with `NODE_ENV=development` previously broke `/_not-found` prerender (`useContext` null). `npm run build` now forces production via `scripts/build.js`.

---

## F. Remaining defects and dependencies

### Critical / launch blockers

1. **Google OAuth credentials + consent screen** — BLOCKED  
2. **Facebook/Meta app credentials + review** — BLOCKED  
3. **SMTP** for real verification/reset mail — BLOCKED without SMTP_*  
4. **Payment provider sandbox/live** — BLOCKED (`PAYMENT_PROVIDER=none` until configured)  
5. **Production hosting, HTTPS domain, persistent DATA_DIR, backups off-site** — BLOCKED / not executed  
6. **AI provider** — BLOCKED  

### High

- Full interactive browser journey matrix (roles 1–12) not re-run in a headed browser this pass  
- Responsive viewport screenshot matrix not captured  
- Some department UIs remain thinner than news/marketplace/admin  

### Medium

- ESLint `no-img-element` / unused import warnings  
- SQLite single-writer unsuitable for multi-instance horizontal scale without redesign  

### Low

- Apple Sign In remains optional/closed without Apple credentials  

### Legal / approval

- POPIA, consumer, copyright, and child-safety specialist review still required before claiming compliance  
- Meta/Google app verification and privacy/terms URLs must be live for production OAuth  

---

## G. Deployment status

| Item | State |
| --- | --- |
| Local app | Runnable with `npm run dev` / `npm run build` + `npm start` |
| Production host | Not deployed or changed in this pass |
| DNS / domain purchase | Not performed |
| Live payments | Not enabled |
| Secrets in Git | Placeholders only (`.env.example`) |

---

## H. Final completion percentage

Weighted inventory (documented, not cosmetic):

| Weight | Area | Score |
| --- | --- | --- |
| 15% | Auth email/password + sessions | 14% |
| 10% | OAuth Google/Facebook (code + live) | 5% (code PASS, live BLOCKED) |
| 15% | News + Main Story Manager | 14% |
| 15% | Commerce / events / jobs / property | 10% |
| 10% | Community / creators | 7% |
| 10% | Learning / AI / productivity | 5% |
| 10% | Admin / moderation | 8% |
| 10% | Build, tests, security baselines | 9% |
| 5% | Deploy + ops readiness | 1% |

**Estimated completion: ~73%** of the agreed production-ready platform.  
Not 100%. Not COMPLETE AND VERIFIED.

---

## I. Evidence directory

```
evidence/final-completion/
  README.md
  npm-test.txt
  npm-build.txt
  typecheck.txt
```

No passwords, API keys, or personal documents are stored in evidence.

---

## J. Files created or modified in this completion pass (highlights)

**Created**

- `docs/OAUTH_SETUP.md`
- `scripts/build.js`
- `evidence/final-completion/*`
- `RUSTENBURG_TODAY_FINAL_COMPLETION_AND_PRODUCTION_READINESS_REPORT.md`

**Modified (selected)**

- `src/server/oauth.ts` — no silent merge; link tickets; placeholder email; list providers  
- `src/server/actions.ts` — OAuth profile email; link/unlink; main-story confirm  
- `src/app/api/auth/google/callback/route.ts` / `facebook/callback/route.ts` — link + login  
- `src/app/[locale]/auth/google-profile/page.tsx` — optional email  
- `src/app/[locale]/account/[[...tab]]/page.tsx` — Security link/unlink UI  
- `src/components/city-admin.tsx` — remove confirmation  
- `tests/oauth.test.ts`, `tests/newsedition.test.ts`, `tests/platform.test.ts`  
- `.env.example`, `package.json`  
- Main Story Manager / newsedition (prior + this pass): schedule, cancel, restore, history  

**Migrations already in tree**

- `0019_main_editorial` → `main_editorial_slots`

---

## K. Acceptance conditions (honest)

| Condition | Result |
| --- | --- |
| Editor can manage Main Story from admin without editing DB/code | **PASS** (implementation + automated tests). Interactive browser screenshots **NOT TESTED** this pass. |
| Visitor can Continue with Google/Facebook through real provider to an account | **BLOCKED** until Google/Meta credentials and approval. Server flow and closed-state **PASS**. |

---

## L. What to do next for launch

1. Configure `GOOGLE_*`, `FACEBOOK_*`, `SESSION_SECRET`, `NEXT_PUBLIC_SITE_URL`, SMTP, and payment sandbox per `.env.example` and `docs/OAUTH_SETUP.md`.  
2. Run headed browser tests for Main Story Manager and both OAuth providers.  
3. Deploy to a single Node instance with persistent `DATA_DIR` and off-site backups.  
4. Re-run this report statuses after live evidence exists.
