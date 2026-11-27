# Rustenburg Today — Content Publishing System Report

**Date:** 26 November 2026  
**Verdict:** **PARTIAL → core PASS** for original article CMS → frontend publishing. Interactive browser screenshots **NOT TESTED** in this pass. Live media persistence after restart covered by existing upload storage under `DATA_DIR`.

---

## Acceptance condition

An authorised journalist/editor can create an article in the backend CMS, set department/category, save draft, submit, obtain approval/publish, and the article appears on the correct public department listing and `/news/[slug]` article page from the database.

**Automated journey:** **PASS** (`tests/cms-publishing.test.ts`)  
**Headed browser demo:** **NOT TESTED** this pass

---

## Backend features implemented

| Feature | Status |
| --- | --- |
| Content CMS desk at `/admin/cms` | **PASS** |
| All / Published / Drafts / Scheduled / Pending / Unpublished / Archived / Deleted filters | **PASS** |
| Create post (headline, excerpt, body, category, department, tags, SEO, image, location, schedule) | **PASS** |
| Save draft / submit / publish now / schedule | **PASS** |
| Edit + keep published (reindexes search) | **PASS** |
| Unpublish / archive / restore / soft-delete | **PASS** |
| Editorial audit list | **PASS** |
| Permissions server-side (`articles.create` / `review` / `publish`) | **PASS** |
| Scheduled publish via `publishDueArticles` + worker interval | **PASS** (existing worker) |
| Main Story Manager integration (eligible published originals only) | **PASS** (existing `/admin/hero`) |
| Wire review desk (external discoveries) | **PASS** (renamed Wire review) |

---

## Frontend sections connected

Published articles route by `department_slug` + category mapping:

| Category examples | Department surface |
| --- | --- |
| local-news, municipal, breaking | `/news` + newsroom |
| sports | `/sports` desk updates |
| education | `/learn` |
| business-mining | `/business` |
| health | `/health` |
| traffic | `/transport` |
| announcements | `/notices` |
| Article page | `/news/[slug]` always |

Listings use `listDepartmentStories` and `listArticles` — only `status = published`.

---

## Database

- Migration **`0020_article_location`**: `articles.location_id`
- Existing: `articles`, `article_translations`, `article_tags`, `article_revisions`, `main_editorial_slots`, search index

---

## API / actions

| Action | Purpose |
| --- | --- |
| `cmsAction` | Create/update/lifecycle for CMS |
| `newsAction` | Public `/news/new` create + submit/publish |
| `reviewNewsAction` | Approve/publish/schedule/remove |
| Services | `createArticle`, `updateArticle`, `submitArticle`, `reviewArticle`, `unpublishArticle`, `archiveArticle`, `restoreArticle`, `listManagedArticles`, `publishDueArticles` |

---

## Roles

| Role | CMS access |
| --- | --- |
| Journalist | Create, draft, submit; cannot publish unless granted `articles.publish` |
| Editor / Administrator | Full publish, unpublish, archive, restore, Main Story |
| Ordinary user | No `/admin/cms` |

---

## Media

- Featured image via `saveUploadFile` → persistent `DATA_DIR/uploads`
- Existing media library tab remains for photograph assets

---

## Tests

| Suite | Result |
| --- | --- |
| Full automated (`npm test`) | **55/55 PASS** |
| `tests/cms-publishing.test.ts` | draft → review → publish → department → search → update → unpublish → schedule → archive → restore **PASS** |
| Typecheck | **PASS** |
| Browser screenshots create→frontend | **NOT TESTED** |

Evidence: `evidence/cms-publishing/npm-test.txt`

---

## Outstanding

1. Headed browser screenshots of CMS create → public page (**NOT TESTED**)
2. Rich-text WYSIWYG (plain textarea with structured paragraphs) — **PARTIAL**
3. Additional gallery images beyond featured — **PARTIAL** (featured + media library)
4. Cache CDN invalidation N/A for dynamic SQLite RSC fetches

---

## Files touched (selected)

- `src/server/editorial.ts` — lifecycle + managed lists + routing
- `src/server/db.ts` — `0020_article_location`
- `src/server/actions.ts` — `cmsAction`, enhanced `newsAction`
- `src/components/content-cms.tsx` — CMS UI
- `src/components/city-admin.tsx` — Content tab
- `src/app/[locale]/admin/[[...tab]]/page.tsx` — CMS query params + journalist access
- `src/app/[locale]/[section]/new/page.tsx` — richer news form
- `tests/cms-publishing.test.ts`
