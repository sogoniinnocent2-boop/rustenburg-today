# Phase 2 evidence report — News homepage and editorial departments

**Date:** 26 November 2026  
**Branch:** `main` (local working tree; **not deployed**)

## 1. Phase 1 pre-check

| Check | Result |
| --- | --- |
| Git | `main`; uncommitted Phase 2+ files present; `PHASE_ZERO_AUDIT.md` untracked |
| Phase Zero | Present (`PHASE_ZERO_AUDIT.md`) |
| Phase 1 foundation | Logo, locale chrome, multi-source **code** already shipped earlier |
| Blockers | None blocking a safe Phase 2 reader newsroom on existing SQLite/models |
| Preserve | 12 divisions / 36 sections left intact; no DB wipe |

## 2. Already present before Phase 2

- Articles CMS statuses, `listArticles`, `is_featured`, `view_count`
- Wire items + `breaking` on `news_items`, top-five slots, `homeEdition`
- Category chips via `article_categories`
- Department desk stories

## 3. Implemented in Phase 2

- Editorial category map (`src/lib/editorial-categories.ts`) aligned to Master Prompt areas, **mapped onto** existing `article_categories` (extended seeds; nothing removed)
- Newsroom homepage (`NewsroomHome`) on `/[locale]/news`: breaking, featured, top, latest, most-read, trending, topic sections — **only from DB**; empty sections omitted
- Editorial landings `/news/{editorial-slug}` with featured + list + pagination + honest empty state
- Local/NW filter rejects non-local national wires for the Local section
- `articles.is_breaking` (migration `0017_editorial_news`) + editor Mark/Clear breaking controls
- Automated tests in `tests/newsedition.test.ts`

## 4–8. Files / DB / API / routes

**Created:** `editorial-categories.ts`, `newsedition.ts`, `newsroom.tsx`, `tests/newsedition.test.ts`, this report  

**Modified:** `[section]/page.tsx`, `[slug]/page.tsx`, `db.ts`, `seed.ts`, `actions.ts`, `city-admin.tsx` (Phase 3 department map on source form)

**DB:** `0017_editorial_news` adds `articles.is_breaking`  

**API:** server action `article-breaking`  

**Routes:** same URLs; `/news` and `/news/{editorial|category|article|wire}` behaviour upgraded

## 9–11. Screenshots

Not captured in this pass (no browser automation run). Verify locally at `/en/news`, `/en/news/local`, `/en/news/politics`.

## 12–13. Tests

- `npm run typecheck` — pass (after fixes)
- `npm test` — **49/49 pass**, including 5 newsedition tests
- Browser journeys — **NOT TESTED** in automation this pass

## 14. Performance

Homepage queries are bounded (limits per section; de-duplication). Does not load every article into the client.

## 15. Remaining defects

- Most-read/trending only cover **articles** with real views/reactions (wires lack view_count)
- Full Master homepage block list is grouped/omitted when empty — correct, but sparse until more content exists
- No dedicated `/news/search` UI beyond global search + newsroom link

## 16. Content-source limitations (→ Phase 3)

- Diversity depends on ingested/published wires + original articles
- Local NW RSS partners remain scarce
- Local DB may lag production migrations until boot

## 17. Deferred

- Full source-ingestion product polish → Phase 3  
- Full CMS journalist UI → Phase 4/CMS phase  
- NFIS, newsletter, sitemaps → later phases  

## 18. Requirement status

| Requirement | Status |
| --- | --- |
| News homepage hierarchy from real data | Implemented but not fully browser-tested |
| Breaking (backend-controlled) | Implemented but not fully browser-tested |
| Featured / Top / Latest / Most read / Trending | Implemented but not fully browser-tested |
| Editorial nav + department pages | Implemented but not fully browser-tested |
| Rustenburg/NW integrity filter | Fully implemented and tested (automated) |
| No invented stories | Fully implemented and tested (automated) |
| Search/filter news | Partially implemented (global search + category pages) |
| Mobile/desktop screenshots | Not implemented (evidence gap) |

**Honest completion:** Phase 2 **reader newsroom structure is in code and covered by automated tests**. It is **not** signed off as “fully browser-verified” without a manual/device pass.
