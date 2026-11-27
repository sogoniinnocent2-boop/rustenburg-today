# Rustenburg Today — Centralise 32 department desks under 3 accounts

**Date:** 26 November 2026  
**Production URL:** https://www.rustenburgtoday.co.za  
**Deployment:** `a8469f56-4ce0-495a-a7e1-336b02548f51` (Online)  
**Evidence:** `evidence/dept-central/`

No passwords, hashes or session tokens are included in this report.

---

## Summary

The existing many-to-many table `department_assignments` was already the correct model. No schema rewrite was required.

Each of the three verified editors now has an explicit row for **all 32** manageable desks. One login opens a department hub + desk switcher; each desk still loads only that department’s records. Backend `requireAssigned` / `canPublishSection` checks remain on publish paths.

| Account | Departments assigned | Departments accessible | Publishing | Permission security |
| --- | ---: | ---: | --- | --- |
| News (`thabo.soke@…`) | 32 | 32 | PASS (local API matrix + sports sample) | PASS |
| Events (`innocent.sogoni@…`) | 32 | 32 | PASS (local API matrix + sports sample) | PASS |
| Business (`thato.selokwane@…`) | 32 | 32 | PASS (local API matrix + sports sample) | PASS |

---

## Database / migration

| Item | Status |
| --- | --- |
| Schema change | **Not required** — `department_assignments (user_id, section_slug)` already many-to-many |
| Production backup before assign | **PASS** — `/data/backups/rustenburg-centralise-1795727260717.db` |
| Assignments applied | **PASS** — 31 new rows per account (1 already held) → 32 each |
| Passwords / hashes preserved | **PASS** — no user password fields touched |
| Articles / media preserved | **PASS** |
| Uncovered desks after assign | **0** |
| Rollback | Restore the backup file over `/data/rustenburg.db` on the volume (stop writers first), or revoke excess assignments via Admin → Departments |

Central emails used (existing accounts only — no new staff created):

- `thabo.soke@rustenburgtoday.co.za`
- `innocent.sogoni@rustenburgtoday.co.za`
- `thato.selokwane@rustenburgtoday.co.za`

---

## Product changes shipped

1. **`assignAllManageableDepartments`** + Admin form “Assign all desks to one account”
2. **Desk coverage panel** (editors per section) and missing-desk callout
3. **Department hub** grouped by the 12 divisions
4. **DeskSwitcher** select (switch any assigned desk without logout)
5. **TV desk crash fix** — `videos` queried via `video_channels.owner_id` (was invalid `creator_id`)

Accountability: assignments and publishes continue to audit the authenticated user id; department slug stays on articles / desk actions.

---

## Production testing — 96 access combinations

| Metric | Result |
| --- | --- |
| Combinations (3 × 32) | 96 |
| HTTP desk workspace PASS | **96 / 96** |
| Fail | **0** |
| Unauthenticated desk blocked | **PASS** |
| Desk switcher present on workspaces | **PASS** |
| Unit tests (`tests/departments.test.ts`) | **7 / 7 PASS** |

Evidence: `evidence/dept-central/prod-96-access.json`, workspace HTML captures under `evidence/dept-central/workspace-*-sports.html`.

### Publishing

| Check | Result |
| --- | --- |
| `canPublishSection` for all 96 combos (local DB mirror of assignments) | **96 / 96 PASS** |
| Sample publish to sports per account; listed only under sports; archived after | **PASS** |
| Outsider publish blocked | **PASS** |
| Live production publish of 96 fake drafts | **NOT RUN** — avoided posting disposable live stories; access + permission matrix verified instead |

---

## Security

- Access is **assignment rows in the database**, not hardcoded emails in auth.
- Unassigned URLs still 404 / login for outsiders.
- Admin can still create dedicated staff later, assign one desk, assign all desks, or revoke per desk.
- Sessions unchanged (httpOnly `rt_session`).

---

## Outstanding

- Optional: run a supervised live publish drill on production for a non-public draft path if product owners want inbox-proof screenshots.
- Pixel screenshots of the switcher: HTML workspace captures used (no Playwright in repo).

---

## Acceptance

On production, each of the three existing accounts can open all **32** department desks from one login, switch desks without signing out, and keep per-department workspaces. **96 / 96** account×desk access checks passed after the TV desk fix deploy.
