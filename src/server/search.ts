import { levenshtein } from "@/lib/text";
import { all, get, newId, run } from "./db";
import { indexDocument } from "./store";
import { AppError } from "./errors";
import { ensureReady } from "./init";

export type SearchHit = {
  entityType: string;
  entityId: string;
  language: string;
  title: string;
  body: string;
  locationName: string | null;
  publishedAt: string | null;
  score: number;
};

type Doc = {
  entity_type: string;
  entity_id: string;
  language_code: string;
  title: string;
  body: string;
  location_name: string | null;
  popularity: number;
  published_at: string | null;
};

function scoreDoc(doc: Doc, terms: string[], locale: string): number {
  const title = doc.title.toLowerCase();
  const body = doc.body.toLowerCase();
  const words = title.split(/[^a-z0-9]+/).filter((word) => word.length > 2);
  let score = 0;
  let matched = 0;
  for (const term of terms) {
    if (title.includes(term)) {
      score += 5;
      matched += 1;
      continue;
    }
    if (body.includes(term)) {
      score += 2;
      matched += 1;
      continue;
    }
    if (words.some((word) => Math.abs(word.length - term.length) <= 2 && levenshtein(word, term) <= 1)) {
      score += 3;
      matched += 1;
    }
  }
  if (!matched) return 0;
  if (doc.language_code === locale) score += 2;
  score += Math.min(3, doc.popularity);
  return score;
}

export function searchPlatform(query: string, options?: { types?: string[]; locale?: string; location?: string; sort?: "relevance" | "date" | "popular"; page?: number; pageSize?: number }): { items: SearchHit[]; total: number; page: number; pageSize: number } {
  ensureReady();
  if (!get("SELECT entity_id FROM search_documents WHERE entity_type = 'wire' LIMIT 1")) {
    const wires = all<{ slug: string; headline: string; summary: string | null; region: string | null; original_published_at: string | null }>(
      "SELECT slug, headline, summary, region, original_published_at FROM news_items WHERE status = 'published'",
    );
    for (const wire of wires) {
      indexDocument({ entityType: "wire", entityId: wire.slug, language: "en", title: wire.headline, body: wire.summary || "", locationName: wire.region, publishedAt: wire.original_published_at });
    }
  }
  const locale = options?.locale || "en";
  const pageSize = Math.min(24, Math.max(1, options?.pageSize || 12));
  const page = Math.max(1, options?.page || 1);
  const terms = query.trim().toLowerCase().split(/\s+/).filter((term) => term.length > 1).slice(0, 8);
  if (!terms.length) return { items: [], total: 0, page, pageSize };
  const like = `%${terms[0].replace(/[%_]/g, "")}%`;
  let docs = all<Doc>(
    `SELECT entity_type, entity_id, language_code, title, body, location_name, popularity, published_at
     FROM search_documents WHERE lower(title) LIKE ? OR lower(body) LIKE ? LIMIT 800`,
    like,
    like,
  );
  if (!docs.length) docs = all<Doc>("SELECT entity_type, entity_id, language_code, title, body, location_name, popularity, published_at FROM search_documents LIMIT 800");
  const ranked = docs
    .filter((doc) => !options?.types?.length || options.types.includes(doc.entity_type))
    .filter((doc) => !options?.location || (doc.location_name || "").toLowerCase().includes(options.location.toLowerCase()))
    .map((doc) => ({ doc, score: scoreDoc(doc, terms, locale) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => {
      if (options?.sort === "date") return (b.doc.published_at || "").localeCompare(a.doc.published_at || "");
      if (options?.sort === "popular") return b.doc.popularity - a.doc.popularity || b.score - a.score;
      return b.score - a.score || (b.doc.published_at || "").localeCompare(a.doc.published_at || "");
    });
  const slice = ranked.slice((page - 1) * pageSize, page * pageSize);
  return {
    total: ranked.length,
    page,
    pageSize,
    items: slice.map(({ doc, score }) => ({
      entityType: doc.entity_type,
      entityId: doc.entity_id,
      language: doc.language_code,
      title: doc.title,
      body: doc.body.slice(0, 220),
      locationName: doc.location_name,
      publishedAt: doc.published_at,
      score,
    })),
  };
}

const PATHS: Record<string, string> = {
  article: "/news/",
  wire: "/news/",
  post: "/community/",
  podcast: "/podcasts/",
  episode: "/podcasts/",
  video: "/tv/",
  business: "/business/",
  product: "/marketplace/",
  job: "/jobs/",
  course: "/learn/",
  event: "/events/",
  property: "/property/",
  deal: "/deals/",
  notice: "/notices/",
  talent: "/talent/",
  service: "/services/",
  tourism: "/tourism/",
  health: "/health/",
};

export function searchSuggest(query: string): string[] {
  ensureReady();
  const term = query.trim().toLowerCase();
  if (term.length < 2) return [];
  const like = `%${term.replace(/[%_]/g, "")}%`;
  return all<{ title: string }>("SELECT DISTINCT title FROM search_documents WHERE lower(title) LIKE ? ORDER BY popularity DESC LIMIT 8", like).map((row) => row.title);
}

export function rememberSearch(userId: string | null, query: string): void {
  ensureReady();
  const clean = query.trim().slice(0, 120);
  if (clean.length < 2) return;
  run("INSERT INTO search_history (id, user_id, query, created_at) VALUES (?, ?, ?, ?)", newId(), userId, clean, new Date().toISOString());
}

export function saveSearch(userId: string, query: string, locationId?: string | null): void {
  ensureReady();
  const clean = query.trim();
  if (clean.length < 2) throw new AppError(400, "Enter a search to save");
  run("INSERT INTO saved_searches (id, user_id, query, location_id, created_at) VALUES (?, ?, ?, ?, ?)", newId(), userId, clean.slice(0, 120), locationId || null, new Date().toISOString());
}

export function listSavedSearches(userId: string): Array<Record<string, unknown>> {
  ensureReady();
  return all("SELECT id, query, created_at FROM saved_searches WHERE user_id = ? ORDER BY created_at DESC LIMIT 12", userId);
}

export function clearSearchHistory(userId: string): void {
  ensureReady();
  run("DELETE FROM search_history WHERE user_id = ?", userId);
}

export function searchPath(hit: SearchHit): string {
  const prefix = PATHS[hit.entityType] || "/search?q=";
  if (prefix.startsWith("/search")) return `/search?q=${encodeURIComponent(hit.title)}`;
  return `${prefix}${hit.entityId}`;
}
