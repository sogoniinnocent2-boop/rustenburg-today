# Rustenburg Today — Department login and access test

**Date:** 26 November 2026  
**Production URL:** https://www.rustenburgtoday.co.za  
**Evidence folder:** `evidence/department-access/`

Passwords, password hashes, session tokens and one-time secret files are **not** included in this report.

---

## System inspection

| Item | Finding |
| --- | --- |
| Auth | Email/password via `loginAccount` → httpOnly `rt_session` cookie |
| Desk route | `/[locale]/department` and `/[locale]/department/[slug]` |
| Permission model | `department_assignments` + role `department_editor` + `departments.publish`; admins/editors bypass assignment |
| Backend enforcement | `canPublishSection` / `requireAssigned` / `publishDeskStory` throw 403 when not assigned |
| Manageable desks | **32** section desks (catalog excludes `map`, `briefing`, `ask`, `productivity`) |
| Divisions | **12** navigation divisions in `src/lib/divisions.ts` |
| Production DB | 6 users; **3** department assignments (news, events, business) + administrator |
| Local DB | Same 3 department staff + administrator (+ extra non-staff users) |

### Existing authorised accounts (production)

| Email | Status | Role | Assigned department |
| --- | --- | --- | --- |
| `admin@rustenburg.today` | active | administrator | all manageable desks |
| `thabo.soke@rustenburgtoday.co.za` | active | department_editor | news |
| `innocent.sogoni@rustenburgtoday.co.za` | active | department_editor | events |
| `thato.selokwane@rustenburgtoday.co.za` | active | department_editor | business |

No journalist-named role accounts were present. No suspended/pending department staff were present. No shared multi-department login was found among the three editors.

---

## Results table (all manageable departments)

Statuses: **PASS** / **PARTIAL** / **FAIL** / **BLOCKED** / **NOT TESTED**

| Division | Department | Account exists | Login | Dashboard | Permissions | Result |
| --- | --- | --- | --- | --- | --- | --- |
| news | news | PASS | PASS | PASS | PASS | PASS |
| news | podcasts | FAIL | BLOCKED | BLOCKED | BLOCKED | BLOCKED |
| news | tv | FAIL | BLOCKED | BLOCKED | BLOCKED | BLOCKED |
| news | radio | FAIL | BLOCKED | BLOCKED | BLOCKED | BLOCKED |
| news | music | FAIL | BLOCKED | BLOCKED | BLOCKED | BLOCKED |
| events | events | PASS | PASS | PASS | PASS | PASS |
| events | competitions | FAIL | BLOCKED | BLOCKED | BLOCKED | BLOCKED |
| market | marketplace | FAIL | BLOCKED | BLOCKED | BLOCKED | BLOCKED |
| property | property | FAIL | BLOCKED | BLOCKED | BLOCKED | BLOCKED |
| business | business | PASS | PASS | PASS | PASS | PASS |
| business | advertising | FAIL | BLOCKED | BLOCKED | BLOCKED | BLOCKED |
| business | deals | FAIL | BLOCKED | BLOCKED | BLOCKED | BLOCKED |
| learn | learn | FAIL | BLOCKED | BLOCKED | BLOCKED | BLOCKED |
| jobs | jobs | FAIL | BLOCKED | BLOCKED | BLOCKED | BLOCKED |
| community | community | FAIL | BLOCKED | BLOCKED | BLOCKED | BLOCKED |
| discover | tourism | FAIL | BLOCKED | BLOCKED | BLOCKED | BLOCKED |
| discover | transport | FAIL | BLOCKED | BLOCKED | BLOCKED | BLOCKED |
| discover | services | FAIL | BLOCKED | BLOCKED | BLOCKED | BLOCKED |
| talent | talent | FAIL | BLOCKED | BLOCKED | BLOCKED | BLOCKED |
| talent | creators | FAIL | BLOCKED | BLOCKED | BLOCKED | BLOCKED |
| life | food | FAIL | BLOCKED | BLOCKED | BLOCKED | BLOCKED |
| life | sports | FAIL | BLOCKED | BLOCKED | BLOCKED | BLOCKED |
| life | youth | FAIL | BLOCKED | BLOCKED | BLOCKED | BLOCKED |
| life | health | FAIL | BLOCKED | BLOCKED | BLOCKED | BLOCKED |
| life | family | FAIL | BLOCKED | BLOCKED | BLOCKED | BLOCKED |
| life | agriculture | FAIL | BLOCKED | BLOCKED | BLOCKED | BLOCKED |
| life | faith | FAIL | BLOCKED | BLOCKED | BLOCKED | BLOCKED |
| city | voice | FAIL | BLOCKED | BLOCKED | BLOCKED | BLOCKED |
| city | history | FAIL | BLOCKED | BLOCKED | BLOCKED | BLOCKED |
| city | notices | FAIL | BLOCKED | BLOCKED | BLOCKED | BLOCKED |
| city | support | FAIL | BLOCKED | BLOCKED | BLOCKED | BLOCKED |
| city | technology | FAIL | BLOCKED | BLOCKED | BLOCKED | BLOCKED |

Administrator (not a department row): login **PASS**, all desks **PASS**, `users.manage` **PASS**.

---

## Totals

| Metric | Count |
| --- | --- |
| Departments tested (manageable catalog) | **32** |
| Working department accounts (exist + login + desk + perms) | **3** |
| Missing accounts | **29** |
| Failed logins (among existing accounts) | **0** |
| Dashboard failures (among existing accounts) | **0** |
| Permission failures (among existing accounts) | **0** |
| Auth guard checks passed | invalid password, unknown account, suspended rejection, password-reset token create |
| Bugs fixed | **1** (admin UI: list desks still missing staff) |
| Automated unit tests (`tests/departments.test.ts`) | **6/6 PASS** |
| Production HTTP login suite | **6/6 PASS** (2 guards + admin + 3 editors) |
| Accounts still requiring administrator action | **29** missing department desks |

---

## What was verified for the 3 existing desks

### Production HTTP (`https://www.rustenburgtoday.co.za`)
- Correct password → 303 to `/en/department` with `rt_session`
- Wrong password / unknown email → 303 to sign-in with `Email or password is incorrect`, no session
- Desk list shows the signed-in person and their assigned desk only
- Own desk URL (`/en/department/news|events|business`) opens with Story update workspace
- Foreign desk URL (`/en/department/sports`) returns **404** for non-assigned editors
- Admin sees all manageable desks

### Local API / DB
- Session create + logout
- `canPublishSection` true only for assigned section
- Own `publishDeskArticle` succeeds; foreign section throws “You are not assigned to this department”
- Published story appears in `listDepartmentStories` for the own section
- Suspended account rejected
- Password reset token created for known user; unknown email returns null token

### Dashboard evidence (HTML captures, secrets redacted)
- `evidence/department-access/dashboard-thabo.soke@rustenburgtoday.co.za.html`
- `evidence/department-access/dashboard-innocent.sogoni@rustenburgtoday.co.za.html`
- `evidence/department-access/dashboard-thato.selokwane@rustenburgtoday.co.za.html`
- `evidence/department-access/http-login-results.json`
- `evidence/department-access/prod-audit.json`
- `evidence/department-access/publish-isolation.json`
- `evidence/department-access/local-login-results.json`

Pixel screenshots were **NOT TESTED** (no browser automation package in the repo); HTML dashboard captures are the evidence pack.

Mobile/desktop login responsiveness: viewport meta present on desk login; dedicated device matrix **NOT TESTED**.

---

## Publishing / CMS notes

| Check | Status |
| --- | --- |
| Own-desk publish (local API) | PASS for news, events, business |
| Cross-desk publish blocked | PASS |
| Production live publish of a new article | NOT TESTED (avoided posting fake live stories) |
| Headline vs Body selector on desk | Deployed in CMS code; production UI drill NOT TESTED this pass |
| Main Editorial Story control | Separate editorial permission path; NOT TESTED this pass |

---

## Administration

Admin → Departments can:
- Create department staff (one-time password under `data/` on the server volume)
- Assign additional departments to an existing email
- Revoke a department assignment

**Fix shipped:** Admin Departments panel now lists every manageable desk that still has **no** staff assignment (amber callout).  

**Build fix:** Removed a broken `scripts/audit-department-accounts.ts` import of `better-sqlite3` that caused the Railway redeploy typecheck to fail. Audit tooling remains as `scripts/audit-department-accounts.mjs` (`node:sqlite`).

SMTP: configured on Railway previously; inbox delivery of invites/resets was **NOT TESTED** in this pass. Reset **token creation** works.

---

## Outstanding administrator actions

Create or assign a `department_editor` for each missing desk (29):

`community, podcasts, tv, radio, music, talent, marketplace, jobs, learn, advertising, property, food, sports, youth, support, transport, tourism, health, voice, deals, competitions, history, services, agriculture, faith, family, technology, notices, creators`

Suggested role per desk: **department_editor** with a single `department_assignments` row (or multiple rows only when one person intentionally covers several desks).

Keep **one** production replica while SQLite remains the database.

---

## Honest completion status

Department authentication is **not** 100% complete across all departments: only **3 of 32** desks have verified accounts.  

For those three, login, dashboard, and backend permission separation are **PASS** on production. The remaining 29 are **BLOCKED** on missing accounts — not on broken login code.
