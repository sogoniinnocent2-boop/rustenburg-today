import { sections } from "@/lib/sections";
import { all, get, newId, run } from "./db";
import { ensureReady } from "./init";
import { pullSource } from "./citydesk";

type SeedSource = {
  name: string;
  kind: "rss" | "atom" | "official" | "partner";
  feedUrl: string;
  homepageUrl: string;
  publisher: string;
  region: string;
  categorySlug: string;
  country: string;
  coverage: string;
  contentType: string;
  rightsNote: string;
  permittedUse: "headline_link" | "licensed_summary";
  intervalMinutes: number;
  departments: string[];
};

/** Public RSS/Atom feeds used as headline+link discovery only unless rights say otherwise. */
const CURATED: SeedSource[] = [
  {
    name: "SAnews",
    kind: "official",
    feedUrl: "https://www.sanews.gov.za/rss.xml",
    homepageUrl: "https://www.sanews.gov.za/",
    publisher: "SAnews",
    region: "national",
    categorySlug: "government",
    country: "ZA",
    coverage: "South Africa national government news",
    contentType: "official_news",
    rightsNote: "GCIS RSS for syndication. Store headline, short summary, date and original link only. Do not copy full articles or photographs.",
    permittedUse: "headline_link",
    intervalMinutes: 30,
    departments: ["news", "notices", "voice"],
  },
  {
    name: "BBC Africa",
    kind: "rss",
    feedUrl: "https://feeds.bbci.co.uk/news/world/africa/rss.xml",
    homepageUrl: "https://www.bbc.com/news/world/africa",
    publisher: "BBC News",
    region: "africa",
    categorySlug: "africa",
    country: "GB",
    coverage: "African continent news",
    contentType: "wire_news",
    rightsNote: "BBC public RSS. Headline, summary snippet and link only. Full text and images remain with BBC.",
    permittedUse: "headline_link",
    intervalMinutes: 45,
    departments: ["news"],
  },
  {
    name: "BBC World",
    kind: "rss",
    feedUrl: "https://feeds.bbci.co.uk/news/world/rss.xml",
    homepageUrl: "https://www.bbc.com/news/world",
    publisher: "BBC News",
    region: "international",
    categorySlug: "world",
    country: "GB",
    coverage: "International news",
    contentType: "wire_news",
    rightsNote: "BBC public RSS. Headline, summary snippet and link only.",
    permittedUse: "headline_link",
    intervalMinutes: 45,
    departments: ["news"],
  },
  {
    name: "BBC Business",
    kind: "rss",
    feedUrl: "https://feeds.bbci.co.uk/news/business/rss.xml",
    homepageUrl: "https://www.bbc.com/news/business",
    publisher: "BBC News",
    region: "business",
    categorySlug: "business",
    country: "GB",
    coverage: "Business and economy",
    contentType: "wire_news",
    rightsNote: "BBC public RSS. Headline, summary snippet and link only.",
    permittedUse: "headline_link",
    intervalMinutes: 60,
    departments: ["business", "news"],
  },
  {
    name: "BBC Science & Environment",
    kind: "rss",
    feedUrl: "https://feeds.bbci.co.uk/news/science_and_environment/rss.xml",
    homepageUrl: "https://www.bbc.com/news/science_and_environment",
    publisher: "BBC News",
    region: "technology",
    categorySlug: "science",
    country: "GB",
    coverage: "Science, environment and technology",
    contentType: "wire_news",
    rightsNote: "BBC public RSS. Headline, summary snippet and link only.",
    permittedUse: "headline_link",
    intervalMinutes: 90,
    departments: ["technology", "agriculture", "news"],
  },
  {
    name: "BBC Sport",
    kind: "rss",
    feedUrl: "https://feeds.bbci.co.uk/sport/rss.xml",
    homepageUrl: "https://www.bbc.com/sport",
    publisher: "BBC Sport",
    region: "sport",
    categorySlug: "sport",
    country: "GB",
    coverage: "International and African sport news",
    contentType: "sports_news",
    rightsNote: "BBC public RSS. Headline, summary snippet and link only. Not a live scores API.",
    permittedUse: "headline_link",
    intervalMinutes: 30,
    departments: ["sports", "news"],
  },
  {
    name: "Al Jazeera English",
    kind: "rss",
    feedUrl: "https://www.aljazeera.com/xml/rss/all.xml",
    homepageUrl: "https://www.aljazeera.com/",
    publisher: "Al Jazeera",
    region: "international",
    categorySlug: "world",
    country: "QA",
    coverage: "International and African news",
    contentType: "wire_news",
    rightsNote: "Al Jazeera public RSS. Headline, summary and link only.",
    permittedUse: "headline_link",
    intervalMinutes: 45,
    departments: ["news"],
  },
  {
    name: "WHO news",
    kind: "rss",
    feedUrl: "https://www.who.int/rss-feeds/news-english.xml",
    homepageUrl: "https://www.who.int/news",
    publisher: "World Health Organization",
    region: "health",
    categorySlug: "health",
    country: "CH",
    coverage: "Global public health notices and research headlines",
    contentType: "health_official",
    rightsNote: "WHO public news RSS. Headline, summary and link only. Not medical advice.",
    permittedUse: "headline_link",
    intervalMinutes: 120,
    departments: ["health", "news"],
  },
  {
    name: "ReliefWeb updates",
    kind: "rss",
    feedUrl: "https://reliefweb.int/updates/rss.xml",
    homepageUrl: "https://reliefweb.int/",
    publisher: "ReliefWeb / OCHA",
    region: "africa",
    categorySlug: "humanitarian",
    country: "INT",
    coverage: "Humanitarian and crisis updates including Africa",
    contentType: "official_updates",
    rightsNote: "ReliefWeb public RSS. Headline, summary and link only.",
    permittedUse: "headline_link",
    intervalMinutes: 90,
    departments: ["news", "support", "health"],
  },
];

export function setSourceDepartments(sourceId: string, sectionSlugs: string[]): void {
  ensureReady();
  const allowed = new Set(sections.map((section) => section.slug));
  run("DELETE FROM news_source_departments WHERE source_id = ?", sourceId);
  for (const slug of [...new Set(sectionSlugs.map((item) => item.trim().toLowerCase()))]) {
    if (!allowed.has(slug)) continue;
    run("INSERT OR IGNORE INTO news_source_departments (source_id, section_slug) VALUES (?, ?)", sourceId, slug);
  }
}

export function installCuratedSources(): void {
  ensureReady();
  const stamp = new Date().toISOString();
  for (const source of CURATED) {
    const existing = get<{ id: string }>("SELECT id FROM news_sources WHERE feed_url = ?", source.feedUrl);
    if (existing) {
      setSourceDepartments(existing.id, source.departments);
      run(
        "UPDATE news_sources SET country = COALESCE(country, ?), coverage = COALESCE(coverage, ?), content_type = COALESCE(content_type, ?), ingest_interval_minutes = COALESCE(NULLIF(ingest_interval_minutes, 0), ?) WHERE id = ?",
        source.country,
        source.coverage,
        source.contentType,
        source.intervalMinutes,
        existing.id,
      );
      continue;
    }
    const id = newId();
    run(
      `INSERT INTO news_sources (
        id, name, kind, feed_url, homepage_url, publisher, region, category_slug, rights_note, permitted_use,
        auto_breaking, status, country, coverage, content_type, ingest_interval_minutes, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'active', ?, ?, ?, ?, ?)`,
      id,
      source.name,
      source.kind,
      source.feedUrl,
      source.homepageUrl,
      source.publisher,
      source.region,
      source.categorySlug,
      source.rightsNote,
      source.permittedUse,
      source.country,
      source.coverage,
      source.contentType,
      source.intervalMinutes,
      stamp,
    );
    setSourceDepartments(id, source.departments);
  }
}

export function sourcesDueForPull(now = Date.now()): Array<{ id: string; name: string }> {
  ensureReady();
  return all<{ id: string; name: string; last_checked_at: string | null; ingest_interval_minutes: number | null }>(
    "SELECT id, name, last_checked_at, ingest_interval_minutes FROM news_sources WHERE status = 'active' AND feed_url IS NOT NULL",
  ).filter((source) => {
    const minutes = Math.max(15, Number(source.ingest_interval_minutes) || 60);
    if (!source.last_checked_at) return true;
    const checked = Date.parse(source.last_checked_at);
    if (!Number.isFinite(checked)) return true;
    return now - checked >= minutes * 60_000;
  });
}

export async function pullDueSources(): Promise<{ attempted: number; failed: number }> {
  ensureReady();
  const due = sourcesDueForPull();
  let failed = 0;
  for (const source of due) {
    const before = get<{ last_error: string | null }>("SELECT last_error FROM news_sources WHERE id = ?", source.id);
    await pullSource(source.id);
    const after = get<{ last_error: string | null; last_status_code: number | null }>(
      "SELECT last_error, last_status_code FROM news_sources WHERE id = ?",
      source.id,
    );
    if (after?.last_error) failed += 1;
    else if (after && (after.last_status_code == null || after.last_status_code < 400)) {
      run("UPDATE news_sources SET last_success_at = ? WHERE id = ?", new Date().toISOString(), source.id);
    } else if (before?.last_error && !after?.last_error) {
      run("UPDATE news_sources SET last_success_at = ? WHERE id = ?", new Date().toISOString(), source.id);
    }
  }
  return { attempted: due.length, failed };
}

export function departmentWires(section: string, limit = 12): Array<Record<string, unknown>> {
  ensureReady();
  const slug = section.trim().toLowerCase();
  return all(
    `SELECT n.id, n.slug, n.headline, n.summary, n.publisher, n.author_name, n.category_slug, n.region,
            n.original_published_at, n.canonical_url, n.story_kind, n.breaking, n.sponsored, s.name as source_name
     FROM news_items n
     JOIN news_sources s ON s.id = n.source_id
     JOIN news_source_departments d ON d.source_id = s.id
     WHERE n.status = 'published' AND d.section_slug = ?
     ORDER BY COALESCE(n.published_at, n.discovered_at) DESC
     LIMIT ?`,
    slug,
    Math.min(Math.max(limit, 1), 40),
  );
}

export function sourceDiversityReport(): {
  sources: Array<Record<string, unknown>>;
  departments: Array<Record<string, unknown>>;
  totals: { sources: number; active: number; failed: number; stale: number; items: number };
} {
  ensureReady();
  const sources = all<Record<string, unknown>>(
    `SELECT s.id, s.name, s.publisher, s.status, s.region, s.country, s.last_checked_at, s.last_success_at, s.last_error,
            s.ingest_interval_minutes,
            (SELECT COUNT(*) FROM news_items n WHERE n.source_id = s.id) as discovered,
            (SELECT COUNT(*) FROM news_items n WHERE n.source_id = s.id AND n.status = 'published') as published,
            (SELECT GROUP_CONCAT(section_slug, ', ') FROM news_source_departments d WHERE d.source_id = s.id) as departments
     FROM news_sources s
     ORDER BY s.name`,
  );
  const departments = sections.map((section) => {
    const activeSources = Number(
      get<{ total: number }>(
        `SELECT COUNT(*) as total FROM news_source_departments d
         JOIN news_sources s ON s.id = d.source_id
         WHERE d.section_slug = ? AND s.status = 'active'`,
        section.slug,
      )?.total || 0,
    );
    const published = Number(
      get<{ total: number }>(
        `SELECT COUNT(*) as total FROM news_items n
         JOIN news_source_departments d ON d.source_id = n.source_id
         WHERE d.section_slug = ? AND n.status = 'published'`,
        section.slug,
      )?.total || 0,
    );
    return {
      section: section.slug,
      activeSources,
      published,
      singleSource: activeSources === 1,
      empty: published === 0,
    };
  });
  const staleCut = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  return {
    sources,
    departments,
    totals: {
      sources: sources.length,
      active: sources.filter((row) => String(row.status) === "active").length,
      failed: sources.filter((row) => Boolean(row.last_error)).length,
      stale: sources.filter((row) => String(row.status) === "active" && (!row.last_success_at || String(row.last_success_at) < staleCut)).length,
      items: Number(get<{ total: number }>("SELECT COUNT(*) as total FROM news_items")?.total || 0),
    },
  };
}

export function curatedSourceCatalog(): SeedSource[] {
  return CURATED.map((item) => ({ ...item, departments: [...item.departments] }));
}
