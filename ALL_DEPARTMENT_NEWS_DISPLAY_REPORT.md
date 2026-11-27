# Rustenburg Today — All-department news publishing (Headline / Body)

**Date:** 26 November 2026  
**Evidence:** `evidence/news-display/`

## Summary

Authorised departments can publish original news through the existing CMS (`/admin/cms`) with a persisted **News display type** (`headline` | `body`) and **Editorial priority** (`breaking` | `top` | `important` | `standard`). Classification is enforced on the backend, limited by headline quotas, routed on the public site, and covered by department-by-department automated tests.

Main Editorial Story remains separately controlled and is **not** overwritten when Headline News is selected.

---

## Departments discovered (news publishing)

| # | Slug | Label | Publish via CMS | Body tested | Headline tested |
| --- | --- | --- | --- | --- | --- |
| 1 | `news` | News and Journalism | Yes | **PASS** | **PASS** |
| 2 | `sports` | Sports and Recreation | Yes | **PASS** | **PASS** |
| 3 | `business` | Business and Economy | Yes | **PASS** | **PASS** |
| 4 | `learn` | Education and Learning | Yes | **PASS** | **PASS** |
| 5 | `health` | Health and Wellness | Yes | **PASS** | **PASS** |
| 6 | `voice` | Public Voice and Municipal Accountability | Yes | **PASS** | **PASS** |
| 7 | `agriculture` | Agriculture and Farming | Yes | **PASS** | **PASS** |
| 8 | `technology` | Technology and Innovation | Yes | **PASS** | **PASS** |
| 9 | `youth` | Youth and Children | Yes | **PASS** | **PASS** |
| 10 | `community` | Community Help and Social Impact | Yes | **PASS** | **PASS** |
| 11 | `tourism` | Tourism and Discover Rustenburg | Yes | **PASS** | **PASS** |
| 12 | `jobs` | Jobs and Opportunities | Yes | **PASS** | **PASS** |
| 13 | `events` | Events | Yes | **PASS** | **PASS** |
| 14 | `notices` | Public Notices | Yes | **PASS** | **PASS** |
| 15 | `transport` | Transport | Yes | **PASS** | **PASS** |
| 16 | `food` | Food | Yes | **PASS** | **PASS** |
| 17 | `family` | Family | Yes | **PASS** | **PASS** |
| 18 | `faith` | Faith | Yes | **PASS** | **PASS** |
| 19 | `services` | Services | Yes | **PASS** | **PASS** |
| 20 | `support` | Community Support | Yes | **PASS** | **PASS** |
| 21 | `history` | History and Heritage | Yes | **PASS** | **PASS** |
| 22 | `creators` | Creators | Yes | **PASS** | **PASS** |

**12 divisions** (navigation groups) remain unchanged in `src/lib/divisions.ts`.  
Marketplace, property, advertising, media-only desks, map/briefing/ask/productivity stay outside this news CMS list (they keep their own module desks).

Evidence: `tests/news-display.test.ts` → “every publishing department can create body and headline news” **PASS**.

---

## Classification model

| Field | Values | Behaviour |
| --- | --- | --- |
| `news_display_type` | `headline`, `body` | Headline → homepage Headline News + department headline band (subject to quotas). Body → departmental feeds + Latest Official Stories (body). |
| `editorial_priority` | `breaking`, `top`, `important`, `standard` | Independent of display type. Breaking forces headline + `is_breaking` + breaking fanout on publish. |
| `headline_expires_at` | ISO timestamp | Defaults to +7 days for headlines; expiry demotes to body without unpublishing. |
| Quotas | 8 site-wide / 3 per department | Enforced on publish; excess returns **409**. |

Synced for compatibility: `is_featured` ↔ headline, `is_breaking` ↔ breaking priority.

---

## Permissions

| Role | Create | Choose Body/Headline | Breaking / Top | Publish |
| --- | --- | --- | --- | --- |
| Journalist | Yes | Requested | Denied unless assigned editor desk | Submit for approval (or assigned desk publish) |
| Department editor (assigned) | Via desk/CMS | Yes for their dept | Yes for their dept | Yes for assigned section |
| Editor / administrator | Yes | Yes | Yes | Yes across departments |

Desk publish now uses the article’s **own** `department_slug` for `canPublishSection` (not hard-coded `news`).

---

## Frontend routing

| Surface | Headline | Body |
| --- | --- | --- |
| Homepage | Headline News band (`listHeadlineStories`) | Latest Official Stories (body filter) |
| Main Editorial Story | Unchanged manager | Unchanged |
| `/news/official` | Filter `display=headline` | Filter `display=body` |
| Department pages | “Headline News” grid | Desk updates / body grid |
| Search / article URL | Both remain discoverable | Both |

---

## Database / API

**Migration `0021_news_display`** (`src/server/db.ts`):
- `articles.news_display_type`
- `articles.editorial_priority`
- `articles.headline_expires_at`
- Indexes + backfill from `is_featured` / `is_breaking`

**CMS form fields:** `displayType`, `priority`, `headlineExpires`  
**Actions:** `cmsAction` → `createArticle` / `updateArticle`  
**Helpers:** `expireHeadlineSlots`, `listHeadlineStories`, expanded `NEWS_PUBLISHING_DEPARTMENTS`

---

## Tests

| Check | Result |
| --- | --- |
| Full suite including news-display | **62/62 PASS** |
| Per-department body + headline publish | **PASS** (22 desks) |
| Reclassify headline → body | **PASS** |
| Main Editorial not auto-cleared | **PASS** |
| Headline quota enforcement | **PASS** |
| `tsc --noEmit` | **PASS** |
| Interactive CMS screenshots | **NOT TESTED** (no GUI browser automation this session) |
| Live SMTP breaking email | **NOT TESTED** |

---

## Remaining blockers

1. GUI screenshots of the CMS dropdowns / live homepage headline band — **NOT TESTED** here; HTML/CMS code paths are in place.
2. Non-news modules (marketplace, property, etc.) are intentionally not in the news CMS list.
3. Web push still not implemented (unchanged).

## Files touched

- `src/lib/news-display.ts` (new)
- `src/server/db.ts`, `editorial.ts`, `newsedition.ts`, `actions.ts`
- `src/components/content-cms.tsx`, `official-stories.tsx`
- `src/app/[locale]/page.tsx`, `[section]/page.tsx`, `[section]/[slug]/page.tsx`
- `src/app/globals.css`, `src/lib/i18n.ts`
- `tests/news-display.test.ts`
