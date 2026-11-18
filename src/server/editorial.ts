import { containsSensitiveIdentity, readingMinutes, safeExternalUrl, slugify } from "@/lib/text";
import type { SessionUser } from "./auth";
import { assertActive } from "./auth";
import { all, get, newId, run, transaction } from "./db";
import { AppError } from "./errors";
import { ensureReady } from "./init";
import { requirePermission } from "./permissions";
import { audit, indexDocument, rateLimit, removeIndex, track } from "./store";
import { fanout } from "./alerts";

const TABLES = new Set(["articles", "businesses", "products", "courses", "events", "podcasts", "videos", "video_channels"]);

export function uniqueSlug(table: string, base: string, ignoreId?: string): string {
  if (!TABLES.has(table)) throw new AppError(500, "Unsupported slug table");
  let slug = slugify(base);
  let n = 2;
  while (true) {
    const row = get<{ id: string }>(`SELECT id FROM ${table} WHERE slug = ?`, slug);
    if (!row || row.id === ignoreId) return slug;
    slug = `${slugify(base).slice(0, 60)}-${n++}`;
  }
}

function cleanCopy(title: string, excerpt: string, body: string): { title: string; excerpt: string; body: string } {
  const next = {
    title: title.trim(),
    excerpt: excerpt.trim(),
    body: body.trim(),
  };
  if (next.title.length < 8 || next.title.length > 160) throw new AppError(400, "Title must be between 8 and 160 characters");
  if (next.excerpt.length < 12 || next.excerpt.length > 320) throw new AppError(400, "Excerpt must be between 12 and 320 characters");
  if (next.body.length < 40) throw new AppError(400, "Write a fuller article body");
  if ([next.title, next.excerpt, next.body].some(containsSensitiveIdentity)) throw new AppError(400, "Remove identity numbers before saving");
  return next;
}

function categoryId(slug: string): string {
  const row = get<{ id: string }>("SELECT id FROM article_categories WHERE slug = ?", slug);
  if (!row) throw new AppError(400, "Choose a news category");
  return row.id;
}

export function createArticle(user: SessionUser, input: { categorySlug: string; language: string; title: string; excerpt: string; body: string; tags?: string; sourceName?: string; sourceUrl?: string; featured?: boolean; scheduledFor?: string | null; imageUrl?: string | null }): { id: string; slug: string } {
  ensureReady();
  assertActive(user);
  requirePermission(user.id, "articles.create");
  rateLimit(`article:${user.id}`, 20, 60 * 60 * 1000);
  const copy = cleanCopy(input.title, input.excerpt, input.body);
  const language = input.language === "af" || input.language === "tn" ? input.language : "en";
  const id = newId();
  const slug = uniqueSlug("articles", copy.title);
  const stamp = new Date().toISOString();
  transaction(() => {
    run(
      `INSERT INTO articles (id, author_id, category_id, slug, status, editorial_review_status, featured_image, is_featured, reading_minutes, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'draft', 'unreviewed', ?, ?, ?, ?, ?)`,
      id,
      user.id,
      categoryId(input.categorySlug),
      slug,
      input.imageUrl || null,
      input.featured ? 1 : 0,
      readingMinutes(copy.body),
      stamp,
      stamp,
    );
    run(
      `INSERT INTO article_translations (id, article_id, language_code, title, excerpt, body, meta_title, meta_description, review_status, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?)`,
      newId(),
      id,
      language,
      copy.title,
      copy.excerpt,
      copy.body,
      copy.title,
      copy.excerpt,
      stamp,
    );
    if (input.sourceName?.trim()) {
      run("INSERT INTO article_sources (id, article_id, source_name, source_url, attribution) VALUES (?, ?, ?, ?, ?)", newId(), id, input.sourceName.trim(), safeExternalUrl(input.sourceUrl), input.sourceName.trim());
    }
    saveTags(id, input.tags || "");
    run("INSERT INTO article_revisions (id, article_id, editor_id, revision_type, revision_content, created_at) VALUES (?, ?, ?, 'create', ?, ?)", newId(), id, user.id, JSON.stringify(copy), stamp);
  });
  audit(user.id, "article.create", "article", id);
  return { id, slug };
}

function saveTags(articleId: string, raw: string): void {
  run("DELETE FROM article_tags WHERE article_id = ?", articleId);
  const names = [...new Set(raw.split(",").map((tag) => tag.trim().toLowerCase()).filter((tag) => tag.length > 1 && tag.length < 40))].slice(0, 8);
  for (const name of names) {
    const slug = slugify(name);
    let tag = get<{ id: string }>("SELECT id FROM tags WHERE slug = ?", slug);
    if (!tag) {
      const id = newId();
      run("INSERT INTO tags (id, name, slug) VALUES (?, ?, ?)", id, name, slug);
      tag = { id };
    }
    run("INSERT OR IGNORE INTO article_tags (article_id, tag_id) VALUES (?, ?)", articleId, tag.id);
  }
}

export function updateArticle(user: SessionUser, id: string, input: { title: string; excerpt: string; body: string; language: string; categorySlug?: string; tags?: string; imageUrl?: string | null }): void {
  ensureReady();
  assertActive(user);
  const article = ownedArticle(user, id);
  if (!["draft", "changes_requested", "in_review"].includes(article.status) && !hasPublish(user)) {
    throw new AppError(403, "This article can no longer be edited this way");
  }
  const copy = cleanCopy(input.title, input.excerpt, input.body);
  const language = input.language === "af" || input.language === "tn" ? input.language : "en";
  const stamp = new Date().toISOString();
  transaction(() => {
    run(
      "UPDATE articles SET category_id = ?, featured_image = ?, reading_minutes = ?, updated_at = ?, editorial_review_status = 'unreviewed' WHERE id = ?",
      input.categorySlug ? categoryId(input.categorySlug) : article.category_id,
      input.imageUrl === undefined ? article.featured_image : input.imageUrl,
      readingMinutes(copy.body),
      stamp,
      id,
    );
    run(
      `INSERT INTO article_translations (id, article_id, language_code, title, excerpt, body, meta_title, meta_description, review_status, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?)
       ON CONFLICT(article_id, language_code) DO UPDATE SET title = excluded.title, excerpt = excluded.excerpt, body = excluded.body, meta_title = excluded.meta_title, meta_description = excluded.meta_description, review_status = 'draft', updated_at = excluded.updated_at`,
      newId(),
      id,
      language,
      copy.title,
      copy.excerpt,
      copy.body,
      copy.title,
      copy.excerpt,
      stamp,
    );
    saveTags(id, input.tags || "");
    run("INSERT INTO article_revisions (id, article_id, editor_id, revision_type, revision_content, created_at) VALUES (?, ?, ?, 'edit', ?, ?)", newId(), id, user.id, JSON.stringify(copy), stamp);
  });
  audit(user.id, "article.edit", "article", id);
}

function hasPublish(user: SessionUser): boolean {
  return user.roles.includes("administrator") || user.roles.includes("editor");
}

function ownedArticle(user: SessionUser, id: string): { id: string; author_id: string; status: string; category_id: string; slug: string; featured_image: string | null; scheduled_for: string | null } {
  const article = get<{ id: string; author_id: string; status: string; category_id: string; slug: string; featured_image: string | null; scheduled_for: string | null }>("SELECT id, author_id, status, category_id, slug, featured_image, scheduled_for FROM articles WHERE id = ? AND deleted_at IS NULL", id);
  if (!article) throw new AppError(404, "Article not found");
  const canEdit = article.author_id === user.id || user.roles.includes("administrator") || user.roles.includes("editor");
  if (!canEdit) throw new AppError(403, "You cannot edit this article");
  return article;
}

export function submitArticle(user: SessionUser, id: string): void {
  ensureReady();
  assertActive(user);
  const article = ownedArticle(user, id);
  if (article.author_id !== user.id && !hasPublish(user)) throw new AppError(403, "Only the author can submit this draft");
  run("UPDATE articles SET status = 'in_review', editorial_review_status = 'in_review', updated_at = ? WHERE id = ?", new Date().toISOString(), id);
  audit(user.id, "article.submit", "article", id);
}

export function reviewArticle(user: SessionUser, id: string, decision: "approve" | "changes" | "publish" | "remove" | "schedule", note?: string, scheduledFor?: string | null): void {
  ensureReady();
  assertActive(user);
  requirePermission(user.id, decision === "changes" || decision === "approve" ? "articles.review" : "articles.publish");
  const article = get<{ id: string; slug: string; category_id: string; status: string }>("SELECT id, slug, category_id, status FROM articles WHERE id = ? AND deleted_at IS NULL", id);
  if (!article) throw new AppError(404, "Article not found");
  const stamp = new Date().toISOString();
  if (decision === "changes") {
    run("UPDATE articles SET status = 'changes_requested', editorial_review_status = 'rejected', updated_at = ? WHERE id = ?", stamp, id);
  } else if (decision === "remove") {
    run("UPDATE articles SET status = 'removed', deleted_at = ?, updated_at = ? WHERE id = ?", stamp, stamp, id);
    removeIndex("article", article.slug);
  } else if (decision === "schedule" || (decision === "publish" && scheduledFor && scheduledFor > stamp)) {
    if (!scheduledFor) throw new AppError(400, "Choose a publication time");
    run("UPDATE articles SET status = 'scheduled', scheduled_for = ?, editorial_review_status = 'approved', updated_at = ? WHERE id = ?", scheduledFor, stamp, id);
    run("UPDATE article_translations SET review_status = 'approved' WHERE article_id = ? AND review_status = 'draft'", id);
  } else if (decision === "approve") {
    run("UPDATE articles SET editorial_review_status = 'approved', updated_at = ? WHERE id = ?", stamp, id);
    run("UPDATE article_translations SET review_status = 'approved' WHERE article_id = ? AND review_status = 'draft'", id);
  } else if (decision === "publish") {
    publishRecord(id, stamp);
  } else {
    throw new AppError(400, "Choose a review decision");
  }
  run("INSERT INTO article_revisions (id, article_id, editor_id, revision_type, revision_content, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)", newId(), id, user.id, decision, note || decision, note || null, stamp);
  audit(user.id, `article.${decision}`, "article", id);
}

export function publishDueArticles(): number {
  ensureReady();
  const due = all<{ id: string }>("SELECT id FROM articles WHERE status = 'scheduled' AND scheduled_for IS NOT NULL AND scheduled_for <= ? AND deleted_at IS NULL", new Date().toISOString());
  for (const article of due) publishRecord(article.id, new Date().toISOString());
  return due.length;
}

function publishRecord(id: string, stamp: string): void {
  const article = get<{ slug: string; category_id: string; author_id: string }>("SELECT slug, category_id, author_id FROM articles WHERE id = ?", id);
  if (!article) return;
  run("UPDATE articles SET status = 'published', editorial_review_status = 'approved', published_at = COALESCE(published_at, ?), updated_at = ?, alerts_sent = 0 WHERE id = ?", stamp, stamp, id);
  run("UPDATE article_translations SET review_status = 'approved' WHERE article_id = ? AND review_status IN ('draft', 'in_review')", id);
  const translations = all<{ language_code: string; title: string; excerpt: string; body: string }>("SELECT language_code, title, excerpt, body FROM article_translations WHERE article_id = ? AND review_status = 'approved'", id);
  for (const translation of translations) {
    indexDocument({ entityType: "article", entityId: article.slug, language: translation.language_code, title: translation.title, body: `${translation.excerpt}\n${translation.body}`, publishedAt: stamp, popularity: 1 });
  }
  const category = get<{ slug: string }>("SELECT slug FROM article_categories WHERE id = ?", article.category_id);
  const title = translations.find((item) => item.language_code === "en")?.title || translations[0]?.title || "News";
  const excerpt = translations.find((item) => item.language_code === "en")?.excerpt || translations[0]?.excerpt || "";
  if (category) fanout(`news:${category.slug}`, title, excerpt, `/news/${article.slug}`);
  if (category?.slug === "breaking-news" || category?.slug === "municipal") {
    fanout(category.slug === "breaking-news" ? "breaking" : "municipal", title, excerpt, `/news/${article.slug}`);
    run("UPDATE articles SET alerts_sent = 1 WHERE id = ?", id);
  }
  track("article.publish", "article", id, article.author_id);
}

export function fileTranslation(user: SessionUser, articleId: string, language: string, title: string, excerpt: string, body: string): void {
  ensureReady();
  assertActive(user);
  requirePermission(user.id, "translations.manage");
  if (language !== "af" && language !== "tn") throw new AppError(400, "File an Afrikaans or Setswana draft");
  if (!get("SELECT id FROM articles WHERE id = ? AND deleted_at IS NULL", articleId)) throw new AppError(404, "Article not found");
  const copy = cleanCopy(title, excerpt, body);
  const stamp = new Date().toISOString();
  run(
    `INSERT INTO article_translations (id, article_id, language_code, title, excerpt, body, meta_title, meta_description, review_status, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?)
     ON CONFLICT(article_id, language_code) DO UPDATE SET title = excluded.title, excerpt = excluded.excerpt, body = excluded.body, review_status = 'draft', updated_at = excluded.updated_at`,
    newId(),
    articleId,
    language,
    copy.title,
    copy.excerpt,
    copy.body,
    copy.title,
    copy.excerpt,
    stamp,
  );
  audit(user.id, "article.translate", "article", articleId, { language });
}

export function approveTranslation(user: SessionUser, articleId: string, language: string): void {
  ensureReady();
  assertActive(user);
  requirePermission(user.id, "articles.publish");
  if (language !== "af" && language !== "tn") throw new AppError(400, "Choose Afrikaans or Setswana");
  const row = get<{ title: string; excerpt: string; body: string }>("SELECT title, excerpt, body FROM article_translations WHERE article_id = ? AND language_code = ? AND review_status = 'draft'", articleId, language);
  if (!row) throw new AppError(404, "No draft is waiting in that language");
  const article = get<{ slug: string; status: string }>("SELECT slug, status FROM articles WHERE id = ?", articleId);
  if (!article) throw new AppError(404, "Article not found");
  run("UPDATE article_translations SET review_status = 'approved', updated_at = ? WHERE article_id = ? AND language_code = ?", new Date().toISOString(), articleId, language);
  if (article.status === "published") indexDocument({ entityType: "article", entityId: article.slug, language, title: row.title, body: `${row.excerpt}\n${row.body}`, publishedAt: new Date().toISOString() });
  audit(user.id, "article.translate.approve", "article", articleId, { language });
}

export function listCorrections(): Array<{ slug: string; title: string; note: string; created_at: string; kind: string }> {
  ensureReady();
  const articles = all<{ slug: string; title: string; note: string; created_at: string }>(
    `SELECT a.slug, COALESCE(tr.title, a.slug) as title, r.note, r.created_at
     FROM article_revisions r
     JOIN articles a ON a.id = r.article_id
     LEFT JOIN article_translations tr ON tr.article_id = a.id AND tr.language_code = 'en'
     WHERE r.revision_type = 'correction' AND r.note IS NOT NULL AND a.deleted_at IS NULL
     ORDER BY r.created_at DESC LIMIT 20`,
  ).map((row) => ({ ...row, kind: "article" }));
  const wires = all<{ slug: string; title: string; note: string; created_at: string }>(
    "SELECT slug, headline as title, correction_note as note, COALESCE(withdrawn_at, updated_at) as created_at FROM news_items WHERE correction_note IS NOT NULL AND correction_note != '' ORDER BY created_at DESC LIMIT 20",
  ).map((row) => ({ ...row, kind: "wire" }));
  return [...articles, ...wires].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 20);
}

export function correctArticle(user: SessionUser, id: string, note: string, body?: string): void {
  ensureReady();
  assertActive(user);
  requirePermission(user.id, "articles.publish");
  if (note.trim().length < 8) throw new AppError(400, "Describe the correction");
  const article = get<{ slug: string }>("SELECT slug FROM articles WHERE id = ? AND status = 'published'", id);
  if (!article) throw new AppError(404, "Published article not found");
  const stamp = new Date().toISOString();
  if (body?.trim()) {
    run("UPDATE article_translations SET body = ?, review_status = 'approved', updated_at = ? WHERE article_id = ? AND language_code = 'en'", body.trim(), stamp, id);
  }
  run("INSERT INTO article_revisions (id, article_id, editor_id, revision_type, revision_content, note, created_at) VALUES (?, ?, ?, 'correction', ?, ?, ?)", newId(), id, user.id, body || note, note.trim(), stamp);
  run("UPDATE articles SET updated_at = ? WHERE id = ?", stamp, id);
  fanout(`story:article:${id}`, "Correction", note.trim().slice(0, 180), `/news/${article.slug}`);
  audit(user.id, "article.correct", "article", id);
}

export function relatedStories(categorySlug: string, except: { articleId?: string; newsId?: string }): Array<{ href: string; title: string; source: string }> {
  ensureReady();
  const articles = all<{ slug: string; title: string; author: string }>(
    `SELECT a.slug, tr.title, p.display_name as author
     FROM articles a
     JOIN article_categories c ON c.id = a.category_id
     JOIN article_translations tr ON tr.article_id = a.id AND tr.language_code = 'en' AND tr.review_status = 'approved'
     JOIN profiles p ON p.user_id = a.author_id
     WHERE a.status = 'published' AND a.deleted_at IS NULL AND c.slug = ? AND a.id != ?
     ORDER BY a.published_at DESC LIMIT 3`,
    categorySlug,
    except.articleId || "",
  ).map((row) => ({ href: `/news/${row.slug}`, title: row.title, source: row.author }));
  const wires = all<{ slug: string; headline: string; publisher: string }>(
    "SELECT slug, headline, publisher FROM news_items WHERE status = 'published' AND category_slug = ? AND id != ? ORDER BY published_at DESC LIMIT 3",
    categorySlug,
    except.newsId || "",
  ).map((row) => ({ href: `/news/${row.slug}`, title: row.headline, source: row.publisher }));
  return [...articles, ...wires].slice(0, 4);
}

export type ArticleCard = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  language: string;
  fallback: boolean;
  category: string;
  categorySlug: string;
  author: string;
  publishedAt: string | null;
  readingMinutes: number;
  featured: boolean;
  image: string | null;
  demo: boolean;
};

export function listArticles(options: { locale: string; category?: string; page?: number; pageSize?: number; featured?: boolean }): { items: ArticleCard[]; total: number } {
  ensureReady();
  const pageSize = options.pageSize || 12;
  const page = Math.max(1, options.page || 1);
  const where = ["a.status = 'published'", "a.deleted_at IS NULL", "(a.published_at IS NULL OR a.published_at <= ?)"];
  const params: Array<string | number> = [new Date().toISOString()];
  if (options.category) {
    where.push("c.slug = ?");
    params.push(options.category);
  }
  if (options.featured) where.push("a.is_featured = 1");
  const total = get<{ count: number }>(`SELECT COUNT(*) as count FROM articles a JOIN article_categories c ON c.id = a.category_id WHERE ${where.join(" AND ")}`, ...params)?.count ?? 0;
  const rows = all<ArticleCard & { en_title: string | null; tr_title: string | null; en_excerpt: string | null; tr_excerpt: string | null }>(
    `SELECT a.id, a.slug, a.published_at as publishedAt, a.reading_minutes as readingMinutes, a.is_featured as featured, a.featured_image as image, a.is_demo as demo,
            c.name as category, c.slug as categorySlug, p.display_name as author,
            tr.title as tr_title, tr.excerpt as tr_excerpt, en.title as en_title, en.excerpt as en_excerpt
     FROM articles a
     JOIN article_categories c ON c.id = a.category_id
     JOIN profiles p ON p.user_id = a.author_id
     LEFT JOIN article_translations tr ON tr.article_id = a.id AND tr.language_code = ? AND tr.review_status = 'approved'
     LEFT JOIN article_translations en ON en.article_id = a.id AND en.language_code = 'en' AND en.review_status = 'approved'
     WHERE ${where.join(" AND ")} AND (tr.id IS NOT NULL OR en.id IS NOT NULL)
     ORDER BY a.is_featured DESC, a.published_at DESC
     LIMIT ? OFFSET ?`,
    options.locale,
    ...params,
    pageSize,
    (page - 1) * pageSize,
  );
  return {
    total,
    items: rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      title: row.tr_title || row.en_title || "",
      excerpt: row.tr_excerpt || row.en_excerpt || "",
      language: row.tr_title ? options.locale : "en",
      fallback: !row.tr_title && options.locale !== "en",
      category: row.category,
      categorySlug: row.categorySlug,
      author: row.author,
      publishedAt: row.publishedAt,
      readingMinutes: Number(row.readingMinutes),
      featured: Boolean(row.featured),
      image: row.image,
      demo: Boolean(row.demo),
    })),
  };
}

export function getArticle(slug: string, locale: string): (ArticleCard & { body: string; sources: Array<{ source_name: string; source_url: string | null }>; corrections: Array<{ note: string | null; created_at: string }>; tags: string[] }) | null {
  ensureReady();
  const row = get<{
    id: string; slug: string; published_at: string | null; reading_minutes: number; is_featured: number; featured_image: string | null; is_demo: number;
    category: string; categorySlug: string; author: string; tr_title: string | null; tr_excerpt: string | null; tr_body: string | null; en_title: string | null; en_excerpt: string | null; en_body: string | null;
  }>(
    `SELECT a.id, a.slug, a.published_at, a.reading_minutes, a.is_featured, a.featured_image, a.is_demo,
            c.name as category, c.slug as categorySlug, p.display_name as author,
            tr.title as tr_title, tr.excerpt as tr_excerpt, tr.body as tr_body,
            en.title as en_title, en.excerpt as en_excerpt, en.body as en_body
     FROM articles a
     JOIN article_categories c ON c.id = a.category_id
     JOIN profiles p ON p.user_id = a.author_id
     LEFT JOIN article_translations tr ON tr.article_id = a.id AND tr.language_code = ? AND tr.review_status = 'approved'
     LEFT JOIN article_translations en ON en.article_id = a.id AND en.language_code = 'en' AND en.review_status = 'approved'
     WHERE a.slug = ? AND a.status = 'published' AND a.deleted_at IS NULL`,
    locale,
    slug,
  );
  if (!row || (!row.tr_title && !row.en_title)) return null;
  return {
    id: row.id,
    slug: row.slug,
    title: row.tr_title || row.en_title || "",
    excerpt: row.tr_excerpt || row.en_excerpt || "",
    body: row.tr_body || row.en_body || "",
    language: row.tr_title ? locale : "en",
    fallback: !row.tr_title && locale !== "en",
    category: row.category,
    categorySlug: row.categorySlug,
    author: row.author,
    publishedAt: row.published_at,
    readingMinutes: row.reading_minutes,
    featured: row.is_featured === 1,
    image: row.featured_image,
    demo: row.is_demo === 1,
    sources: all("SELECT source_name, source_url FROM article_sources WHERE article_id = ?", row.id),
    corrections: all("SELECT note, created_at FROM article_revisions WHERE article_id = ? AND revision_type = 'correction' ORDER BY created_at DESC", row.id),
    tags: all<{ name: string }>("SELECT t.name as name FROM article_tags at JOIN tags t ON t.id = at.tag_id WHERE at.article_id = ?", row.id).map((tag) => tag.name),
  };
}

export function rememberView(slug: string, userId: string | null): void {
  ensureReady();
  const article = get<{ id: string }>("SELECT id FROM articles WHERE slug = ? AND status = 'published'", slug);
  if (!article) return;
  run("UPDATE articles SET view_count = view_count + 1 WHERE id = ?", article.id);
  track("article.view", "article", article.id, userId);
}

export function addArticleComment(user: SessionUser, articleId: string, body: string, parentId?: string | null): void {
  ensureReady();
  assertActive(user);
  rateLimit(`comment:${user.id}`, 40, 60 * 60 * 1000);
  const text = body.trim();
  if (text.length < 2 || text.length > 2000) throw new AppError(400, "Comment must be between 2 and 2000 characters");
  if (containsSensitiveIdentity(text)) throw new AppError(400, "Remove identity numbers before posting");
  const article = get("SELECT id FROM articles WHERE id = ? AND status = 'published' AND deleted_at IS NULL", articleId);
  if (!article) throw new AppError(404, "Article not found");
  run(
    "INSERT INTO article_comments (id, article_id, user_id, parent_id, body, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    newId(),
    articleId,
    user.id,
    parentId || null,
    text,
    user.isMinor ? "pending" : "published",
    new Date().toISOString(),
  );
}

export function listArticleComments(articleId: string): Array<{ id: string; parent_id: string | null; body: string; created_at: string; display_name: string; username: string }> {
  ensureReady();
  return all(
    `SELECT c.id, c.parent_id, c.body, c.created_at, p.display_name, p.username
     FROM article_comments c JOIN profiles p ON p.user_id = c.user_id
     WHERE c.article_id = ? AND c.status = 'published' AND c.deleted_at IS NULL
     ORDER BY c.created_at ASC`,
    articleId,
  );
}

export function newsCategories(): Array<{ id: string; name: string; slug: string }> {
  ensureReady();
  return all("SELECT id, name, slug FROM article_categories ORDER BY name");
}
