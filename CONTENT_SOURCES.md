# Multi-source content — current state and implementation

## Phase 1 current-state report (inspected)

### How SAnews enters the platform
- Boot calls `installOfficialWires()` / `installCuratedSources()` from `src/server/init.ts`.
- SAnews is stored in `news_sources` with feed `https://www.sanews.gov.za/rss.xml`.
- Background worker (`src/server/worker.ts`, started from `src/instrumentation.ts`) calls `pullActiveSources()` about once a minute.
- Feed XML is parsed by `parseFeed` / `storeFeedItems` in `src/server/citydesk.ts`.
- Items land in `news_items` as `external_link` with `headline_only` rights by default: headline, short summary, original URL — not full republication.

### Existing ingestion infrastructure (extended, not replaced)
| Piece | Location |
|--------|----------|
| Source table | `news_sources` (migration `0004_citydesk`) |
| Wire items | `news_items` |
| Manual fetch / activate | Admin → Ingestion (`cityDeskAction` intent `ingest`) |
| Editorial queue | Admin → Editorial (`reviewNewsItem`) |
| Duplicate detection | `url_hash` + 72h headline/publisher match |
| Sensitive hold | keyword regex → `in_review` |
| Official auto-publish | non-sensitive official `headline_link` wires |

Sources are **database-managed**, not hardcoded (except curated seed list).

### Departments vs wire content (before multi-source expansion)
- Public taxonomy: `src/lib/sections.ts` (news, community, jobs, business, sports, health, technology, agriculture, …).
- Wire display was concentrated on **News** (`publishedNews` / `freshWires`) and the homepage edition.
- Other departments relied on their own modules (jobs listings, fixtures, etc.) or empty states.
- Original desk stories use `articles.department_slug` from department staff publish.

### Rights model already present
- `permitted_use`: `headline_link` | `licensed_summary` | `none`
- Required `rights_note` when registering a source
- Detail pages for wires open the original publisher; platform pages store metadata + link
- Non-sensitive `headline_link` items from `rss` / `atom` / `official` / `partner` sources auto-publish as link rows; sensitive keywords still go to editorial review

## What was implemented next

### Schema `0016_multisource`
- Columns on `news_sources`: `country`, `coverage`, `content_type`, `ingest_interval_minutes`, `last_success_at`
- Table `news_source_departments` (source → one or more section slugs)

### Curated independent feeds (`src/server/multisource.ts`)
Installed as **active**, `headline_link` only:
1. SAnews (official ZA)
2. BBC Africa
3. BBC World
4. BBC Business
5. BBC Science & Environment
6. BBC Sport
7. Al Jazeera English
8. WHO news
9. ReliefWeb updates

Each feed is mapped to relevant departments (news, business, sports, health, technology, agriculture, support, notices, voice where appropriate).

### Scheduling
- `sourcesDueForPull` / `pullDueSources` respect per-source intervals (15+ minutes).
- Worker continues to call `pullActiveSources()`, which now pulls **due** sources only so one failed feed does not block others forever and SAnews is not polled alone every tick for every provider.

### Admin
- New **Source coverage** tab: active counts, failed/stale sources, per-department coverage, single-source warnings, empty departments.

### Public pages
- Non-news department landings show **From independent sources** via `departmentWires(section)` when mapped published wires exist.
- News page copy states SAnews is one contributor among several.

### Tests
- `tests/multisource.test.ts` — catalog diversity, DB install/mapping, attributed wires, diversity report, interval gating.

## Still outstanding (honest gaps)
- Genuine **Rustenburg/North West local** RSS partners are scarce; local coverage still depends on department desk original journalism + future municipal/partner feeds.
- Jobs/education opportunity feeds are not auto-imported as vacancies (would invent opportunities) — keep verified employer/job desk flows.
- Live sports **scores APIs** are separate from sports **news** RSS; only news wires are seeded.
- Image republication is still not done (by design).
- Feed URLs can break upstream; admins use Ingestion + Coverage to pause/replace.
- Full Phase 7–9 polish (filters on every landing, duplicate monitor UI, copyright review queue UI) remains incremental on this foundation.

## Operator notes
1. Admin → **Ingestion**: Fetch / Activate / Pause per source.
2. Admin → **Source coverage**: see empty or single-source departments.
3. Admin → **Editorial desk**: approve held/sensitive wires.
4. Department staff continue to publish original updates at `/department`.
