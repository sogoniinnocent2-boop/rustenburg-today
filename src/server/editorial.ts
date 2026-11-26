import { ARTICLE_REACTIONS, isArticleReaction, type ArticleReactionId } from "@/lib/reactions";
import {
  EDITORIAL_PRIORITIES,
  MAX_DEPARTMENT_HEADLINES,
  MAX_SITE_HEADLINES,
  NEWS_PUBLISHING_DEPARTMENTS,
  isNewsPublishingDepartment,
  normalizeDisplayType,
  normalizePriority,
  type EditorialPriority,
  type NewsDisplayType,
} from "@/lib/news-display";
import { containsSensitiveIdentity, readingMinutes, safeExternalUrl, slugify } from "@/lib/text";
import type { SessionUser } from "./auth";
import { assertActive } from "./auth";
import { all, get, newId, run, transaction } from "./db";
import { AppError } from "./errors";
import { ensureReady } from "./init";
import { embedVideo } from "./community";
import { canPublishSection } from "./departments";
import { requirePermission } from "./permissions";
import { audit, indexDocument, rateLimit, removeIndex, track } from "./store";
import { fanout, notifyOfficialPublication } from "./alerts";

export { NEWS_PUBLISHING_DEPARTMENTS, EDITORIAL_PRIORITIES, type NewsDisplayType, type EditorialPriority };

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

export function createArticle(user: SessionUser, input: {
  categorySlug: string;
  language: string;
  title: string;
  excerpt: string;
  body: string;
  tags?: string;
  sourceName?: string;
  sourceUrl?: string;
  featured?: boolean;
  scheduledFor?: string | null;
  imageUrl?: string | null;
  departmentSlug?: string | null;
  videoUrl?: string | null;
  metaTitle?: string | null;
  metaDescription?: string | null;
  locationId?: string | null;
  displayType?: NewsDisplayType | string | null;
  priority?: EditorialPriority | string | null;
  headlineExpiresAt?: string | null;
}): { id: string; slug: string } {
  ensureReady();
  assertActive(user);
  requirePermission(user.id, "articles.create");
  rateLimit(`article:${user.id}`, 20, 60 * 60 * 1000);
  const copy = cleanCopy(input.title, input.excerpt, input.body);
  const language = input.language === "af" || input.language === "tn" ? input.language : "en";
  const id = newId();
  const slug = uniqueSlug("articles", copy.title);
  const stamp = new Date().toISOString();
  const departmentSlug = (input.departmentSlug?.trim().toLowerCase() || departmentForCategory(input.categorySlug, null));
  assertDepartmentWritable(user, departmentSlug);
  if (input.locationId && !get("SELECT id FROM locations WHERE id = ? AND active = 1", input.locationId)) {
    throw new AppError(400, "Choose a valid location or leave it blank");
  }
  const videoEmbedUrl = input.videoUrl?.trim() ? embedVideo(input.videoUrl.trim()) : null;
  if (input.videoUrl?.trim() && !videoEmbedUrl) throw new AppError(400, "Use an https YouTube or Vimeo link for the video");
  const metaTitle = (input.metaTitle || copy.title).trim().slice(0, 160);
  const metaDescription = (input.metaDescription || copy.excerpt).trim().slice(0, 320);
  const classification = resolveClassification(user, {
    displayType: input.displayType ?? (input.featured ? "headline" : "body"),
    priority: input.priority,
    headlineExpiresAt: input.headlineExpiresAt,
    departmentSlug,
    forPublish: false,
  });
  transaction(() => {
    run(
      `INSERT INTO articles (id, author_id, category_id, slug, status, editorial_review_status, featured_image, is_featured, is_breaking, reading_minutes, department_slug, video_embed, location_id, news_display_type, editorial_priority, headline_expires_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'draft', 'unreviewed', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      user.id,
      categoryId(input.categorySlug),
      slug,
      input.imageUrl || null,
      classification.isFeatured,
      classification.isBreaking,
      readingMinutes(copy.body),
      departmentSlug,
      videoEmbedUrl,
      input.locationId || null,
      classification.displayType,
      classification.priority,
      classification.headlineExpiresAt,
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
      metaTitle,
      metaDescription,
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

function deskCategory(section: string, requested?: string): string {
  if (requested && get("SELECT id FROM article_categories WHERE slug = ?", requested)) return requested;
  const map: Record<string, string> = {
    news: "local-news",
    community: "community",
    business: "business-mining",
    events: "announcements",
    sports: "sports",
    health: "health",
    learn: "education",
    jobs: "jobs-opportunities",
    transport: "traffic",
    voice: "politics",
    notices: "announcements",
    agriculture: "agriculture",
    technology: "technology",
    tourism: "lifestyle",
    youth: "community",
    food: "lifestyle",
    family: "lifestyle",
    faith: "community",
    services: "lifestyle",
    support: "community",
    history: "local-news",
    creators: "entertainment",
  };
  const mapped = map[section] || "local-news";
  return get("SELECT id FROM article_categories WHERE slug = ?", mapped) ? mapped : "local-news";
}

export function publishDeskArticle(
  user: SessionUser,
  input: { categorySlug: string; language: string; title: string; excerpt: string; body: string; tags?: string; sourceName?: string; sourceUrl?: string; imageUrl?: string | null; departmentSlug?: string; videoUrl?: string | null },
): { id: string; slug: string } {
  return publishDeskStory(user, {
    section: input.departmentSlug || "news",
    language: input.language,
    headline: input.title,
    summary: input.excerpt,
    body: input.body,
    categorySlug: input.categorySlug,
    tags: input.tags,
    sourceName: input.sourceName,
    sourceUrl: input.sourceUrl,
    imageUrl: input.imageUrl,
    videoUrl: input.videoUrl,
  });
}

export function publishDeskStory(
  user: SessionUser,
  input: {
    section: string;
    language: string;
    headline: string;
    summary: string;
    body: string;
    categorySlug?: string;
    tags?: string;
    sourceName?: string;
    sourceUrl?: string;
    imageUrl?: string | null;
    videoUrl?: string | null;
  },
): { id: string; slug: string } {
  ensureReady();
  assertActive(user);
  const section = input.section.trim().toLowerCase();
  if (!canPublishSection(user, section)) throw new AppError(403, "You are not assigned to this department");
  if (!input.imageUrl) throw new AppError(400, "Add a picture for this story update");
  const created = createArticle(user, {
    categorySlug: deskCategory(section, input.categorySlug),
    language: input.language,
    title: input.headline,
    excerpt: input.summary,
    body: input.body,
    tags: input.tags,
    sourceName: input.sourceName,
    sourceUrl: input.sourceUrl,
    imageUrl: input.imageUrl,
    videoUrl: input.videoUrl,
    departmentSlug: section,
  });
  const stamp = new Date().toISOString();
  publishRecord(created.id, stamp);
  run("INSERT INTO article_revisions (id, article_id, editor_id, revision_type, revision_content, note, created_at) VALUES (?, ?, ?, 'publish', 'desk', ?, ?)", newId(), created.id, user.id, `Published from the ${section} desk`, stamp);
  audit(user.id, "article.desk_publish", "article", created.id, { section });
  return created;
}

export function listDepartmentStories(
  section: string,
  locale: string,
  limit = 12,
  options: { displayType?: NewsDisplayType | "all" } = {},
): ArticleCard[] {
  ensureReady();
  expireHeadlineSlots();
  const where = ["a.status = 'published'", "a.deleted_at IS NULL", "a.department_slug = ?", "(tr.id IS NOT NULL OR en.id IS NOT NULL)"];
  const params: Array<string | number> = [locale, section];
  if (options.displayType === "headline" || options.displayType === "body") {
    where.push("IFNULL(a.news_display_type, 'body') = ?");
    params.push(options.displayType);
  }
  params.push(Math.min(limit, 24));
  const rows = all<ArticleCard & { en_title: string | null; tr_title: string | null; en_excerpt: string | null; tr_excerpt: string | null; news_display_type: string | null; editorial_priority: string | null }>(
    `SELECT a.id, a.slug, a.published_at as publishedAt, a.reading_minutes as readingMinutes, a.is_featured as featured, a.featured_image as image, a.video_embed as video, a.is_demo as demo,
            a.news_display_type, a.editorial_priority,
            c.name as category, c.slug as categorySlug, p.display_name as author,
            tr.title as tr_title, tr.excerpt as tr_excerpt, en.title as en_title, en.excerpt as en_excerpt
     FROM articles a
     JOIN article_categories c ON c.id = a.category_id
     JOIN profiles p ON p.user_id = a.author_id
     LEFT JOIN article_translations tr ON tr.article_id = a.id AND tr.language_code = ? AND tr.review_status = 'approved'
     LEFT JOIN article_translations en ON en.article_id = a.id AND en.language_code = 'en' AND en.review_status = 'approved'
     WHERE ${where.join(" AND ")}
     ORDER BY CASE WHEN IFNULL(a.news_display_type, 'body') = 'headline' THEN 0 ELSE 1 END, a.published_at DESC LIMIT ?`,
    ...params,
  );
  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    title: row.tr_title || row.en_title || "",
    excerpt: row.tr_excerpt || row.en_excerpt || "",
    language: row.tr_title ? locale : "en",
    fallback: !row.tr_title && locale !== "en",
    category: row.category,
    categorySlug: row.categorySlug,
    author: row.author,
    publishedAt: row.publishedAt,
    readingMinutes: Number(row.readingMinutes),
    featured: Boolean(row.featured),
    image: row.image,
    video: row.video || null,
    demo: Boolean(row.demo),
    displayType: normalizeDisplayType(row.news_display_type),
    priority: normalizePriority(row.editorial_priority),
  }));
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

export function updateArticle(user: SessionUser, id: string, input: {
  title: string;
  excerpt: string;
  body: string;
  language: string;
  categorySlug?: string;
  tags?: string;
  imageUrl?: string | null;
  departmentSlug?: string | null;
  metaTitle?: string | null;
  metaDescription?: string | null;
  locationId?: string | null;
  keepPublished?: boolean;
  displayType?: NewsDisplayType | string | null;
  priority?: EditorialPriority | string | null;
  headlineExpiresAt?: string | null;
}): void {
  ensureReady();
  assertActive(user);
  const article = ownedArticle(user, id);
  if (!["draft", "changes_requested", "in_review", "unpublished", "archived"].includes(article.status) && !hasPublish(user)) {
    throw new AppError(403, "This article can no longer be edited this way");
  }
  if (article.status === "published" && !hasPublish(user)) throw new AppError(403, "Only editors can change a published article");
  const copy = cleanCopy(input.title, input.excerpt, input.body);
  const language = input.language === "af" || input.language === "tn" ? input.language : "en";
  const stamp = new Date().toISOString();
  const keepLive = Boolean(input.keepPublished && article.status === "published" && hasPublish(user));
  const categorySlug = input.categorySlug || get<{ slug: string }>("SELECT slug FROM article_categories WHERE id = ?", article.category_id)?.slug || "local-news";
  const departmentSlug = input.departmentSlug?.trim().toLowerCase() || departmentForCategory(categorySlug, null);
  assertDepartmentWritable(user, departmentSlug);
  if (input.locationId && !get("SELECT id FROM locations WHERE id = ? AND active = 1", input.locationId)) {
    throw new AppError(400, "Choose a valid location or leave it blank");
  }
  const metaTitle = (input.metaTitle || copy.title).trim().slice(0, 160);
  const metaDescription = (input.metaDescription || copy.excerpt).trim().slice(0, 320);
  const translationStatus = keepLive ? "approved" : "draft";
  const classification = resolveClassification(user, {
    displayType: input.displayType,
    priority: input.priority,
    headlineExpiresAt: input.headlineExpiresAt,
    departmentSlug,
    forPublish: keepLive,
    excludeArticleId: id,
  });
  transaction(() => {
    run(
      "UPDATE articles SET category_id = ?, featured_image = ?, reading_minutes = ?, department_slug = ?, location_id = COALESCE(?, location_id), news_display_type = ?, editorial_priority = ?, headline_expires_at = ?, is_featured = ?, is_breaking = ?, updated_at = ?, editorial_review_status = ? WHERE id = ?",
      input.categorySlug ? categoryId(input.categorySlug) : article.category_id,
      input.imageUrl === undefined ? article.featured_image : input.imageUrl,
      readingMinutes(copy.body),
      departmentSlug,
      input.locationId === undefined ? null : input.locationId,
      classification.displayType,
      classification.priority,
      classification.headlineExpiresAt,
      classification.isFeatured,
      classification.isBreaking,
      stamp,
      keepLive ? "approved" : "unreviewed",
      id,
    );
    run(
      `INSERT INTO article_translations (id, article_id, language_code, title, excerpt, body, meta_title, meta_description, review_status, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(article_id, language_code) DO UPDATE SET title = excluded.title, excerpt = excluded.excerpt, body = excluded.body, meta_title = excluded.meta_title, meta_description = excluded.meta_description, review_status = excluded.review_status, updated_at = excluded.updated_at`,
      newId(),
      id,
      language,
      copy.title,
      copy.excerpt,
      copy.body,
      metaTitle,
      metaDescription,
      translationStatus,
      stamp,
    );
    saveTags(id, input.tags || "");
    run("INSERT INTO article_revisions (id, article_id, editor_id, revision_type, revision_content, created_at) VALUES (?, ?, ?, 'edit', ?, ?)", newId(), id, user.id, JSON.stringify(copy), stamp);
  });
  if (keepLive) {
    indexDocument({
      entityType: "article",
      entityId: article.slug,
      language,
      title: copy.title,
      body: `${copy.excerpt}\n${copy.body}`,
      publishedAt: stamp,
      popularity: 1,
    });
  }
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
  const article = get<{ id: string; slug: string; category_id: string; status: string; author_id: string; department_slug: string | null }>(
    "SELECT id, slug, category_id, status, author_id, department_slug FROM articles WHERE id = ? AND deleted_at IS NULL",
    id,
  );
  if (!article) throw new AppError(404, "Article not found");
  const categorySlug = get<{ slug: string }>("SELECT slug FROM article_categories WHERE id = ?", article.category_id)?.slug || "local-news";
  const desk = article.department_slug || departmentForCategory(categorySlug, null);
  const deskPublish = decision === "publish" && canPublishSection(user, desk) && article.author_id === user.id;
  if (!deskPublish) {
    requirePermission(user.id, decision === "changes" || decision === "approve" ? "articles.review" : "articles.publish");
  }
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
  const article = get<{
    slug: string;
    category_id: string;
    author_id: string;
    department_slug: string | null;
    news_display_type: string | null;
    editorial_priority: string | null;
    headline_expires_at: string | null;
    is_breaking: number;
  }>(
    "SELECT slug, category_id, author_id, department_slug, news_display_type, editorial_priority, headline_expires_at, is_breaking FROM articles WHERE id = ?",
    id,
  );
  if (!article) return;
  const category = get<{ slug: string }>("SELECT slug FROM article_categories WHERE id = ?", article.category_id);
  const departmentSlug = article.department_slug || departmentForCategory(category?.slug || "local-news", null);
  const displayType = normalizeDisplayType(article.news_display_type);
  if (displayType === "headline") {
    assertHeadlineCapacity(departmentSlug, id);
  }
  const expired = article.headline_expires_at && article.headline_expires_at <= stamp;
  const liveDisplay = displayType === "headline" && !expired ? "headline" : displayType === "headline" && expired ? "body" : displayType;
  run(
    "UPDATE articles SET status = 'published', editorial_review_status = 'approved', published_at = COALESCE(published_at, ?), updated_at = ?, alerts_sent = 0, department_slug = ?, news_display_type = ?, is_featured = ? WHERE id = ?",
    stamp,
    stamp,
    departmentSlug,
    liveDisplay,
    liveDisplay === "headline" ? 1 : 0,
    id,
  );
  run("UPDATE article_translations SET review_status = 'approved' WHERE article_id = ? AND review_status IN ('draft', 'in_review')", id);
  const translations = all<{ language_code: string; title: string; excerpt: string; body: string }>("SELECT language_code, title, excerpt, body FROM article_translations WHERE article_id = ? AND review_status = 'approved'", id);
  for (const translation of translations) {
    indexDocument({ entityType: "article", entityId: article.slug, language: translation.language_code, title: translation.title, body: `${translation.excerpt}\n${translation.body}`, publishedAt: stamp, popularity: 1 });
  }
  const title = translations.find((item) => item.language_code === "en")?.title || translations[0]?.title || "News";
  const excerpt = translations.find((item) => item.language_code === "en")?.excerpt || translations[0]?.excerpt || "";
  const href = publicArticleHref(article.slug);
  const locationId = get<{ location_id: string | null }>("SELECT location_id FROM articles WHERE id = ?", id)?.location_id || null;
  notifyOfficialPublication({
    articleId: id,
    title,
    body: excerpt,
    href,
    departmentSlug,
    categorySlug: category?.slug || null,
    locationId,
  });
  const priority = normalizePriority(article.editorial_priority);
  if (priority === "breaking" || article.is_breaking === 1 || category?.slug === "breaking-news") {
    fanout("breaking", title, excerpt, href, locationId);
  } else if (category?.slug === "municipal") {
    fanout("municipal", title, excerpt, href, locationId);
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
  video: string | null;
  demo: boolean;
  displayType?: NewsDisplayType;
  priority?: EditorialPriority;
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
    `SELECT a.id, a.slug, a.published_at as publishedAt, a.reading_minutes as readingMinutes, a.is_featured as featured, a.featured_image as image, a.video_embed as video, a.is_demo as demo,
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
      video: row.video || null,
      demo: Boolean(row.demo),
    })),
  };
}

export function getArticle(slug: string, locale: string): (ArticleCard & { body: string; sources: Array<{ source_name: string; source_url: string | null }>; corrections: Array<{ note: string | null; created_at: string }>; tags: string[] }) | null {
  ensureReady();
  const row = get<{
    id: string; slug: string; published_at: string | null; reading_minutes: number; is_featured: number; featured_image: string | null; video_embed: string | null; is_demo: number;
    category: string; categorySlug: string; author: string; tr_title: string | null; tr_excerpt: string | null; tr_body: string | null; en_title: string | null; en_excerpt: string | null; en_body: string | null;
  }>(
    `SELECT a.id, a.slug, a.published_at, a.reading_minutes, a.is_featured, a.featured_image, a.video_embed, a.is_demo,
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
    video: row.video_embed,
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

export { ARTICLE_REACTIONS, type ArticleReactionId } from "@/lib/reactions";

export function reactToArticle(user: SessionUser, articleId: string, reaction: string): ArticleReactionId | null {
  ensureReady();
  assertActive(user);
  const kind = isArticleReaction(reaction) ? reaction : "like";
  if (!get("SELECT id FROM articles WHERE id = ? AND status = 'published' AND deleted_at IS NULL", articleId)) {
    throw new AppError(404, "Article not found");
  }
  const existing = get<{ id: string; reaction_type: string }>(
    "SELECT id, reaction_type FROM article_reactions WHERE article_id = ? AND user_id = ?",
    articleId,
    user.id,
  );
  if (existing && existing.reaction_type === kind) {
    run("DELETE FROM article_reactions WHERE id = ?", existing.id);
    audit(user.id, "article.unreact", "article", articleId, { reaction: kind });
    return null;
  }
  if (existing) {
    run("UPDATE article_reactions SET reaction_type = ?, created_at = ? WHERE id = ?", kind, new Date().toISOString(), existing.id);
  } else {
    run(
      "INSERT INTO article_reactions (id, article_id, user_id, reaction_type, created_at) VALUES (?, ?, ?, ?, ?)",
      newId(),
      articleId,
      user.id,
      kind,
      new Date().toISOString(),
    );
  }
  audit(user.id, "article.react", "article", articleId, { reaction: kind });
  return kind;
}

export function articleReactions(articleId: string, viewerId?: string | null): {
  mine: ArticleReactionId | "";
  total: number;
  counts: Record<ArticleReactionId, number>;
} {
  ensureReady();
  const counts = Object.fromEntries(ARTICLE_REACTIONS.map((item) => [item.id, 0])) as Record<ArticleReactionId, number>;
  for (const row of all<{ reaction_type: string; total: number }>(
    "SELECT reaction_type, COUNT(*) as total FROM article_reactions WHERE article_id = ? GROUP BY reaction_type",
    articleId,
  )) {
    if (row.reaction_type in counts) counts[row.reaction_type as ArticleReactionId] = Number(row.total);
  }
  const mine = viewerId
    ? get<{ reaction_type: string }>("SELECT reaction_type FROM article_reactions WHERE article_id = ? AND user_id = ?", articleId, viewerId)?.reaction_type || ""
    : "";
  return {
    mine: isArticleReaction(mine) ? mine : "",
    total: Object.values(counts).reduce((sum, value) => sum + value, 0),
    counts,
  };
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

/** Maps an article category (and optional desk) to the public frontend section that should surface it. */
export function departmentForCategory(categorySlug: string, departmentSlug?: string | null): string {
  if (departmentSlug && sectionBySlugSafe(departmentSlug)) return departmentSlug;
  const map: Record<string, string> = {
    "local-news": "news",
    municipal: "news",
    "crime-safety": "news",
    community: "community",
    announcements: "notices",
    "breaking-news": "news",
    sports: "sports",
    education: "learn",
    "business-mining": "business",
    health: "health",
    traffic: "transport",
    politics: "voice",
    "jobs-opportunities": "jobs",
    agriculture: "agriculture",
    environment: "agriculture",
    entertainment: "creators",
    lifestyle: "tourism",
    technology: "technology",
    world: "news",
    africa: "news",
    "south-africa": "news",
    multimedia: "tv",
    investigations: "news",
    opinion: "news",
  };
  return map[categorySlug] || "news";
}

function sectionBySlugSafe(slug: string): boolean {
  return isNewsPublishingDepartment(slug) || ["tv", "podcasts", "radio", "music", "property", "marketplace"].includes(slug);
}

function canSetProminentPriority(user: SessionUser): boolean {
  return user.roles.includes("administrator") || user.roles.includes("editor") || user.roles.includes("department_editor");
}

function assertDepartmentWritable(user: SessionUser, departmentSlug: string): void {
  if (!isNewsPublishingDepartment(departmentSlug) && !sectionBySlugSafe(departmentSlug)) {
    throw new AppError(400, "Choose a valid publishing department");
  }
  if (user.roles.includes("administrator") || user.roles.includes("editor")) return;
  if (canPublishSection(user, departmentSlug)) return;
  // Journalists with articles.create may draft for a desk; publishing still needs review or assignment.
  if (user.roles.includes("journalist")) return;
  throw new AppError(403, "You cannot publish for this department");
}

function assertHeadlineCapacity(departmentSlug: string, excludeArticleId?: string): void {
  const now = new Date().toISOString();
  const site = get<{ count: number }>(
    `SELECT COUNT(*) as count FROM articles
     WHERE status = 'published' AND deleted_at IS NULL AND news_display_type = 'headline' AND is_demo = 0
       AND (headline_expires_at IS NULL OR headline_expires_at > ?)
       AND (? IS NULL OR id != ?)`,
    now,
    excludeArticleId || null,
    excludeArticleId || null,
  )?.count ?? 0;
  if (site >= MAX_SITE_HEADLINES) {
    throw new AppError(409, `Headline News is full (limit ${MAX_SITE_HEADLINES}). Unpublish or expire an existing headline first.`);
  }
  const dept = get<{ count: number }>(
    `SELECT COUNT(*) as count FROM articles
     WHERE status = 'published' AND deleted_at IS NULL AND news_display_type = 'headline' AND is_demo = 0
       AND department_slug = ?
       AND (headline_expires_at IS NULL OR headline_expires_at > ?)
       AND (? IS NULL OR id != ?)`,
    departmentSlug,
    now,
    excludeArticleId || null,
    excludeArticleId || null,
  )?.count ?? 0;
  if (dept >= MAX_DEPARTMENT_HEADLINES) {
    throw new AppError(409, `This department already has ${MAX_DEPARTMENT_HEADLINES} live Headline News stories.`);
  }
}

function resolveClassification(
  user: SessionUser,
  input: {
    displayType?: string | null;
    priority?: string | null;
    headlineExpiresAt?: string | null;
    departmentSlug: string;
    forPublish: boolean;
    excludeArticleId?: string;
  },
): {
  displayType: NewsDisplayType;
  priority: EditorialPriority;
  headlineExpiresAt: string | null;
  isFeatured: number;
  isBreaking: number;
} {
  let displayType = normalizeDisplayType(input.displayType);
  const priority = normalizePriority(input.priority);
  if ((priority === "breaking" || priority === "top") && !canSetProminentPriority(user) && !canPublishSection(user, input.departmentSlug)) {
    throw new AppError(403, "Only editors or assigned department editors can set Breaking or Top Story priority");
  }
  if (priority === "breaking") displayType = "headline";
  let headlineExpiresAt: string | null = null;
  if (input.headlineExpiresAt) {
    const stamp = new Date(input.headlineExpiresAt).toISOString();
    if (Number.isNaN(Date.parse(stamp))) throw new AppError(400, "Choose a valid headline expiry time");
    headlineExpiresAt = stamp;
  } else if (displayType === "headline" && !headlineExpiresAt) {
    // Default 7-day headline window so departments cannot hold slots forever.
    headlineExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  }
  if (displayType === "body") headlineExpiresAt = null;
  if (input.forPublish && displayType === "headline") {
    assertHeadlineCapacity(input.departmentSlug, input.excludeArticleId);
  }
  return {
    displayType,
    priority,
    headlineExpiresAt,
    isFeatured: displayType === "headline" ? 1 : 0,
    isBreaking: priority === "breaking" ? 1 : 0,
  };
}

/** Expire headline slots past headline_expires_at without unpublishing the article. */
export function expireHeadlineSlots(): number {
  ensureReady();
  const now = new Date().toISOString();
  const due = all<{ id: string }>(
    `SELECT id FROM articles WHERE status = 'published' AND deleted_at IS NULL AND news_display_type = 'headline'
     AND headline_expires_at IS NOT NULL AND headline_expires_at <= ?`,
    now,
  );
  for (const row of due) {
    run("UPDATE articles SET news_display_type = 'body', is_featured = 0, updated_at = ? WHERE id = ?", now, row.id);
  }
  return due.length;
}

export function publicArticleHref(slug: string): string {
  return `/news/${slug}`;
}

export type ManagedArticleRow = {
  id: string;
  slug: string;
  title: string;
  status: string;
  author: string;
  category: string;
  categorySlug: string;
  department_slug: string | null;
  published_at: string | null;
  scheduled_for: string | null;
  created_at: string;
  updated_at: string;
  featured_image: string | null;
  destination: string;
  news_display_type: NewsDisplayType;
  editorial_priority: EditorialPriority;
  headline_expires_at: string | null;
};

export function listManagedArticles(options: {
  status?: string;
  q?: string;
  department?: string;
  displayType?: string;
  page?: number;
  pageSize?: number;
}): { items: ManagedArticleRow[]; total: number; counts: Record<string, number> } {
  ensureReady();
  expireHeadlineSlots();
  const pageSize = Math.min(40, Math.max(1, options.pageSize || 20));
  const page = Math.max(1, options.page || 1);
  const where: string[] = ["1 = 1"];
  const params: Array<string | number> = [];
  const status = (options.status || "all").trim();
  if (status === "deleted") where.push("a.deleted_at IS NOT NULL");
  else if (status === "archived") where.push("a.status = 'archived' AND a.deleted_at IS NULL");
  else if (status === "unpublished") where.push("a.status = 'unpublished' AND a.deleted_at IS NULL");
  else if (status === "headline") {
    where.push("a.deleted_at IS NULL AND IFNULL(a.news_display_type, 'body') = 'headline'");
  } else if (status === "body") {
    where.push("a.deleted_at IS NULL AND IFNULL(a.news_display_type, 'body') = 'body'");
  } else if (status && status !== "all") {
    where.push("a.status = ? AND a.deleted_at IS NULL");
    params.push(status);
  } else {
    where.push("a.deleted_at IS NULL");
  }
  const q = (options.q || "").trim().toLowerCase().slice(0, 80);
  if (q) {
    where.push("(lower(en.title) LIKE ? OR lower(p.display_name) LIKE ? OR lower(c.name) LIKE ? OR lower(a.slug) LIKE ?)");
    const like = `%${q}%`;
    params.push(like, like, like, like);
  }
  if (options.department) {
    where.push("a.department_slug = ?");
    params.push(options.department);
  }
  if (options.displayType === "headline" || options.displayType === "body") {
    where.push("IFNULL(a.news_display_type, 'body') = ?");
    params.push(options.displayType);
  }
  const total = get<{ count: number }>(
    `SELECT COUNT(*) as count
     FROM articles a
     JOIN article_categories c ON c.id = a.category_id
     JOIN profiles p ON p.user_id = a.author_id
     LEFT JOIN article_translations en ON en.article_id = a.id AND en.language_code = 'en'
     WHERE ${where.join(" AND ")}`,
    ...params,
  )?.count ?? 0;
  const rows = all<{
    id: string;
    slug: string;
    title: string | null;
    status: string;
    author: string;
    category: string;
    categorySlug: string;
    department_slug: string | null;
    published_at: string | null;
    scheduled_for: string | null;
    created_at: string;
    updated_at: string;
    featured_image: string | null;
    news_display_type: string | null;
    editorial_priority: string | null;
    headline_expires_at: string | null;
  }>(
    `SELECT a.id, a.slug, COALESCE(en.title, a.slug) as title, a.status, p.display_name as author, c.name as category, c.slug as categorySlug,
            a.department_slug, a.published_at, a.scheduled_for, a.created_at, a.updated_at, a.featured_image,
            a.news_display_type, a.editorial_priority, a.headline_expires_at
     FROM articles a
     JOIN article_categories c ON c.id = a.category_id
     JOIN profiles p ON p.user_id = a.author_id
     LEFT JOIN article_translations en ON en.article_id = a.id AND en.language_code = 'en'
     WHERE ${where.join(" AND ")}
     ORDER BY a.updated_at DESC
     LIMIT ? OFFSET ?`,
    ...params,
    pageSize,
    (page - 1) * pageSize,
  );
  const countsRows = all<{ status: string; count: number }>(
    `SELECT CASE WHEN deleted_at IS NOT NULL THEN 'deleted' ELSE status END as status, COUNT(*) as count
     FROM articles GROUP BY CASE WHEN deleted_at IS NOT NULL THEN 'deleted' ELSE status END`,
  );
  const counts: Record<string, number> = { all: 0 };
  for (const row of countsRows) {
    counts[row.status] = Number(row.count);
    if (row.status !== "deleted") counts.all += Number(row.count);
  }
  counts.headline = get<{ count: number }>(
    "SELECT COUNT(*) as count FROM articles WHERE deleted_at IS NULL AND IFNULL(news_display_type, 'body') = 'headline'",
  )?.count ?? 0;
  counts.body = get<{ count: number }>(
    "SELECT COUNT(*) as count FROM articles WHERE deleted_at IS NULL AND IFNULL(news_display_type, 'body') = 'body'",
  )?.count ?? 0;
  return {
    total,
    counts,
    items: rows.map((row) => ({
      ...row,
      title: row.title || row.slug,
      destination: departmentForCategory(row.categorySlug, row.department_slug),
      news_display_type: normalizeDisplayType(row.news_display_type),
      editorial_priority: normalizePriority(row.editorial_priority),
    })),
  };
}

export function getManagedArticle(id: string): (ManagedArticleRow & {
  excerpt: string;
  body: string;
  meta_title: string | null;
  meta_description: string | null;
  tags: string;
  language: string;
  location_id: string | null;
}) | null {
  ensureReady();
  const row = get<{
    id: string;
    slug: string;
    status: string;
    author: string;
    category: string;
    categorySlug: string;
    department_slug: string | null;
    published_at: string | null;
    scheduled_for: string | null;
    created_at: string;
    updated_at: string;
    featured_image: string | null;
    title: string;
    excerpt: string;
    body: string;
    meta_title: string | null;
    meta_description: string | null;
    language: string;
    location_id: string | null;
    news_display_type: string | null;
    editorial_priority: string | null;
    headline_expires_at: string | null;
  }>(
    `SELECT a.id, a.slug, a.status, p.display_name as author, c.name as category, c.slug as categorySlug, a.department_slug,
            a.published_at, a.scheduled_for, a.created_at, a.updated_at, a.featured_image, a.location_id,
            a.news_display_type, a.editorial_priority, a.headline_expires_at,
            en.title, en.excerpt, en.body, en.meta_title, en.meta_description, en.language_code as language
     FROM articles a
     JOIN article_categories c ON c.id = a.category_id
     JOIN profiles p ON p.user_id = a.author_id
     JOIN article_translations en ON en.article_id = a.id AND en.language_code = 'en'
     WHERE a.id = ?`,
    id,
  );
  if (!row) return null;
  const tags = all<{ name: string }>(
    `SELECT t.name FROM tags t JOIN article_tags at ON at.tag_id = t.id WHERE at.article_id = ? ORDER BY t.name`,
    id,
  )
    .map((tag) => tag.name)
    .join(", ");
  return {
    ...row,
    tags,
    destination: departmentForCategory(row.categorySlug, row.department_slug),
    news_display_type: normalizeDisplayType(row.news_display_type),
    editorial_priority: normalizePriority(row.editorial_priority),
  };
}

export function unpublishArticle(user: SessionUser, id: string): void {
  ensureReady();
  assertActive(user);
  requirePermission(user.id, "articles.publish");
  const article = get<{ slug: string; status: string }>("SELECT slug, status FROM articles WHERE id = ? AND deleted_at IS NULL", id);
  if (!article) throw new AppError(404, "Article not found");
  if (article.status !== "published" && article.status !== "scheduled") throw new AppError(400, "Only published or scheduled articles can be unpublished");
  const stamp = new Date().toISOString();
  run("UPDATE articles SET status = 'unpublished', alerts_sent = 0, updated_at = ? WHERE id = ?", stamp, id);
  removeIndex("article", article.slug);
  run("INSERT INTO article_revisions (id, article_id, editor_id, revision_type, revision_content, created_at) VALUES (?, ?, ?, 'unpublish', 'unpublished', ?)", newId(), id, user.id, stamp);
  audit(user.id, "article.unpublish", "article", id);
}

export function archiveArticle(user: SessionUser, id: string): void {
  ensureReady();
  assertActive(user);
  requirePermission(user.id, "articles.publish");
  const article = get<{ slug: string }>("SELECT slug FROM articles WHERE id = ? AND deleted_at IS NULL", id);
  if (!article) throw new AppError(404, "Article not found");
  const stamp = new Date().toISOString();
  run("UPDATE articles SET status = 'archived', updated_at = ? WHERE id = ?", stamp, id);
  removeIndex("article", article.slug);
  run("INSERT INTO article_revisions (id, article_id, editor_id, revision_type, revision_content, created_at) VALUES (?, ?, ?, 'archive', 'archived', ?)", newId(), id, user.id, stamp);
  audit(user.id, "article.archive", "article", id);
}

export function restoreArticle(user: SessionUser, id: string): void {
  ensureReady();
  assertActive(user);
  requirePermission(user.id, "articles.publish");
  const article = get<{ id: string; status: string; deleted_at: string | null }>("SELECT id, status, deleted_at FROM articles WHERE id = ?", id);
  if (!article) throw new AppError(404, "Article not found");
  const stamp = new Date().toISOString();
  if (article.deleted_at) {
    run("UPDATE articles SET deleted_at = NULL, status = 'draft', editorial_review_status = 'unreviewed', updated_at = ? WHERE id = ?", stamp, id);
  } else if (article.status === "archived" || article.status === "unpublished" || article.status === "removed") {
    run("UPDATE articles SET status = 'draft', editorial_review_status = 'unreviewed', updated_at = ? WHERE id = ?", stamp, id);
  } else {
    throw new AppError(400, "This article is not archived or unpublished");
  }
  run("INSERT INTO article_revisions (id, article_id, editor_id, revision_type, revision_content, created_at) VALUES (?, ?, ?, 'restore', 'restored', ?)", newId(), id, user.id, stamp);
  audit(user.id, "article.restore", "article", id);
}
