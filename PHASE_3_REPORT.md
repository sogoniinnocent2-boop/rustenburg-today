# Phase 3 evidence report — Multi-source engine

**Date:** 26 November 2026  
**Deploy:** **Not deployed** (per phase boundary)

## Phase 2 pre-check

Phase 2 newsroom homepage/department pages are in the working tree and covered by `tests/newsedition.test.ts`. Automated suite 49/49 after Phase 2 fixes.

## Existing ingestion (before this pass)

Already in repo from earlier work:

- `news_sources` / `news_items`, curated catalog (SAnews, BBC, Al Jazeera, WHO, ReliefWeb)
- `pullDueSources`, intervals, diversity report, admin Coverage + Ingest + Editorial
- `news_source_departments`, auto-publish non-sensitive `headline_link`
- `tests/multisource.test.ts`

## Added in this pass

- Admin **Source form** department checkboxes
- On save: `setSourceDepartments(sourceId, departments)` from `cityDeskAction`

## Sources actually connected

| Source family | Configured in code | Connection tested here | Notes |
| --- | --- | --- | --- |
| SAnews + BBC + AJ + WHO + ReliefWeb | Yes (curated seed) | Automated catalog/install tests | Live prod retrieval not re-verified this pass |
| New admin-added feeds | Form supports RSS/Atom/etc. | Not live-tested this pass | Saved paused until activated |

## Status honesty

| Capability | Status |
| --- | --- |
| Source Manager (add/pause/activate/ingest/coverage) | Partially implemented (extended this pass) |
| Multi-source retrieval | Partially implemented (existing engine) |
| Duplicate detection | Implemented but not fully tested (url_hash / 72h) |
| Department mapping | Implemented but not fully browser-tested |
| Geographic NW classification | Partial (Phase 2 local filter + region fields) |
| Rights modes A–E | Partial (headline_link / licensed_summary / original) |
| Full Content Control Centre UI (14 panels) | Partially implemented / interface gaps remain |
| SSRF / oversized feed hard tests | Not implemented as dedicated suite this pass |

## Remaining / Phase 4+

- Richer classification confidence + admin correction UI  
- Duplicate review queue UI  
- More ZA/NW institutional feeds (need real permitted URLs)  
- API source types beyond RSS where credentials exist  

**Stop for review before treating Phase 3 as launch-complete.**
