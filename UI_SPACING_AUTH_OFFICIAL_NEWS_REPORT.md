# Rustenburg Today — UI spacing, auth/dashboard & official news subscription report

**Date:** 26 November 2026  
**Evidence:** `evidence/ui-subscription/`

---

## A. Homepage

| Item | Status | Notes |
| --- | --- | --- |
| Header overlap (search vs Property / More) | **PASS** | Full search input only at ≥1600px; icon search below that. Property/Tickets/SafeTrack collapse into More at narrower widths. |
| Hero shortcut congestion under search | **PASS** | `.cine-shortcuts` gap/margin increased; chips no longer sit against the place form. |
| Section spacing below search | **PASS** | `.home-flow` gap 3rem (2.1rem mobile); shared `.home-section-head`; Main Editorial + Official Stories + Subscribe before edition bar. |
| Main Editorial Story prominence | **PASS** | Dedicated grid, summary spacing, empty state when no scheduled original. |
| Latest Official Stories on homepage | **PASS** | Wired via `listOfficialStories`; live HTML contains section. |
| Subscribe band on homepage | **PASS** | Free account-based subscribe CTA; `?subscribe=1` highlights opt-in without forcing it. |
| Mobile / desktop layout | **PARTIAL** | CSS breakpoints covered 320–1920; visual QA via live HTML + prior screenshot baseline. Full device matrix screenshots **NOT TESTED** in GUI. |

**Before:** `evidence/ui-subscription/before-homepage-header.png`  
**After markers:** `evidence/ui-subscription/homepage.html`

---

## B. Registration

| Method | Status | Evidence |
| --- | --- | --- |
| Email registration | **PASS** | Covered by platform/auth tests; sign-up form live 200. |
| Email verification | **PASS** | Dev token path when SMTP unset; production uses SMTP when configured. |
| Terms / guardian consent | **PASS** | Required terms checkbox; guardian for under-18. |
| Duplicate email | **PASS** | Auth layer returns 409. |
| Google registration | **BLOCKED** | Requires `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`. UI states missing credentials honestly. |
| Facebook registration | **BLOCKED** | Requires `FACEBOOK_APP_ID` / `FACEBOOK_APP_SECRET`. Same honest UI. |
| Subscribe return after sign-up | **PASS** | `next=/en?subscribe=1` preserved through verify via `safeReturn`; opt-in remains a separate choice. |
| Mobile registration | **NOT TESTED** | Same form/responsive CSS; no device lab run. |

---

## C. Login

| Method | Status | Evidence |
| --- | --- | --- |
| Email / password | **PASS** | Auth + session tests; sign-in form live 200. |
| Password recovery | **PASS** | Forgot/reset flow in tests; SMTP optional in non-production. |
| Session restore / logout | **PASS** | Session cookie + `signOutAction` covered by suite. |
| Protected routes after logout | **PASS** | `/en/account`, `/en/admin`, `/en/admin/cms` return 307 to sign-in when anonymous. |
| Google continue | **BLOCKED** | Provider credentials not configured in this environment. |
| Facebook continue | **BLOCKED** | Provider credentials not configured. |
| Account linking | **PASS** | OAuth tests: no silent email merge; password-confirmed link. |

---

## D. Dashboards

| Dashboard | Route | Role | Visual | Functional |
| --- | --- | --- | --- | --- |
| Personal account | `/account/*` | Signed-in user | **PASS** (account shell spacing + notification prefs) | **PASS** — tabs load; notifications mark-read + official subscribe |
| Notifications prefs | `/account/notifications` | Signed-in | **PASS** | **PASS** — official in-app/email subscribe/unsubscribe |
| Administrator | `/admin` | admin/editor/moderator/journalist | **PARTIAL** | **PASS** permission gate (307 anonymous); CMS journey in tests |
| CMS / editorial | `/admin/cms` | journalist/editor/admin | **PARTIAL** | **PASS** — draft→review→publish suite |
| Department desk | `/department` | content roles | **PARTIAL** | **PASS** department publish tests |
| Author / journalist | via CMS + department | journalist | **PARTIAL** | **PASS** |
| Business / seller / org | account overview + role requests | applied roles | **PARTIAL** | Existing role-request / commerce tests; not re-skinned as identical dashboards |
| Creator | creator flows | creator | **PARTIAL** | Existing creator moderation queues |

Dashboards were refined for account notifications spacing; they were **not** rebuilt as a single template. Empty inventing of stats was avoided.

---

## E. Latest Official Stories & news subscription

| Capability | Status |
| --- | --- |
| Official list = original published articles only (no wires/demos/drafts) | **PASS** (unit test) |
| Homepage + `/news/official` display | **PASS** (live HTML) |
| Department / category filters | **PASS** |
| Subscribe free (in-app) | **PASS** |
| Optional email channel | **PARTIAL** — code path live; `.env` has SMTP values, but a fresh production inbox delivery was **NOT TESTED** in this session |
| Notify on publish once (`alerts_sent`) | **PASS** (unit test; republish does not duplicate) |
| Unsubscribe / pause | **PASS** (`enabled = 0`) |
| Browser push | **NOT TESTED** / **not implemented** as a working channel |
| Location-based fanout | **PASS** for subscriptions that set `location_id`; homepage preferred location remains separate |

---

## F. Technical

### Files changed (this pass)
- `src/app/globals.css` — header/search breakpoints, home-flow, cine-shortcuts, official/subscribe, account cards
- `src/components/chrome.tsx`, `primary-nav.tsx` — bar tools / More menu overflow
- `src/app/[locale]/page.tsx` — Official Stories + Subscribe wiring
- `src/components/official-stories.tsx`, `news-subscribe.tsx`, `main-editorial.tsx`
- `src/app/[locale]/[section]/[slug]/page.tsx` — `/news/official` + filters
- `src/app/[locale]/account/[[...tab]]/page.tsx` — official notification preferences
- `src/app/[locale]/auth/[action]/page.tsx` — preserve `next` on sign-up/verify
- `src/server/actions.ts` — `newsSubscribeAction`; sign-up/verify next
- `src/server/alerts.ts` — official subscribe/notify
- `src/server/editorial.ts` — publish → `notifyOfficialPublication`
- `src/server/newsedition.ts` — `listOfficialStories`
- `src/lib/safe-return.ts` — homepage + `?subscribe=1` + `/news/official`
- `src/lib/i18n.ts` — official/subscribe strings
- `tests/newsedition.test.ts`, `tests/safe-return.test.ts`

### Database
- Reuses `articles.alerts_sent`, `alert_subscriptions` (`category = 'official'`), `notifications`. No destructive migration required for this feature set.

### Tests / build
| Check | Result |
| --- | --- |
| `npm test` | **58/58 PASS** |
| `npm run typecheck` | **PASS** |
| `npm run build` | **PASS** (after clearing corrupted `.next`) |
| Live `/en`, `/en/news/official` | **200** with expected markers |
| Browser console / device screenshots | **NOT TESTED** in this session |

### Remaining blockers
1. **Google / Facebook OAuth** — provider app credentials.
2. **SMTP delivery proof** — host credentials are present in `.env`; send a controlled test mail in production to move email from PARTIAL to PASS.
3. **Web Push** — not claimed; would need VAPID + hosting support.
4. **Full GUI dashboard/mobile screenshot matrix** — deferred; HTTP + automated tests used instead.

---

## Honest summary

Homepage header collision and under-search congestion are repaired in CSS/nav structure. Latest Official Stories and free news subscription are connected end-to-end in code and automated tests (publish → in-app notification once). Social login remains **BLOCKED** without credentials. Email notifications are implemented but production delivery depends on SMTP. Push is not operational.
