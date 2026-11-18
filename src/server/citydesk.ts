import { createHash } from "node:crypto";
import { safeExternalUrl, slugify } from "@/lib/text";
import type { SessionUser } from "./auth";
import { assertActive } from "./auth";
import { all, get, newId, run } from "./db";
import { AppError } from "./errors";
import { ensureReady } from "./init";
import { requirePermission } from "./permissions";
import { fanout } from "./alerts";
import { audit, indexDocument, removeIndex } from "./store";

const REGIONS = new Set(["rustenburg", "north-west", "national", "business", "education", "sport", "notices", "community", "traffic"]);
const KINDS = new Set(["rss", "atom", "official", "official_emergency", "partner", "submission"]);
const SENSITIVE = /\b(murder|killed|rape|sexual|court|charged|accused|election|outbreak|died|death|suicide|fraud|corrupt|defam|shootings?|kidnapp(?:ing|ed)|assault|gunman|gunmen)\b/i;

export type FeedEntry = { title: string; link: string; published: string | null; author: string | null; summary: string };

export function parseFeed(xml: string): FeedEntry[] {
  const blocks = [...xml.matchAll(/<(item|entry)\b[^>]*>([\s\S]*?)<\/\1>/gi)].map((match) => match[2] || "");
  return blocks
    .map((block) => {
      const title = textOf(block, "title").slice(0, 180);
      const link = canonicalUrl(atomLink(block) || textOf(block, "link") || textOf(block, "id"));
      const summary = clip(textOf(block, "description") || textOf(block, "summary") || textOf(block, "content"));
      return {
        title,
        link,
        published: textOf(block, "pubDate") || textOf(block, "published") || textOf(block, "updated") || null,
        author: textOf(block, "author") || textOf(block, "creator") || textOf(block, "name") || null,
        summary,
      };
    })
    .filter((item) => item.title.length >= 8 && /^https?:\/\//i.test(item.link));
}

export function canonicalUrl(value: string): string {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    for (const key of [...url.searchParams.keys()]) {
      if (key.toLowerCase().startsWith("utm_") || key === "fbclid") url.searchParams.delete(key);
    }
    url.hash = "";
    return url.toString();
  } catch {
    return "";
  }
}

export function classifyHttp(status: number, original: string, finalUrl: string | null): "ok" | "redirected" | "broken" {
  if (status === 404 || status === 410 || status >= 500 || status === 0) return "broken";
  if (status >= 300 && status < 400) return "redirected";
  if (finalUrl && canonicalUrl(finalUrl) !== canonicalUrl(original)) return "redirected";
  if (status >= 200 && status < 300) return "ok";
  return "broken";
}

export function addNewsSource(user: SessionUser, input: { name: string; kind: string; feedUrl?: string; homepageUrl?: string; publisher: string; region: string; categorySlug: string; rightsNote: string; permittedUse: string; autoBreaking?: boolean }): string {
  ensureReady();
  assertActive(user);
  requirePermission(user.id, "articles.publish");
  if (!KINDS.has(input.kind)) throw new AppError(400, "Choose a source kind");
  if (!REGIONS.has(input.region)) throw new AppError(400, "Choose a news region");
  if (!["headline_link", "licensed_summary", "none"].includes(input.permittedUse)) throw new AppError(400, "Record what this source permits");
  if (input.rightsNote.trim().length < 12) throw new AppError(400, "Record the feed permission before saving a source");
  const auto = input.autoBreaking && input.kind === "official_emergency" && input.permittedUse !== "none" ? 1 : 0;
  const id = newId();
  run(
    `INSERT INTO news_sources (id, name, kind, feed_url, homepage_url, publisher, region, category_slug, rights_note, permitted_use, auto_breaking, status, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'paused', ?, ?)`,
    id,
    input.name.trim(),
    input.kind,
    safeExternalUrl(input.feedUrl),
    safeExternalUrl(input.homepageUrl),
    input.publisher.trim(),
    input.region,
    input.categorySlug.trim() || "local-news",
    input.rightsNote.trim(),
    input.permittedUse,
    auto,
    user.id,
    new Date().toISOString(),
  );
  audit(user.id, "news.source.create", "news_source", id);
  return id;
}

export function setSourceStatus(user: SessionUser, id: string, status: "active" | "paused" | "blocked"): void {
  ensureReady();
  assertActive(user);
  requirePermission(user.id, "articles.publish");
  if (!get("SELECT id FROM news_sources WHERE id = ?", id)) throw new AppError(404, "Source not found");
  run("UPDATE news_sources SET status = ? WHERE id = ?", status, id);
  audit(user.id, "news.source.status", "news_source", id, { status });
}

export type IngestResult = { inserted: number; duplicates: number; held: number };

export function storeFeedItems(sourceId: string, entries: FeedEntry[], now = new Date().toISOString()): IngestResult {
  ensureReady();
  const source = get<{ id: string; kind: string; publisher: string; region: string; category_slug: string; permitted_use: string; auto_breaking: number; status: string }>(
    "SELECT id, kind, publisher, region, category_slug, permitted_use, auto_breaking, status FROM news_sources WHERE id = ?",
    sourceId,
  );
  if (!source) throw new AppError(404, "Source not found");
  if (source.permitted_use === "none" || source.status === "blocked") return { inserted: 0, duplicates: entries.length, held: 0 };
  let inserted = 0;
  let duplicates = 0;
  let held = 0;
  for (const entry of entries) {
    const url = canonicalUrl(entry.link);
    const hash = createHash("sha256").update(url).digest("hex");
    if (!url || get("SELECT id FROM news_items WHERE url_hash = ?", hash)) {
      duplicates += 1;
      continue;
    }
    const headline = entry.title.trim();
    const prior = get<{ id: string }>(
      "SELECT id FROM news_items WHERE lower(headline) = lower(?) AND lower(publisher) = lower(?) AND discovered_at >= ?",
      headline,
      source.publisher,
      new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString(),
    );
    const sensitive = SENSITIVE.test(`${headline} ${entry.summary}`) ? 1 : 0;
    const officialWire = source.kind === "official" && source.permitted_use === "headline_link" && sensitive === 0 && !prior;
    const emergency = source.auto_breaking === 1 && source.kind === "official_emergency" && sensitive === 0 && !prior;
    const publish = officialWire || emergency;
    const id = newId();
    const slug = uniqueItemSlug(headline);
    run(
      `INSERT INTO news_items (id, source_id, slug, story_kind, canonical_url, url_hash, headline, summary, author_name, publisher, original_published_at, discovered_at, category_slug, region, rights_status, link_status, duplicate_of, status, breaking, sensitive, published_at, created_at, updated_at)
       VALUES (?, ?, ?, 'external_link', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'unchecked', ?, ?, ?, ?, ?, ?, ?)`,
      id,
      source.id,
      slug,
      url,
      hash,
      headline,
      entry.summary || "Open the original report for the full story.",
      entry.author,
      source.publisher,
      entry.published ? isoStamp(entry.published) : null,
      now,
      source.category_slug,
      source.region,
      source.permitted_use === "licensed_summary" ? "licensed" : "headline_only",
      prior?.id || null,
      prior ? "rejected" : publish ? "published" : "in_review",
      emergency ? 1 : 0,
      sensitive,
      publish ? now : null,
      now,
      now,
    );
    if (publish && !prior) {
      indexDocument({ entityType: "wire", entityId: slug, language: "en", title: headline, body: entry.summary || "", locationName: source.region, publishedAt: entry.published ? isoStamp(entry.published) : now });
    }
    if (prior) duplicates += 1;
    else if (publish) inserted += 1;
    else {
      inserted += 1;
      held += 1;
    }
  }
  run("UPDATE news_sources SET last_checked_at = ?, last_error = NULL WHERE id = ?", now, source.id);
  return { inserted, duplicates, held };
}

export async function pullSource(id: string): Promise<IngestResult> {
  ensureReady();
  const source = get<{ feed_url: string | null; status: string }>("SELECT feed_url, status FROM news_sources WHERE id = ?", id);
  if (!source) throw new AppError(404, "Source not found");
  if (source.status !== "active") throw new AppError(400, "Activate the source before it is fetched");
  if (!source.feed_url) throw new AppError(400, "This source has no feed address");
  try {
    const response = await fetch(source.feed_url, {
      redirect: "follow",
      signal: AbortSignal.timeout(8000),
      headers: { accept: "application/rss+xml, application/atom+xml, application/xml, text/xml", "user-agent": "RustenburgTodayDesk/1.0" },
    });
    run("UPDATE news_sources SET last_status_code = ?, last_checked_at = ? WHERE id = ?", response.status, new Date().toISOString(), id);
    if (!response.ok) {
      run("UPDATE news_sources SET last_error = ? WHERE id = ?", `Feed returned ${response.status}`, id);
      return { inserted: 0, duplicates: 0, held: 0 };
    }
    const xml = (await response.text()).slice(0, 1_000_000);
    return storeFeedItems(id, parseFeed(xml));
  } catch (error) {
    run("UPDATE news_sources SET last_error = ?, last_checked_at = ? WHERE id = ?", error instanceof Error ? error.message : "Feed unavailable", new Date().toISOString(), id);
    return { inserted: 0, duplicates: 0, held: 0 };
  }
}

export async function pullActiveSources(): Promise<number> {
  ensureReady();
  const sources = all<{ id: string }>("SELECT id FROM news_sources WHERE status = 'active' AND feed_url IS NOT NULL");
  for (const source of sources) await pullSource(source.id);
  return sources.length;
}

export function reviewNewsItem(user: SessionUser, id: string, decision: "publish" | "reject" | "breaking" | "withdraw", note?: string): void {
  ensureReady();
  assertActive(user);
  requirePermission(user.id, "articles.publish");
  const item = get<{ id: string; status: string }>("SELECT id, status FROM news_items WHERE id = ?", id);
  if (!item) throw new AppError(404, "Story not found");
  const stamp = new Date().toISOString();
  if (decision === "withdraw") {
    if (!note || note.trim().length < 8) throw new AppError(400, "Record why the story is being withdrawn");
    run("UPDATE news_items SET status = 'withdrawn', breaking = 0, withdrawn_at = ?, correction_note = ?, updated_at = ? WHERE id = ?", stamp, note.trim(), stamp, id);
  } else if (decision === "reject") {
    run("UPDATE news_items SET status = 'rejected', breaking = 0, updated_at = ? WHERE id = ?", stamp, id);
  } else if (decision === "breaking") {
    run("UPDATE news_items SET status = 'published', breaking = 1, published_at = COALESCE(published_at, ?), updated_at = ? WHERE id = ?", stamp, stamp, id);
  } else {
    run("UPDATE news_items SET status = 'published', published_at = COALESCE(published_at, ?), updated_at = ? WHERE id = ?", stamp, stamp, id);
  }
  if (decision === "withdraw") {
    const story = get<{ headline: string; slug: string }>("SELECT headline, slug FROM news_items WHERE id = ?", id);
    removeIndex("wire", story?.slug || id);
    if (story) fanout(`story:news:${id}`, "Story withdrawn", note?.trim().slice(0, 180) || story.headline, `/news/${story.slug}`);
  }
  if (decision === "publish" || decision === "breaking") {
    const story = get<{ headline: string; summary: string; category_slug: string; slug: string; region: string }>("SELECT headline, summary, category_slug, slug, region FROM news_items WHERE id = ?", id);
    if (story) indexDocument({ entityType: "wire", entityId: story.slug, language: "en", title: story.headline, body: story.summary || "", locationName: story.region, publishedAt: stamp });
    if (story?.category_slug) fanout(`news:${story.category_slug}`, story.headline, story.summary || "", `/news/${story.slug}`);
  }
  audit(user.id, `news.item.${decision}`, "news_item", id, { note: note || null });
}

export function noteLinkStatus(id: string, status: number, finalUrl: string | null): void {
  ensureReady();
  const item = get<{ canonical_url: string }>("SELECT canonical_url FROM news_items WHERE id = ?", id);
  if (!item?.canonical_url) return;
  run("UPDATE news_items SET link_status = ?, final_url = ?, updated_at = ? WHERE id = ?", classifyHttp(status, item.canonical_url, finalUrl), finalUrl, new Date().toISOString(), id);
}

export function scheduleTopFive(user: SessionUser, input: { date: string; position: number; newsItemId?: string; articleId?: string }): void {
  ensureReady();
  assertActive(user);
  requirePermission(user.id, "articles.publish");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || input.position < 1 || input.position > 5) throw new AppError(400, "Choose a date and a position from 1 to 5");
  if (!input.newsItemId && !input.articleId) throw new AppError(400, "Choose a published story");
  if (input.newsItemId && !get("SELECT id FROM news_items WHERE id = ? AND status = 'published' AND sponsored = 0", input.newsItemId)) throw new AppError(400, "That story is not an eligible editorial item");
  if (input.articleId && !get("SELECT id FROM articles WHERE id = ? AND status = 'published' AND deleted_at IS NULL", input.articleId)) throw new AppError(400, "That article is not published");
  run("DELETE FROM top_five_slots WHERE edition_date = ? AND position = ?", input.date, input.position);
  run(
    "INSERT INTO top_five_slots (id, edition_date, position, news_item_id, article_id, editor_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    newId(),
    input.date,
    input.position,
    input.newsItemId || null,
    input.articleId || null,
    user.id,
    new Date().toISOString(),
  );
  audit(user.id, "news.topfive", "top_five", input.date, { position: input.position });
}

export function clearTopFive(user: SessionUser, date: string, position: number): void {
  ensureReady();
  assertActive(user);
  requirePermission(user.id, "articles.publish");
  run("DELETE FROM top_five_slots WHERE edition_date = ? AND position = ?", date, position);
}

export type TopStory = { key: string; href: string; external: boolean; category: string; location: string; headline: string; source: string; author: string | null; published: string | null; sponsored: boolean };

export function topFive(date = johannesburgDate()): TopStory[] {
  ensureReady();
  const slots = all<{ position: number; news_item_id: string | null; article_id: string | null }>(
    "SELECT position, news_item_id, article_id FROM top_five_slots WHERE edition_date = ? ORDER BY position",
    date,
  );
  return slots.flatMap((slot) => {
    const story = storyFromSlot(slot.news_item_id, slot.article_id);
    return story ? [story] : [];
  });
}

export function publishedNews(filters: { region?: string; limit?: number } = {}): Array<Record<string, unknown>> {
  ensureReady();
  const limit = Math.min(filters.limit || 8, 20);
  if (filters.region) return all("SELECT id, slug, headline, summary, publisher, author_name, category_slug, region, original_published_at, canonical_url, story_kind, breaking, sponsored FROM news_items WHERE status = 'published' AND region = ? ORDER BY published_at DESC LIMIT ?", filters.region, limit);
  return all("SELECT id, slug, headline, summary, publisher, author_name, category_slug, region, original_published_at, canonical_url, story_kind, breaking, sponsored FROM news_items WHERE status = 'published' ORDER BY published_at DESC LIMIT ?", limit);
}

export function freshWires(limit = 8): Array<Record<string, unknown>> {
  ensureReady();
  const cutoff = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();
  return all(
    `SELECT id, slug, headline, summary, publisher, author_name, category_slug, region, original_published_at, canonical_url, discovered_at
     FROM news_items
     WHERE status = 'published' AND story_kind = 'external_link' AND original_published_at >= ?
     ORDER BY original_published_at DESC LIMIT ?`,
    cutoff,
    Math.min(limit, 12),
  );
}

export function wireDesk(): { name: string; checked: string | null; error: string | null } | null {
  ensureReady();
  return get<{ name: string; checked: string | null; error: string | null }>("SELECT name, last_checked_at as checked, last_error as error FROM news_sources WHERE feed_url = 'https://www.sanews.gov.za/rss.xml'") ?? null;
}

export function installOfficialWires(): void {
  ensureReady();
  const url = "https://www.sanews.gov.za/rss.xml";
  if (get("SELECT id FROM news_sources WHERE feed_url = ?", url)) return;
  const stamp = new Date().toISOString();
  run(
    `INSERT INTO news_sources (id, name, kind, feed_url, homepage_url, publisher, region, category_slug, rights_note, permitted_use, auto_breaking, status, created_at)
     VALUES (?, 'SAnews', 'official', ?, 'https://www.sanews.gov.za/', 'SAnews', 'national', 'government', ?, 'headline_link', 0, 'active', ?)`,
    newId(),
    url,
    "GCIS publishes this RSS feed for syndication. The desk stores the headline, a short summary, the original date and a link. Full articles and photographs are not copied.",
    stamp,
  );
}

export function homeEdition(): { editorial: boolean; slides: TopStory[]; latest: TopStory[]; local: TopStory[] } {
  ensureReady();
  const picked = uniqueStories(topFive()).slice(0, 5);
  const wires = uniqueStories(freshWires(12).map(wireStory));
  const slides = picked.length ? picked : wires.slice(0, 5);
  const used = new Set(slides.map((story) => story.headline.toLowerCase()));
  const rest = wires.filter((story) => !used.has(story.headline.toLowerCase()));
  return {
    editorial: picked.length > 0,
    slides,
    latest: rest.slice(0, 4),
    local: rest.filter((story) => /rustenburg|north west/i.test(`${story.headline} ${story.location}`)).slice(0, 3),
  };
}

function wireStory(item: Record<string, unknown>): TopStory {
  return {
    key: String(item.id),
    href: String(item.canonical_url || ""),
    external: true,
    category: "Official",
    location: "South Africa",
    headline: String(item.headline),
    source: String(item.publisher),
    author: item.author_name ? String(item.author_name) : null,
    published: item.original_published_at ? String(item.original_published_at) : null,
    sponsored: false,
  };
}

function uniqueStories(stories: TopStory[]): TopStory[] {
  const seen = new Set<string>();
  return stories.filter((story) => {
    const key = story.headline.trim().toLowerCase();
    if (!key || seen.has(key) || !story.href) return false;
    seen.add(key);
    return true;
  });
}

export function cityWatch(): Array<Record<string, unknown>> {
  ensureReady();
  const now = new Date().toISOString();
  return all(
    `SELECT n.id, n.title, n.description, n.notice_type, n.created_at, n.updated_at, n.expires_at, p.display_name
     FROM public_notices n JOIN profiles p ON p.user_id = n.author_id
     WHERE n.status = 'published' AND n.deleted_at IS NULL AND (n.expires_at IS NULL OR n.expires_at >= ?)
     ORDER BY n.created_at DESC LIMIT 40`,
    now,
  );
}

export function breakingNews(): Array<Record<string, unknown>> {
  ensureReady();
  return all("SELECT id, slug, headline, publisher, canonical_url, region FROM news_items WHERE status = 'published' AND breaking = 1 ORDER BY published_at DESC LIMIT 6");
}

export function newsItemBySlug(slug: string): Record<string, unknown> | null {
  ensureReady();
  return get<Record<string, unknown>>("SELECT * FROM news_items WHERE slug = ? AND status = 'published'", slug) ?? null;
}

export function listSources(): Array<Record<string, unknown>> {
  ensureReady();
  return all("SELECT id, name, kind, publisher, region, status, permitted_use, auto_breaking, last_checked_at, last_error FROM news_sources ORDER BY name");
}

export function reviewQueue(): Array<Record<string, unknown>> {
  ensureReady();
  return all("SELECT id, headline, publisher, region, sensitive, link_status FROM news_items WHERE status = 'in_review' ORDER BY discovered_at DESC LIMIT 30");
}

export function blockOn(key: string): boolean {
  ensureReady();
  const row = get<{ enabled: number }>("SELECT enabled FROM homepage_blocks WHERE block_key = ?", key);
  return !row || row.enabled === 1;
}

export function setBlock(user: SessionUser, key: string, enabled: boolean): void {
  ensureReady();
  assertActive(user);
  requirePermission(user.id, "settings.manage");
  run("UPDATE homepage_blocks SET enabled = ? WHERE block_key = ?", enabled ? 1 : 0, key);
  audit(user.id, "homepage.block", "homepage_block", key, { enabled });
}

export function homepageBlocks(): Array<Record<string, unknown>> {
  ensureReady();
  return all("SELECT block_key, enabled, sort_order FROM homepage_blocks ORDER BY sort_order");
}

export function fileComplaint(user: SessionUser, input: { kind: string; subjectType: string; subjectId?: string; body: string }): string {
  ensureReady();
  assertActive(user);
  if (!["copyright", "privacy", "accuracy", "advertiser", "defamation"].includes(input.kind)) throw new AppError(400, "Choose a complaint type");
  if (input.body.trim().length < 20) throw new AppError(400, "Describe the complaint");
  const id = newId();
  const stamp = new Date().toISOString();
  run(
    "INSERT INTO trust_complaints (id, kind, subject_type, subject_id, reporter_id, body, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'open', ?, ?)",
    id,
    input.kind,
    input.subjectType,
    input.subjectId || null,
    user.id,
    input.body.trim().slice(0, 2000),
    stamp,
    stamp,
  );
  audit(user.id, "trust.complaint", "complaint", id);
  return id;
}

export function recordWeather(user: SessionUser, input: { summary: string; sourceName: string; sourceUrl?: string; observedAt: string }): void {
  ensureReady();
  assertActive(user);
  requirePermission(user.id, "articles.publish");
  if (input.summary.trim().length < 8 || input.sourceName.trim().length < 3) throw new AppError(400, "Record the observation and its source");
  run(
    "INSERT INTO weather_observations (id, summary, source_name, source_url, observed_at, recorded_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    newId(),
    input.summary.trim(),
    input.sourceName.trim(),
    safeExternalUrl(input.sourceUrl),
    input.observedAt,
    user.id,
    new Date().toISOString(),
  );
}

export function currentWeather(): { summary: string; sourceName: string; sourceUrl: string | null; observedAt: string } | null {
  ensureReady();
  const row = get<{ summary: string; source_name: string; source_url: string | null; observed_at: string }>("SELECT summary, source_name, source_url, observed_at FROM weather_observations ORDER BY observed_at DESC LIMIT 1");
  if (!row) return null;
  if (Date.now() - Date.parse(row.observed_at) > 6 * 60 * 60 * 1000) return null;
  return { summary: row.summary, sourceName: row.source_name, sourceUrl: row.source_url, observedAt: row.observed_at };
}

export function trafficNotices(): Array<Record<string, unknown>> {
  ensureReady();
  const now = new Date().toISOString();
  return all(
    "SELECT id, title, description, notice_type, created_at FROM public_notices WHERE status = 'published' AND deleted_at IS NULL AND notice_type IN ('traffic', 'safety') AND (expires_at IS NULL OR expires_at >= ?) ORDER BY created_at DESC LIMIT 4",
    now,
  );
}

export function openNow(hours: Array<{ weekday: number; opening_time: string; closing_time: string }>, exceptions: Array<{ on_date: string; closed: number; opening_time: string | null; closing_time: string | null }> = [], now = new Date()): "open" | "closed" | "unknown" {
  if (!hours.length) return "unknown";
  const local = johannesburgParts(now);
  const exception = exceptions.find((item) => item.on_date === local.date);
  if (exception?.closed) return "closed";
  const open = exception?.opening_time || hours.find((item) => item.weekday === local.weekday)?.opening_time;
  const close = exception?.closing_time || hours.find((item) => item.weekday === local.weekday)?.closing_time;
  if (!open || !close) return "closed";
  return local.time >= open && local.time < close ? "open" : "closed";
}

export function saveHourException(user: SessionUser, input: { businessId: string; date: string; closed: boolean; opens?: string; closes?: string; note?: string }): void {
  ensureReady();
  assertActive(user);
  requirePermission(user.id, "business.verify");
  run(
    "INSERT INTO business_hour_exceptions (id, business_id, on_date, closed, opening_time, closing_time, note) VALUES (?, ?, ?, ?, ?, ?, ?)",
    newId(),
    input.businessId,
    input.date,
    input.closed ? 1 : 0,
    input.opens || null,
    input.closes || null,
    input.note || null,
  );
}

export function rejectRecruitmentFee(amount: number | null | undefined): void {
  if (amount && amount > 0) throw new AppError(400, "This platform does not take employment application fees");
}

export function confirmVacancy(user: SessionUser, jobId: string, badge: "vacancy_confirmed" | "official_government", evidence: string, destination?: string): void {
  ensureReady();
  assertActive(user);
  requirePermission(user.id, "jobs.manage");
  if (evidence.trim().length < 12) throw new AppError(400, "Record how the vacancy was confirmed");
  if (!get("SELECT id FROM jobs WHERE id = ?", jobId)) throw new AppError(404, "Vacancy not found");
  const stamp = new Date().toISOString();
  const reconfirm = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  run(
    "INSERT INTO job_verifications (id, job_id, badge, evidence_note, destination_url, checked_at, checked_by, reconfirm_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    newId(),
    jobId,
    badge,
    evidence.trim(),
    safeExternalUrl(destination),
    stamp,
    user.id,
    reconfirm,
  );
  audit(user.id, "job.verify", "job", jobId, { badge });
}

export function verifyEmployerIdentity(user: SessionUser, employerId: string, evidence: string, businessId?: string): void {
  ensureReady();
  assertActive(user);
  requirePermission(user.id, "business.verify");
  if (evidence.trim().length < 12) throw new AppError(400, "Record the identity check");
  run(
    "INSERT INTO employer_verifications (id, business_id, user_id, status, evidence_note, checked_at, checked_by) VALUES (?, ?, ?, 'identity_checked', ?, ?, ?)",
    newId(),
    businessId || null,
    employerId,
    evidence.trim(),
    new Date().toISOString(),
    user.id,
  );
  audit(user.id, "employer.verify", "user", employerId);
}

export function reportVacancy(user: SessionUser, jobId: string, reason: string): void {
  ensureReady();
  assertActive(user);
  if (reason.trim().length < 12) throw new AppError(400, "Describe the concern");
  if (!get("SELECT id FROM jobs WHERE id = ?", jobId)) throw new AppError(404, "Vacancy not found");
  run("INSERT INTO job_reports (id, job_id, reporter_id, reason, status, created_at) VALUES (?, ?, ?, ?, 'open', ?)", newId(), jobId, user.id, reason.trim().slice(0, 1000), new Date().toISOString());
}

export function jobBadge(jobId: string): string | null {
  ensureReady();
  return get<{ badge: string }>("SELECT badge FROM job_verifications WHERE job_id = ? ORDER BY checked_at DESC LIMIT 1", jobId)?.badge ?? null;
}

export function employerChecked(userId: string): boolean {
  ensureReady();
  return Boolean(get("SELECT id FROM employer_verifications WHERE user_id = ? AND status = 'identity_checked'", userId));
}

export function expireVacancies(): number {
  ensureReady();
  const today = johannesburgDate();
  return run("UPDATE jobs SET status = 'expired', updated_at = ? WHERE status = 'published' AND closing_date IS NOT NULL AND closing_date < ?", new Date().toISOString(), today);
}

export function licencesDue(withinDays = 30): Array<Record<string, unknown>> {
  ensureReady();
  const until = new Date(Date.now() + withinDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return all("SELECT id, licence_type, holder, reference_code, ends_on, status FROM radio_licences WHERE status = 'current' AND ends_on <= ? ORDER BY ends_on", until);
}

export function saveRadioLicence(user: SessionUser, input: { licenceType: string; holder: string; reference: string; territory: string; startsOn: string; endsOn: string; notes?: string }): string {
  ensureReady();
  assertActive(user);
  requirePermission(user.id, "settings.manage");
  const station = get<{ id: string }>("SELECT id FROM radio_stations LIMIT 1");
  if (!station) throw new AppError(500, "Radio station is not configured");
  if (!["icasa", "samro", "sampra", "talk", "cleared"].includes(input.licenceType)) throw new AppError(400, "Record the licence type");
  const id = newId();
  run(
    "INSERT INTO radio_licences (id, station_id, licence_type, holder, reference_code, territory, starts_on, ends_on, notes, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'current', ?)",
    id,
    station.id,
    input.licenceType,
    input.holder.trim(),
    input.reference.trim(),
    input.territory.trim(),
    input.startsOn,
    input.endsOn,
    input.notes || null,
    new Date().toISOString(),
  );
  audit(user.id, "radio.licence", "radio_licence", id);
  return id;
}

export function setStationAir(user: SessionUser, status: "offline" | "on_air", streamUrl?: string): void {
  ensureReady();
  assertActive(user);
  requirePermission(user.id, "settings.manage");
  const station = get<{ id: string; stream_url: string | null }>("SELECT id, stream_url FROM radio_stations LIMIT 1");
  if (!station) throw new AppError(500, "Radio station is not configured");
  const stream = streamUrl === undefined ? station.stream_url : safeExternalUrl(streamUrl);
  if (status === "on_air") {
    if (!stream) throw new AppError(400, "Save an authorised stream address first");
    if (!currentLicence(station.id)) throw new AppError(400, "A current licence record is required before the station can be marked on air");
  }
  run("UPDATE radio_stations SET status = ?, stream_url = ? WHERE id = ?", status, stream, station.id);
  audit(user.id, "radio.air", "radio_station", station.id, { status });
}

export function radioState(): { state: "offline" | "on_air"; name: string; stream: string | null; programme: string | null; reason: string } {
  ensureReady();
  const station = get<{ id: string; name: string; stream_url: string | null; status: string; rights_note: string }>("SELECT id, name, stream_url, status, rights_note FROM radio_stations LIMIT 1");
  if (!station) return { state: "offline", name: "Rustenburg Today Radio", stream: null, programme: null, reason: "The station record is not configured." };
  const programme = currentProgrammeTitle();
  if (station.status === "on_air" && station.stream_url && currentLicence(station.id)) {
    return { state: "on_air", name: station.name, stream: station.stream_url, programme, reason: "An authorised stream address and a current licence record are on file." };
  }
  return { state: "offline", name: station.name, stream: null, programme, reason: station.rights_note || "The station is not on air. A stream is played only after an authorised address and a current licence are saved." };
}

export function leaveRadioMessage(user: SessionUser, body: string): void {
  ensureReady();
  assertActive(user);
  if (body.trim().length < 4) throw new AppError(400, "Write a short message");
  run("INSERT INTO radio_messages (id, user_id, body, status, created_at) VALUES (?, ?, ?, 'pending', ?)", newId(), user.id, body.trim().slice(0, 500), new Date().toISOString());
}

export function moderateRadioMessage(user: SessionUser, id: string, publish: boolean): void {
  ensureReady();
  assertActive(user);
  requirePermission(user.id, "media.moderate");
  run("UPDATE radio_messages SET status = ? WHERE id = ?", publish ? "published" : "rejected", id);
}

function currentLicence(stationId: string): boolean {
  const today = johannesburgDate();
  return Boolean(get("SELECT id FROM radio_licences WHERE station_id = ? AND status = 'current' AND starts_on <= ? AND ends_on >= ?", stationId, today, today));
}

function currentProgrammeTitle(): string | null {
  const local = johannesburgParts(new Date());
  return get<{ title: string }>("SELECT title FROM radio_programmes WHERE weekday = ? AND start_time <= ? AND end_time > ? AND status = 'scheduled' ORDER BY start_time LIMIT 1", local.weekday, local.time, local.time)?.title ?? null;
}

function storyFromSlot(newsItemId: string | null, articleId: string | null): TopStory | null {
  if (newsItemId) {
    const item = get<{ id: string; slug: string; headline: string; publisher: string; author_name: string | null; category_slug: string; region: string; original_published_at: string | null; canonical_url: string | null; sponsored: number; status: string }>(
      "SELECT id, slug, headline, publisher, author_name, category_slug, region, original_published_at, canonical_url, sponsored, status FROM news_items WHERE id = ?",
      newsItemId,
    );
    if (!item || item.status !== "published" || item.sponsored) return null;
    return { key: item.id, href: item.canonical_url || `/news/${item.slug}`, external: Boolean(item.canonical_url), category: item.category_slug, location: item.region, headline: item.headline, source: item.publisher, author: item.author_name, published: item.original_published_at, sponsored: false };
  }
  if (!articleId) return null;
  const article = get<{ id: string; slug: string; title: string; published_at: string | null; category: string; is_demo: number }>(
    `SELECT a.id, a.slug, a.published_at, a.is_demo, COALESCE(t.title, a.slug) as title, c.slug as category
     FROM articles a JOIN article_categories c ON c.id = a.category_id
     LEFT JOIN article_translations t ON t.article_id = a.id AND t.language_code = 'en'
     WHERE a.id = ? AND a.status = 'published'`,
    articleId,
  );
  if (!article) return null;
  return { key: article.id, href: `/news/${article.slug}`, external: false, category: article.category, location: "rustenburg", headline: article.title, source: article.is_demo ? "Demonstration" : "Rustenburg Today", author: null, published: article.published_at, sponsored: false };
}

function isoStamp(value: string): string | null {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function uniqueItemSlug(headline: string): string {
  let slug = slugify(headline).slice(0, 70) || "story";
  let n = 2;
  while (get("SELECT id FROM news_items WHERE slug = ?", slug)) slug = `${slugify(headline).slice(0, 60)}-${n++}`;
  return slug;
}

function textOf(block: string, name: string): string {
  const cdata = block.match(new RegExp(`<${name}\\b[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*</${name}>`, "i"));
  const plain = block.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`, "i"));
  return decode(strip(cdata?.[1] || plain?.[1] || ""));
}

function atomLink(block: string): string {
  const alternate = block.match(/<link\b[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["'][^>]*>/i) || block.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*rel=["']alternate["'][^>]*>/i);
  if (alternate) return alternate[1];
  const bare = block.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*\/?>(?!\s*<\/link>)/i);
  return bare?.[1] || "";
}

function strip(value: string): string {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function decode(value: string): string {
  return value.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&#39;/g, "'");
}

function clip(value: string): string {
  const clean = strip(decode(value));
  return clean.length > 280 ? `${clean.slice(0, 277)}...` : clean;
}

export function johannesburgDate(now = new Date()): string {
  return johannesburgParts(now).date;
}

function johannesburgParts(now: Date): { date: string; time: string; weekday: number } {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Johannesburg", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short", hourCycle: "h23" }).formatToParts(now);
  const pick = (type: string) => parts.find((part) => part.type === type)?.value || "";
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(pick("weekday"));
  return { date: `${pick("year")}-${pick("month")}-${pick("day")}`, time: `${pick("hour")}:${pick("minute")}`, weekday: weekday < 0 ? 0 : weekday };
}
