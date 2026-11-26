import { ARTICLE_CATEGORY_SEEDS, EDITORIAL_CATEGORIES, editorialBySlug, isLocalNorthwestText, type EditorialCategory } from "@/lib/editorial-categories";
import { all, get, newId, run } from "./db";
import { ensureReady } from "./init";
import { AppError } from "./errors";
import type { SessionUser } from "./auth";
import { requirePermission } from "./permissions";
import { audit } from "./store";
import { topFive, type TopStory } from "./citydesk";
import { expireHeadlineSlots, listArticles, type ArticleCard } from "./editorial";

export type NewsStoryCard = {
  key: string;
  kind: "article" | "wire";
  href: string;
  external: boolean;
  headline: string;
  summary: string;
  category: string;
  categorySlug: string;
  author: string | null;
  source: string;
  published: string | null;
  image: string | null;
  original: boolean;
  breaking: boolean;
  region: string | null;
  viewCount: number;
  displayType?: "headline" | "body";
  priority?: string;
};

function articleToCard(row: ArticleCard): NewsStoryCard {
  return {
    key: `article:${row.id}`,
    kind: "article",
    href: `/news/${row.slug}`,
    external: false,
    headline: row.title,
    summary: row.excerpt,
    category: row.category,
    categorySlug: row.categorySlug,
    author: row.author,
    source: row.demo ? "Demonstration" : "Rustenburg Today",
    published: row.publishedAt,
    image: row.image,
    original: !row.demo,
    breaking: false,
    region: null,
    viewCount: 0,
  };
}

function wireRowToCard(row: Record<string, unknown>): NewsStoryCard {
  const slug = String(row.slug || "");
  const canonical = typeof row.canonical_url === "string" ? row.canonical_url : "";
  return {
    key: `wire:${String(row.id)}`,
    kind: "wire",
    href: canonical.startsWith("http") ? canonical : `/news/${slug}`,
    external: canonical.startsWith("http"),
    headline: String(row.headline || ""),
    summary: String(row.summary || ""),
    category: String(row.category_slug || "news"),
    categorySlug: String(row.category_slug || ""),
    author: row.author_name ? String(row.author_name) : null,
    source: String(row.publisher || row.source_name || "Wire"),
    published: row.original_published_at ? String(row.original_published_at) : row.published_at ? String(row.published_at) : null,
    image: null,
    original: false,
    breaking: Number(row.breaking || 0) === 1,
    region: row.region ? String(row.region) : null,
    viewCount: 0,
  };
}

function uniqueCards(items: NewsStoryCard[]): NewsStoryCard[] {
  const seen = new Set<string>();
  const out: NewsStoryCard[] = [];
  for (const item of items) {
    const fingerprint = `${item.kind}:${item.headline.toLowerCase().slice(0, 80)}`;
    if (seen.has(item.key) || seen.has(fingerprint)) continue;
    seen.add(item.key);
    seen.add(fingerprint);
    out.push(item);
  }
  return out;
}

function publishedArticlesDetailed(limit: number, categorySlugs?: string[]): NewsStoryCard[] {
  const params: Array<string | number> = [new Date().toISOString()];
  let categoryClause = "";
  if (categorySlugs?.length) {
    categoryClause = ` AND c.slug IN (${categorySlugs.map(() => "?").join(",")})`;
    params.push(...categorySlugs);
  }
  params.push(limit);
  const rows = all<Record<string, unknown>>(
    `SELECT a.id, a.slug, a.published_at, a.featured_image, a.is_demo, a.is_featured, a.is_breaking, a.view_count,
            c.name as category, c.slug as category_slug, p.display_name as author,
            en.title as title, en.excerpt as excerpt
     FROM articles a
     JOIN article_categories c ON c.id = a.category_id
     JOIN profiles p ON p.user_id = a.author_id
     LEFT JOIN article_translations en ON en.article_id = a.id AND en.language_code = 'en' AND en.review_status = 'approved'
     WHERE a.status = 'published' AND a.deleted_at IS NULL AND (a.published_at IS NULL OR a.published_at <= ?)
       AND en.title IS NOT NULL${categoryClause}
     ORDER BY a.published_at DESC
     LIMIT ?`,
    ...params,
  );
  return rows.map((row) => ({
    key: `article:${String(row.id)}`,
    kind: "article" as const,
    href: `/news/${String(row.slug)}`,
    external: false,
    headline: String(row.title || ""),
    summary: String(row.excerpt || ""),
    category: String(row.category || ""),
    categorySlug: String(row.category_slug || ""),
    author: row.author ? String(row.author) : null,
    source: Number(row.is_demo) === 1 ? "Demonstration" : "Rustenburg Today",
    published: row.published_at ? String(row.published_at) : null,
    image: row.featured_image ? String(row.featured_image) : null,
    original: Number(row.is_demo) !== 1,
    breaking: Number(row.is_breaking || 0) === 1 || String(row.category_slug) === "breaking-news",
    region: null,
    viewCount: Number(row.view_count || 0),
  }));
}

function publishedWires(limit: number, filters: { categorySlugs?: string[]; regions?: string[]; localOnly?: boolean } = {}): NewsStoryCard[] {
  const where = ["n.status = 'published'"];
  const params: Array<string | number> = [];
  if (filters.categorySlugs?.length) {
    where.push(`n.category_slug IN (${filters.categorySlugs.map(() => "?").join(",")})`);
    params.push(...filters.categorySlugs);
  }
  if (filters.regions?.length) {
    where.push(`lower(n.region) IN (${filters.regions.map(() => "?").join(",")})`);
    params.push(...filters.regions.map((item) => item.toLowerCase()));
  }
  params.push(Math.min(Math.max(limit * (filters.localOnly ? 4 : 1), 1), 80));
  const rows = all<Record<string, unknown>>(
    `SELECT n.id, n.slug, n.headline, n.summary, n.publisher, n.author_name, n.category_slug, n.region,
            n.original_published_at, n.published_at, n.canonical_url, n.breaking, s.name as source_name
     FROM news_items n
     JOIN news_sources s ON s.id = n.source_id
     WHERE ${where.join(" AND ")}
     ORDER BY COALESCE(n.published_at, n.discovered_at) DESC
     LIMIT ?`,
    ...params,
  );
  let cards = rows.map(wireRowToCard);
  if (filters.localOnly) {
    cards = cards.filter(
      (item) =>
        item.region === "rustenburg" ||
        isLocalNorthwestText(item.headline, item.summary, item.region),
    );
  }
  return cards.slice(0, limit);
}

function forEditorial(cat: EditorialCategory, limit: number): NewsStoryCard[] {
  if (cat.slug === "breaking") return listBreaking(limit);
  if (cat.slug === "latest") return listLatest(limit).items;
  const articles = cat.articleSlugs.length ? publishedArticlesDetailed(limit, cat.articleSlugs) : [];
  const wires = publishedWires(limit, {
    categorySlugs: cat.wireSlugs.length ? cat.wireSlugs : undefined,
    regions: cat.wireRegions,
    localOnly: Boolean(cat.localNorthwest),
  });
  let combined = uniqueCards([...articles, ...wires]);
  if (cat.localNorthwest) {
    combined = combined.filter(
      (item) =>
        item.kind === "article" ||
        item.region === "rustenburg" ||
        isLocalNorthwestText(item.headline, item.summary, item.region),
    );
    // Articles in local categories are already filtered by slug; keep them.
    const localArticles = articles;
    combined = uniqueCards([...localArticles, ...combined.filter((item) => item.kind === "wire")]);
  }
  return combined.slice(0, limit);
}

export function listBreaking(limit = 8): NewsStoryCard[] {
  ensureReady();
  const articles = all<Record<string, unknown>>(
    `SELECT a.id, a.slug, a.published_at, a.featured_image, a.is_demo, a.view_count, a.is_breaking,
            c.name as category, c.slug as category_slug, p.display_name as author,
            en.title as title, en.excerpt as excerpt
     FROM articles a
     JOIN article_categories c ON c.id = a.category_id
     JOIN profiles p ON p.user_id = a.author_id
     LEFT JOIN article_translations en ON en.article_id = a.id AND en.language_code = 'en' AND en.review_status = 'approved'
     WHERE a.status = 'published' AND a.deleted_at IS NULL AND a.is_breaking = 1 AND en.title IS NOT NULL
       AND (a.published_at IS NULL OR a.published_at <= ?)
     ORDER BY a.published_at DESC LIMIT ?`,
    new Date().toISOString(),
    limit,
  ).map((row) => ({
    key: `article:${String(row.id)}`,
    kind: "article" as const,
    href: `/news/${String(row.slug)}`,
    external: false,
    headline: String(row.title || ""),
    summary: String(row.excerpt || ""),
    category: String(row.category || ""),
    categorySlug: String(row.category_slug || ""),
    author: row.author ? String(row.author) : null,
    source: Number(row.is_demo) === 1 ? "Demonstration" : "Rustenburg Today",
    published: row.published_at ? String(row.published_at) : null,
    image: row.featured_image ? String(row.featured_image) : null,
    original: Number(row.is_demo) !== 1,
    breaking: true,
    region: null,
    viewCount: Number(row.view_count || 0),
  }));
  const wires = all<Record<string, unknown>>(
    `SELECT n.id, n.slug, n.headline, n.summary, n.publisher, n.author_name, n.category_slug, n.region,
            n.original_published_at, n.published_at, n.canonical_url, n.breaking, s.name as source_name
     FROM news_items n JOIN news_sources s ON s.id = n.source_id
     WHERE n.status = 'published' AND n.breaking = 1
     ORDER BY n.published_at DESC LIMIT ?`,
    limit,
  ).map(wireRowToCard);
  return uniqueCards([...articles, ...wires]).slice(0, limit);
}

export function listLatest(limit = 16, page = 1): { items: NewsStoryCard[]; total: number } {
  ensureReady();
  const pageSize = Math.min(Math.max(limit, 1), 40);
  const offset = (Math.max(page, 1) - 1) * pageSize;
  const articles = publishedArticlesDetailed(pageSize + offset);
  const wires = publishedWires(pageSize + offset);
  const items = uniqueCards([...articles, ...wires]).sort((a, b) => String(b.published || "").localeCompare(String(a.published || "")));
  return { items: items.slice(offset, offset + pageSize), total: items.length };
}

/** Original Rustenburg Today journalism only — never wires or demonstration rows. */
export function listOfficialStories(options: {
  limit?: number;
  page?: number;
  department?: string;
  category?: string;
  displayType?: "headline" | "body" | "all";
} = {}): { items: NewsStoryCard[]; total: number } {
  ensureReady();
  expireHeadlineSlots();
  const pageSize = Math.min(Math.max(options.limit || 9, 1), 40);
  const page = Math.max(options.page || 1, 1);
  const where = ["a.status = 'published'", "a.deleted_at IS NULL", "a.is_demo = 0", "(a.published_at IS NULL OR a.published_at <= ?)", "en.title IS NOT NULL"];
  const params: Array<string | number> = [new Date().toISOString()];
  if (options.department) {
    where.push("a.department_slug = ?");
    params.push(options.department);
  }
  if (options.category) {
    where.push("c.slug = ?");
    params.push(options.category);
  }
  if (options.displayType === "headline" || options.displayType === "body") {
    where.push("IFNULL(a.news_display_type, 'body') = ?");
    params.push(options.displayType);
  }
  const total = get<{ count: number }>(
    `SELECT COUNT(*) as count
     FROM articles a
     JOIN article_categories c ON c.id = a.category_id
     JOIN article_translations en ON en.article_id = a.id AND en.language_code = 'en' AND en.review_status = 'approved'
     WHERE ${where.join(" AND ")}`,
    ...params,
  )?.count ?? 0;
  const rows = all<Record<string, unknown>>(
    `SELECT a.id, a.slug, a.published_at, a.featured_image, a.is_demo, a.is_breaking, a.department_slug, a.view_count,
            a.news_display_type, a.editorial_priority,
            c.name as category, c.slug as category_slug, p.display_name as author,
            en.title as title, en.excerpt as excerpt
     FROM articles a
     JOIN article_categories c ON c.id = a.category_id
     JOIN profiles p ON p.user_id = a.author_id
     JOIN article_translations en ON en.article_id = a.id AND en.language_code = 'en' AND en.review_status = 'approved'
     WHERE ${where.join(" AND ")}
     ORDER BY CASE WHEN IFNULL(a.news_display_type, 'body') = 'headline' THEN 0 ELSE 1 END,
              CASE a.editorial_priority WHEN 'breaking' THEN 0 WHEN 'top' THEN 1 WHEN 'important' THEN 2 ELSE 3 END,
              a.published_at DESC
     LIMIT ? OFFSET ?`,
    ...params,
    pageSize,
    (page - 1) * pageSize,
  );
  return {
    total,
    items: rows.map((row) => ({
      key: `article:${String(row.id)}`,
      kind: "article" as const,
      href: `/news/${String(row.slug)}`,
      external: false,
      headline: String(row.title || ""),
      summary: String(row.excerpt || ""),
      category: String(row.category || ""),
      categorySlug: String(row.category_slug || ""),
      author: row.author ? String(row.author) : null,
      source: "Rustenburg Today",
      published: row.published_at ? String(row.published_at) : null,
      image: row.featured_image ? String(row.featured_image) : null,
      original: true,
      breaking: Number(row.is_breaking || 0) === 1 || String(row.editorial_priority || "") === "breaking",
      region: row.department_slug ? String(row.department_slug) : null,
      viewCount: Number(row.view_count || 0),
      displayType: String(row.news_display_type || "body") === "headline" ? ("headline" as const) : ("body" as const),
      priority: String(row.editorial_priority || "standard"),
    })),
  };
}

/** Live Headline News slots across departments (does not replace Main Editorial Story). */
export function listHeadlineStories(options: { limit?: number; department?: string } = {}): NewsStoryCard[] {
  return listOfficialStories({
    limit: options.limit || 8,
    department: options.department,
    displayType: "headline",
  }).items;
}

export function listMostRead(limit = 6): NewsStoryCard[] {
  ensureReady();
  const rows = all<Record<string, unknown>>(
    `SELECT a.id, a.slug, a.published_at, a.featured_image, a.is_demo, a.view_count, a.is_breaking,
            c.name as category, c.slug as category_slug, p.display_name as author,
            en.title as title, en.excerpt as excerpt
     FROM articles a
     JOIN article_categories c ON c.id = a.category_id
     JOIN profiles p ON p.user_id = a.author_id
     LEFT JOIN article_translations en ON en.article_id = a.id AND en.language_code = 'en' AND en.review_status = 'approved'
     WHERE a.status = 'published' AND a.deleted_at IS NULL AND a.view_count > 0 AND en.title IS NOT NULL
       AND (a.published_at IS NULL OR a.published_at <= ?)
     ORDER BY a.view_count DESC, a.published_at DESC
     LIMIT ?`,
    new Date().toISOString(),
    limit,
  );
  return rows.map((row) => ({
    key: `article:${String(row.id)}`,
    kind: "article" as const,
    href: `/news/${String(row.slug)}`,
    external: false,
    headline: String(row.title || ""),
    summary: String(row.excerpt || ""),
    category: String(row.category || ""),
    categorySlug: String(row.category_slug || ""),
    author: row.author ? String(row.author) : null,
    source: Number(row.is_demo) === 1 ? "Demonstration" : "Rustenburg Today",
    published: row.published_at ? String(row.published_at) : null,
    image: row.featured_image ? String(row.featured_image) : null,
    original: Number(row.is_demo) !== 1,
    breaking: Number(row.is_breaking || 0) === 1,
    region: null,
    viewCount: Number(row.view_count || 0),
  }));
}

export function listTrending(limit = 6): NewsStoryCard[] {
  ensureReady();
  const rows = all<Record<string, unknown>>(
    `SELECT a.id, a.slug, a.published_at, a.featured_image, a.is_demo, a.view_count, a.is_breaking,
            c.name as category, c.slug as category_slug, p.display_name as author,
            en.title as title, en.excerpt as excerpt,
            (SELECT COUNT(*) FROM article_reactions r WHERE r.article_id = a.id) as reactions
     FROM articles a
     JOIN article_categories c ON c.id = a.category_id
     JOIN profiles p ON p.user_id = a.author_id
     LEFT JOIN article_translations en ON en.article_id = a.id AND en.language_code = 'en' AND en.review_status = 'approved'
     WHERE a.status = 'published' AND a.deleted_at IS NULL AND en.title IS NOT NULL
       AND (a.published_at IS NULL OR a.published_at <= ?)
       AND a.published_at >= ?
     ORDER BY (reactions * 3 + a.view_count) DESC, a.published_at DESC
     LIMIT ?`,
    new Date().toISOString(),
    new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
    limit,
  );
  return rows
    .filter((row) => Number(row.reactions || 0) + Number(row.view_count || 0) > 0)
    .map((row) => ({
      key: `article:${String(row.id)}`,
      kind: "article" as const,
      href: `/news/${String(row.slug)}`,
      external: false,
      headline: String(row.title || ""),
      summary: String(row.excerpt || ""),
      category: String(row.category || ""),
      categorySlug: String(row.category_slug || ""),
      author: row.author ? String(row.author) : null,
      source: Number(row.is_demo) === 1 ? "Demonstration" : "Rustenburg Today",
      published: row.published_at ? String(row.published_at) : null,
      image: row.featured_image ? String(row.featured_image) : null,
      original: Number(row.is_demo) !== 1,
      breaking: Number(row.is_breaking || 0) === 1,
      region: null,
      viewCount: Number(row.view_count || 0),
    }));
}

export function listTopStories(limit = 5): NewsStoryCard[] {
  ensureReady();
  const editorial = topFive().map((story: TopStory) => ({
    key: `top:${story.key}`,
    kind: (story.external ? "wire" : "article") as "wire" | "article",
    href: story.href.startsWith("http") ? story.href : story.href.startsWith("/") ? story.href : `/news/${story.href}`,
    external: story.external,
    headline: story.headline,
    summary: "",
    category: story.category,
    categorySlug: story.category,
    author: story.author,
    source: story.source,
    published: story.published,
    image: null,
    original: !story.external && story.source === "Rustenburg Today",
    breaking: false,
    region: story.location,
    viewCount: 0,
  }));
  if (editorial.length) return editorial.slice(0, limit);
  const headlines = listHeadlineStories({ limit });
  if (headlines.length) return headlines.slice(0, limit);
  return listLatest(limit).items;
}

function eligibleOriginalArticle(articleId: string): NewsStoryCard | null {
  const row = get<Record<string, unknown>>(
    `SELECT a.id, a.slug, a.published_at, a.featured_image, a.is_demo, a.is_featured, a.is_breaking, a.view_count,
            c.name as category, c.slug as category_slug, p.display_name as author,
            en.title as title, en.excerpt as excerpt
     FROM articles a
     JOIN article_categories c ON c.id = a.category_id
     JOIN profiles p ON p.user_id = a.author_id
     JOIN article_translations en ON en.article_id = a.id AND en.language_code = 'en' AND en.review_status = 'approved'
     WHERE a.id = ? AND a.status = 'published' AND a.deleted_at IS NULL AND a.is_demo = 0 AND en.title IS NOT NULL`,
    articleId,
  );
  if (!row) return null;
  return {
    key: `article:${String(row.id)}`,
    kind: "article",
    href: `/news/${String(row.slug)}`,
    external: false,
    headline: String(row.title),
    summary: String(row.excerpt || ""),
    category: String(row.category),
    categorySlug: String(row.category_slug),
    author: row.author ? String(row.author) : null,
    source: "Rustenburg Today",
    published: row.published_at ? String(row.published_at) : null,
    image: row.featured_image ? String(row.featured_image) : null,
    original: true,
    breaking: Number(row.is_breaking || 0) === 1,
    region: null,
    viewCount: Number(row.view_count || 0),
  };
}

function slotIsLive(startsAt: string, endsAt: string | null, now: string): boolean {
  if (startsAt > now) return false;
  if (endsAt && endsAt <= now) return false;
  return true;
}

/** Active Main Editorial Story for the homepage hero. Original published articles only. */
export function getMainEditorialStory(locationId?: string | null): NewsStoryCard | null {
  ensureReady();
  const now = new Date().toISOString();
  const rows = all<{ id: string; article_id: string; location_id: string | null; starts_at: string; ends_at: string | null }>(
    `SELECT id, article_id, location_id, starts_at, ends_at FROM main_editorial_slots
     WHERE status IN ('active', 'scheduled') ORDER BY CASE WHEN location_id IS NULL THEN 1 ELSE 0 END, starts_at DESC LIMIT 40`,
  );
  const local = locationId
    ? rows.find((slot) => slot.location_id === locationId && slotIsLive(slot.starts_at, slot.ends_at, now))
    : null;
  const national = rows.find((slot) => !slot.location_id && slotIsLive(slot.starts_at, slot.ends_at, now));
  const chosen = local || national;
  if (chosen) {
    const story = eligibleOriginalArticle(chosen.article_id);
    if (story) return story;
    run("UPDATE main_editorial_slots SET status = 'expired', updated_at = ? WHERE id = ?", now, chosen.id);
  }
  // Once editors have used the Main Story Manager, do not invent a hero from unrelated featured rows.
  if (get("SELECT 1 as ok FROM main_editorial_slots LIMIT 1")) return null;
  return listFeaturedStory();
}

export function listEligibleMainEditorialArticles(query = ""): Array<{ id: string; title: string; slug: string; author: string; category: string; published_at: string | null; image: string | null }> {
  ensureReady();
  const q = query.trim().toLowerCase().slice(0, 80);
  const like = `%${q}%`;
  return all(
    `SELECT a.id, en.title, a.slug, p.display_name as author, c.name as category, a.published_at, a.featured_image as image
     FROM articles a
     JOIN article_translations en ON en.article_id = a.id AND en.language_code = 'en' AND en.review_status = 'approved'
     JOIN profiles p ON p.user_id = a.author_id
     JOIN article_categories c ON c.id = a.category_id
     WHERE a.status = 'published' AND a.deleted_at IS NULL AND a.is_demo = 0
       AND (? = '' OR lower(en.title) LIKE ? OR lower(p.display_name) LIKE ? OR lower(c.name) LIKE ?)
     ORDER BY a.published_at DESC LIMIT 60`,
    q,
    like,
    like,
    like,
  );
}

export function previewMainEditorial(articleId: string): NewsStoryCard | null {
  ensureReady();
  return eligibleOriginalArticle(articleId);
}

export function scheduleMainEditorial(
  user: SessionUser,
  input: { articleId: string; startsAt?: string; endsAt?: string | null; locationId?: string | null },
): string {
  ensureReady();
  requirePermission(user.id, "articles.publish");
  if (!eligibleOriginalArticle(input.articleId)) {
    throw new AppError(400, "Choose a published original Rustenburg Today article");
  }
  if (input.locationId && !get("SELECT id FROM locations WHERE id = ? AND active = 1", input.locationId)) {
    throw new AppError(400, "Choose a valid location or leave it blank for national");
  }
  const startsAt = input.startsAt && !Number.isNaN(Date.parse(input.startsAt)) ? new Date(input.startsAt).toISOString() : new Date().toISOString();
  const endsAt =
    input.endsAt === null || input.endsAt === undefined || input.endsAt === ""
      ? null
      : !Number.isNaN(Date.parse(input.endsAt))
        ? new Date(input.endsAt).toISOString()
        : null;
  if (endsAt && endsAt <= startsAt) throw new AppError(400, "The end time must be after the start time");
  const stamp = new Date().toISOString();
  const status = startsAt > stamp ? "scheduled" : "active";
  // One primary national hero, or one per location — deactivate prior overlapping slots of the same scope.
  if (input.locationId) {
    run(
      `UPDATE main_editorial_slots SET status = 'replaced', updated_at = ?
       WHERE status IN ('active', 'scheduled') AND location_id = ?`,
      stamp,
      input.locationId,
    );
  } else {
    run(
      `UPDATE main_editorial_slots SET status = 'replaced', updated_at = ?
       WHERE status IN ('active', 'scheduled') AND location_id IS NULL`,
      stamp,
    );
  }
  const id = newId();
  run(
    `INSERT INTO main_editorial_slots (id, article_id, location_id, starts_at, ends_at, editor_id, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    input.articleId,
    input.locationId || null,
    startsAt,
    endsAt,
    user.id,
    status,
    stamp,
    stamp,
  );
  audit(user.id, "editorial.main_hero", "article", input.articleId, { slotId: id, locationId: input.locationId || null, status });
  return id;
}

export function clearMainEditorial(user: SessionUser, slotId?: string): void {
  ensureReady();
  requirePermission(user.id, "articles.publish");
  const stamp = new Date().toISOString();
  if (slotId) {
    run(
      "UPDATE main_editorial_slots SET status = 'cleared', updated_at = ? WHERE id = ? AND status IN ('active', 'scheduled')",
      stamp,
      slotId,
    );
  } else {
    run(
      "UPDATE main_editorial_slots SET status = 'cleared', updated_at = ? WHERE status IN ('active', 'scheduled') AND location_id IS NULL",
      stamp,
    );
  }
  audit(user.id, "editorial.main_hero_clear", "main_editorial", slotId || "national");
}

export function cancelScheduledMainEditorial(user: SessionUser, slotId: string): void {
  ensureReady();
  requirePermission(user.id, "articles.publish");
  const slot = get<{ status: string; starts_at: string }>("SELECT status, starts_at FROM main_editorial_slots WHERE id = ?", slotId);
  if (!slot || (slot.status !== "scheduled" && !(slot.status === "active" && slot.starts_at > new Date().toISOString()))) {
    throw new AppError(400, "That scheduled main story was not found");
  }
  run("UPDATE main_editorial_slots SET status = 'cancelled', updated_at = ? WHERE id = ?", new Date().toISOString(), slotId);
  audit(user.id, "editorial.main_hero_cancel", "main_editorial", slotId);
}

export function restoreMainEditorial(user: SessionUser, slotId: string): string {
  ensureReady();
  requirePermission(user.id, "articles.publish");
  const prior = get<{ article_id: string; location_id: string | null }>("SELECT article_id, location_id FROM main_editorial_slots WHERE id = ?", slotId);
  if (!prior) throw new AppError(404, "Main story history entry not found");
  return scheduleMainEditorial(user, { articleId: prior.article_id, locationId: prior.location_id });
}

export function listMainEditorialSlots(): Array<Record<string, unknown>> {
  ensureReady();
  const now = new Date().toISOString();
  return all(
    `SELECT s.id, s.article_id, s.location_id, s.starts_at, s.ends_at, s.status, s.created_at,
            en.title as headline, a.slug, a.featured_image as image, l.name as location_name, p.display_name as editor_name,
            CASE
              WHEN s.status IN ('active', 'scheduled') AND s.starts_at > ? THEN 'scheduled'
              WHEN s.status IN ('active', 'scheduled') AND (s.ends_at IS NULL OR s.ends_at > ?) THEN 'live'
              ELSE s.status
            END as display_status
     FROM main_editorial_slots s
     JOIN articles a ON a.id = s.article_id
     JOIN article_translations en ON en.article_id = a.id AND en.language_code = 'en' AND en.review_status = 'approved'
     JOIN profiles p ON p.user_id = s.editor_id
     LEFT JOIN locations l ON l.id = s.location_id
     ORDER BY s.created_at DESC LIMIT 40`,
    now,
    now,
  );
}

/** Featured original article only — never substitutes an external wire as original journalism. */
export function listFeaturedStory(): NewsStoryCard | null {
  ensureReady();
  const featured = listArticles({ locale: "en", featured: true, pageSize: 1 }).items.find((item) => !item.demo);
  if (featured) return articleToCard(featured);
  const latestOriginal = publishedArticlesDetailed(1).find((item) => item.original);
  return latestOriginal || null;
}

export function listEditorialSection(slug: string, limit = 8): NewsStoryCard[] {
  ensureReady();
  const cat = editorialBySlug(slug);
  if (!cat) return [];
  return forEditorial(cat, limit);
}

export function newsroomHomepage(locale: string): {
  breaking: NewsStoryCard[];
  featured: NewsStoryCard | null;
  top: NewsStoryCard[];
  latest: NewsStoryCard[];
  mostRead: NewsStoryCard[];
  trending: NewsStoryCard[];
  sections: Array<{ slug: string; name: string; summary: string; items: NewsStoryCard[] }>;
} {
  ensureReady();
  const used = new Set<string>();
  const take = (items: NewsStoryCard[], n: number) => {
    const out: NewsStoryCard[] = [];
    for (const item of items) {
      if (used.has(item.key)) continue;
      used.add(item.key);
      out.push(item);
      if (out.length >= n) break;
    }
    return out;
  };

  const breaking = listBreaking(6);
  breaking.forEach((item) => used.add(item.key));
  const featured = listFeaturedStory();
  if (featured) used.add(featured.key);
  const top = take(listTopStories(8), 5);
  const latest = take(listLatest(24).items, 10);
  const mostRead = take(listMostRead(10), 5);
  const trending = take(listTrending(10), 5);

  const sectionSlugs = [
    "politics",
    "business",
    "local",
    "south-africa",
    "africa",
    "world",
    "entertainment",
    "sports",
    "education",
    "health",
    "jobs",
    "technology",
    "environment",
    "opinion",
    "multimedia",
  ];
  const sections = sectionSlugs
    .map((slug) => {
      const meta = editorialBySlug(slug)!;
      const items = take(listEditorialSection(slug, 8), 4);
      return { slug, name: meta.name, summary: meta.summary, items };
    })
    .filter((section) => section.items.length > 0);

  void locale;
  return { breaking, featured, top, latest, mostRead, trending, sections };
}

export function editorialCategoryPage(slug: string, page = 1): {
  category: EditorialCategory;
  featured: NewsStoryCard | null;
  items: NewsStoryCard[];
  total: number;
  page: number;
  pageSize: number;
} | null {
  ensureReady();
  const category = editorialBySlug(slug);
  if (!category) return null;
  const pageSize = 12;
  const allItems = forEditorial(category, 80);
  const featured = allItems[0] || null;
  const rest = featured ? allItems.slice(1) : allItems;
  const start = (Math.max(page, 1) - 1) * pageSize;
  return {
    category,
    featured,
    items: rest.slice(start, start + pageSize),
    total: rest.length,
    page: Math.max(page, 1),
    pageSize,
  };
}

export function searchPublishedNews(q: string, filters: { category?: string; page?: number } = {}): {
  items: NewsStoryCard[];
  total: number;
} {
  ensureReady();
  const query = q.trim().toLowerCase();
  if (query.length < 2) return { items: [], total: 0 };
  const pageSize = 12;
  const page = Math.max(1, filters.page || 1);
  let pool = listLatest(80).items;
  if (filters.category) {
    const section = listEditorialSection(filters.category, 80);
    pool = uniqueCards([...section, ...pool.filter((item) => item.categorySlug === filters.category)]);
  }
  const matched = pool.filter(
    (item) =>
      item.headline.toLowerCase().includes(query) ||
      item.summary.toLowerCase().includes(query) ||
      item.source.toLowerCase().includes(query) ||
      (item.author || "").toLowerCase().includes(query),
  );
  const start = (page - 1) * pageSize;
  return { items: matched.slice(start, start + pageSize), total: matched.length };
}

export function setArticleBreaking(user: SessionUser, articleId: string, breaking: boolean): void {
  ensureReady();
  if (user.status !== "active") throw new AppError(403, "Account is not active");
  requirePermission(user.id, "articles.publish");
  const article = get<{ id: string; status: string }>("SELECT id, status FROM articles WHERE id = ?", articleId);
  if (!article || article.status !== "published") throw new AppError(404, "Published article not found");
  run("UPDATE articles SET is_breaking = ?, updated_at = ? WHERE id = ?", breaking ? 1 : 0, new Date().toISOString(), articleId);
  audit(user.id, breaking ? "article.breaking.on" : "article.breaking.off", "article", articleId, {});
}

export function ensureEditorialCategories(): void {
  ensureReady();
  for (const [name, slug] of ARTICLE_CATEGORY_SEEDS) {
    if (!get("SELECT id FROM article_categories WHERE slug = ?", slug)) {
      run("INSERT INTO article_categories (id, name, slug, description) VALUES (?, ?, ?, ?)", newId(), name, slug, name);
    }
  }
}

export { EDITORIAL_CATEGORIES, editorialBySlug };
