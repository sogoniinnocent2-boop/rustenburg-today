import { searchPath, searchPlatform, type SearchHit } from "./search";
import type { SessionUser } from "./auth";
import { assertActive, loadUser, messagePolicy } from "./auth";
import { all, get, newId, run, transaction } from "./db";
import { AppError } from "./errors";
import { ensureReady } from "./init";
import { requirePermission } from "./permissions";
import { audit, rateLimit } from "./store";
import { notify } from "./alerts";

export function sendMessage(user: SessionUser, input: { recipientId?: string; conversationId?: string; body: string }): string {
  ensureReady();
  assertActive(user);
  requirePermission(user.id, "messages.send");
  if (user.isMinor) throw new AppError(403, "Direct messages are not available for accounts under 18");
  rateLimit(`message:${user.id}`, 40, 60 * 60 * 1000);
  const body = input.body.trim();
  if (body.length < 1 || body.length > 2000) throw new AppError(400, "Write a message under 2000 characters");
  let conversationId = input.conversationId || "";
  if (!conversationId) {
    if (!input.recipientId) throw new AppError(400, "Choose who should receive this");
    const recipient = loadUser(input.recipientId);
    if (!recipient || recipient.status !== "active") throw new AppError(404, "Person not found");
    if (recipient.isMinor) throw new AppError(403, "Direct messages are not available for accounts under 18");
    if (get("SELECT 1 as ok FROM user_blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)", user.id, recipient.id, recipient.id, user.id)) {
      throw new AppError(403, "Messaging is blocked");
    }
    const policy = messagePolicy(recipient.id);
    const mutual = get(
      "SELECT 1 as ok FROM user_follows a JOIN user_follows b ON a.follower_id = b.followed_id AND a.followed_id = b.follower_id WHERE a.follower_id = ? AND a.followed_id = ?",
      user.id,
      recipient.id,
    );
    if (policy === "none" || (policy === "connections" && !mutual)) throw new AppError(403, "This person is not accepting new messages");
    conversationId = newId();
    const stamp = new Date().toISOString();
    run("INSERT INTO conversations (id, conversation_type, subject, created_at) VALUES (?, 'direct', ?, ?)", conversationId, `Conversation with ${recipient.displayName}`, stamp);
    run("INSERT INTO conversation_participants (conversation_id, user_id, joined_at) VALUES (?, ?, ?)", conversationId, user.id, stamp);
    run("INSERT INTO conversation_participants (conversation_id, user_id, joined_at) VALUES (?, ?, ?)", conversationId, recipient.id, stamp);
  } else {
    const member = get("SELECT 1 as ok FROM conversation_participants WHERE conversation_id = ? AND user_id = ?", conversationId, user.id);
    if (!member) throw new AppError(403, "You are not in this conversation");
    const others = all<{ user_id: string }>("SELECT user_id FROM conversation_participants WHERE conversation_id = ? AND user_id != ?", conversationId, user.id);
    for (const other of others) {
      const person = loadUser(other.user_id);
      if (person?.isMinor || user.isMinor) throw new AppError(403, "Direct messages are not available for accounts under 18");
    }
  }
  const messageId = newId();
  const stamp = new Date().toISOString();
  run("INSERT INTO messages (id, conversation_id, sender_id, message_body, message_type, created_at) VALUES (?, ?, ?, ?, 'text', ?)", messageId, conversationId, user.id, body, stamp);
  const others = all<{ user_id: string }>("SELECT user_id FROM conversation_participants WHERE conversation_id = ? AND user_id != ?", conversationId, user.id);
  for (const other of others) notify(other.user_id, "message", "New message", body.slice(0, 140), "/account/messages");
  return conversationId;
}

export function openEnquiry(user: SessionUser, recipientId: string, subject: string, body: string, context: { type: string; id: string }): string {
  ensureReady();
  assertActive(user);
  if (user.isMinor) throw new AppError(403, "Enquiries are not available for accounts under 18");
  const recipient = loadUser(recipientId);
  if (!recipient || recipient.isMinor) throw new AppError(403, "This enquiry cannot be opened");
  if (get("SELECT 1 as ok FROM user_blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)", user.id, recipient.id, recipient.id, user.id)) {
    throw new AppError(403, "Messaging is blocked");
  }
  const conversationId = newId();
  const stamp = new Date().toISOString();
  transaction(() => {
    run("INSERT INTO conversations (id, conversation_type, subject, created_at) VALUES (?, 'enquiry', ?, ?)", conversationId, subject.slice(0, 140), stamp);
    run("INSERT INTO conversation_participants (conversation_id, user_id, joined_at) VALUES (?, ?, ?)", conversationId, user.id, stamp);
    run("INSERT INTO conversation_participants (conversation_id, user_id, joined_at) VALUES (?, ?, ?)", conversationId, recipient.id, stamp);
    run("INSERT INTO messages (id, conversation_id, sender_id, message_body, message_type, created_at) VALUES (?, ?, ?, ?, 'enquiry', ?)", newId(), conversationId, user.id, body.trim(), stamp);
    if (context.type === "product") run("INSERT INTO marketplace_enquiries (id, product_id, buyer_id, conversation_id, created_at) VALUES (?, ?, ?, ?, ?)", newId(), context.id, user.id, conversationId, stamp);
    if (context.type === "business") run("INSERT INTO business_enquiries (id, business_id, from_user_id, message, conversation_id, created_at) VALUES (?, ?, ?, ?, ?, ?)", newId(), context.id, user.id, body.trim(), conversationId, stamp);
  });
  notify(recipient.id, "enquiry", subject.slice(0, 80), body.trim().slice(0, 140), "/account/messages");
  return conversationId;
}

export function listConversations(userId: string): Array<Record<string, unknown>> {
  ensureReady();
  return all(
    `SELECT c.id, c.subject, c.conversation_type, c.created_at,
            (SELECT message_body FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) as last_message
     FROM conversations c JOIN conversation_participants p ON p.conversation_id = c.id
     WHERE p.user_id = ? ORDER BY c.created_at DESC`,
    userId,
  );
}

export function listMessages(userId: string, conversationId: string): Array<Record<string, unknown>> {
  ensureReady();
  if (!get("SELECT 1 as ok FROM conversation_participants WHERE conversation_id = ? AND user_id = ?", conversationId, userId)) throw new AppError(403, "You are not in this conversation");
  run("UPDATE conversation_participants SET last_read_at = ? WHERE conversation_id = ? AND user_id = ?", new Date().toISOString(), conversationId, userId);
  return all(
    `SELECT m.id, m.message_body, m.created_at, m.sender_id, p.display_name
     FROM messages m JOIN profiles p ON p.user_id = m.sender_id
     WHERE m.conversation_id = ? ORDER BY m.created_at`,
    conversationId,
  );
}

export function reportContent(user: SessionUser, contentType: string, contentId: string, reason: string, description?: string): void {
  ensureReady();
  assertActive(user);
  rateLimit(`report:${user.id}`, 20, 24 * 60 * 60 * 1000);
  if (reason.trim().length < 3) throw new AppError(400, "Say why you are reporting this");
  run(
    "INSERT INTO content_reports (id, reporter_id, content_type, content_id, reason, description, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'open', ?, ?)",
    newId(),
    user.id,
    contentType,
    contentId,
    reason.trim().slice(0, 80),
    description?.slice(0, 1000) || null,
    new Date().toISOString(),
    new Date().toISOString(),
  );
  audit(user.id, "report.create", contentType, contentId);
}

const REMOVABLE: Record<string, { table: string; statusColumn: string }> = {
  article: { table: "articles", statusColumn: "status" },
  post: { table: "community_posts", statusColumn: "status" },
  product: { table: "products", statusColumn: "listing_status" },
  job: { table: "jobs", statusColumn: "status" },
  comment: { table: "article_comments", statusColumn: "status" },
  video: { table: "videos", statusColumn: "status" },
};

export function resolveReport(user: SessionUser, reportId: string, action: "dismiss" | "remove", note: string): void {
  ensureReady();
  assertActive(user);
  requirePermission(user.id, "reports.review");
  const report = get<{ content_type: string; content_id: string; status: string }>("SELECT content_type, content_id, status FROM content_reports WHERE id = ?", reportId);
  if (!report || report.status !== "open") throw new AppError(404, "Report not found");
  const stamp = new Date().toISOString();
  run("UPDATE content_reports SET status = ?, assigned_moderator = ?, updated_at = ? WHERE id = ?", action === "dismiss" ? "dismissed" : "actioned", user.id, stamp, reportId);
  if (action === "remove") {
    const target = REMOVABLE[report.content_type];
    if (target) run(`UPDATE ${target.table} SET ${target.statusColumn} = 'removed', deleted_at = ? WHERE id = ?`, stamp, report.content_id);
  }
  run("INSERT INTO moderation_actions (id, moderator_id, content_type, content_id, action, reason, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)", newId(), user.id, report.content_type, report.content_id, action, note.slice(0, 400), stamp);
  audit(user.id, `report.${action}`, report.content_type, report.content_id);
}

export function listBookmarks(userId: string): Array<{ id: string; item_type: string; item_id: string; created_at: string }> {
  ensureReady();
  return all("SELECT id, item_type, item_id, created_at FROM bookmarks WHERE user_id = ? ORDER BY created_at DESC LIMIT 40", userId);
}

export type SavedItem = { id: string; type: string; title: string; href: string; created_at: string };

export function namedBookmarks(userId: string): SavedItem[] {
  return listBookmarks(userId).map((row) => {
    const found = lookupSaved(row.item_type, row.item_id);
    return { id: row.id, type: row.item_type, title: found?.title || "This record is no longer published", href: found?.href || "", created_at: row.created_at };
  });
}

function lookupSaved(type: string, id: string): { title: string; href: string } | null {
  if (type === "article") {
    const row = get<{ slug: string; title: string }>("SELECT a.slug, tr.title FROM articles a JOIN article_translations tr ON tr.article_id = a.id AND tr.language_code = 'en' AND tr.review_status = 'approved' WHERE a.id = ? AND a.status = 'published' AND a.deleted_at IS NULL", id);
    return row ? { title: row.title, href: `/news/${row.slug}` } : null;
  }
  if (type === "news") {
    const row = get<{ slug: string; headline: string }>("SELECT slug, headline FROM news_items WHERE id = ? AND status = 'published'", id);
    return row ? { title: row.headline, href: `/news/${row.slug}` } : null;
  }
  if (type === "job") {
    const row = get<{ title: string }>("SELECT title FROM jobs WHERE id = ? AND status = 'published' AND deleted_at IS NULL", id);
    return row ? { title: row.title, href: `/jobs/${id}` } : null;
  }
  if (type === "event") {
    const row = get<{ title: string; slug: string }>("SELECT title, slug FROM events WHERE id = ? AND status = 'published' AND deleted_at IS NULL", id);
    return row ? { title: row.title, href: `/events/${row.slug}` } : null;
  }
  if (type === "business") {
    const row = get<{ name: string; slug: string }>("SELECT name, slug FROM businesses WHERE id = ? AND status = 'published' AND deleted_at IS NULL", id);
    return row ? { title: row.name, href: `/business/${row.slug}` } : null;
  }
  if (type === "product") {
    const row = get<{ title: string; slug: string }>("SELECT title, slug FROM products WHERE id = ? AND listing_status = 'published' AND deleted_at IS NULL", id);
    return row ? { title: row.title, href: `/marketplace/${row.slug}` } : null;
  }
  return null;
}

export function listOwnedEnquiries(userId: string): Array<{ id: string; kind: string; title: string; message: string; conversation_id: string | null; created_at: string }> {
  ensureReady();
  const businesses = all<{ id: string; title: string; message: string; conversation_id: string | null; created_at: string }>(
    `SELECT e.id, b.name as title, e.message, e.conversation_id, e.created_at
     FROM business_enquiries e JOIN businesses b ON b.id = e.business_id
     WHERE b.owner_id = ? ORDER BY e.created_at DESC LIMIT 20`,
    userId,
  ).map((row) => ({ ...row, kind: "business" }));
  const products = all<{ id: string; title: string; message: string | null; conversation_id: string | null; created_at: string }>(
    `SELECT e.id, p.title, e.conversation_id, e.created_at,
            (SELECT message_body FROM messages m WHERE m.conversation_id = e.conversation_id ORDER BY m.created_at LIMIT 1) as message
     FROM marketplace_enquiries e JOIN products p ON p.id = e.product_id
     WHERE p.seller_id = ? ORDER BY e.created_at DESC LIMIT 20`,
    userId,
  ).map((row) => ({ ...row, kind: "product", message: row.message || "" }));
  return [...businesses, ...products].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 20);
}

export function briefingRss(origin: string): string {
  ensureReady();
  const wires = all<{ headline: string; summary: string | null; canonical_url: string | null; slug: string; original_published_at: string | null }>(
    "SELECT headline, summary, canonical_url, slug, original_published_at FROM news_items WHERE status = 'published' ORDER BY published_at DESC LIMIT 12",
  );
  const stories = all<{ title: string; excerpt: string; slug: string; published_at: string | null }>(
    `SELECT tr.title, tr.excerpt, a.slug, a.published_at
     FROM articles a JOIN article_translations tr ON tr.article_id = a.id AND tr.language_code = 'en' AND tr.review_status = 'approved'
     WHERE a.status = 'published' AND a.deleted_at IS NULL ORDER BY a.published_at DESC LIMIT 8`,
  );
  const items = [
    ...wires.map((row) => rssItem(row.headline, row.summary || "", row.canonical_url || `${origin}/en/news/${row.slug}`, row.original_published_at)),
    ...stories.map((row) => rssItem(row.title, row.excerpt, `${origin}/en/news/${row.slug}`, row.published_at)),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Rustenburg Today briefing</title><link>${escapeXml(origin)}/en/edition</link><description>Published headlines and original articles. Wire items link to the original publisher.</description>${items.join("")}</channel></rss>`;
}

function rssItem(title: string, summary: string, link: string, when: string | null): string {
  const date = when && !Number.isNaN(Date.parse(when)) ? new Date(when).toUTCString() : new Date().toUTCString();
  return `<item><title>${escapeXml(title)}</title><link>${escapeXml(link)}</link><description>${escapeXml(summary)}</description><pubDate>${date}</pubDate></item>`;
}

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function toggleBookmark(user: SessionUser, itemType: string, itemId: string): boolean {
  ensureReady();
  assertActive(user);
  const existing = get("SELECT id FROM bookmarks WHERE user_id = ? AND item_type = ? AND item_id = ?", user.id, itemType, itemId);
  if (existing) {
    run("DELETE FROM bookmarks WHERE user_id = ? AND item_type = ? AND item_id = ?", user.id, itemType, itemId);
    return false;
  }
  run("INSERT INTO bookmarks (id, user_id, item_type, item_id, created_at) VALUES (?, ?, ?, ?, ?)", newId(), user.id, itemType, itemId, new Date().toISOString());
  return true;
}

export function askCity(question: string, locale: string): { items: Array<SearchHit & { href: string }>; grounded: true } {
  ensureReady();
  const found = searchPlatform(question, { locale, pageSize: 6 });
  return { grounded: true, items: found.items.map((item) => ({ ...item, href: searchPath(item) })) };
}

export function buildBriefing(userId: string): { news: Array<Record<string, unknown>>; events: Array<Record<string, unknown>>; jobs: Array<Record<string, unknown>>; deals: Array<Record<string, unknown>>; notices: Array<Record<string, unknown>> } {
  ensureReady();
  const language = get<{ preferred_language: string }>("SELECT preferred_language FROM profiles WHERE user_id = ?", userId)?.preferred_language || "en";
  const newsSql = "SELECT a.slug, tr.title, tr.excerpt FROM articles a JOIN article_translations tr ON tr.article_id = a.id AND tr.language_code = ? AND tr.review_status = 'approved' WHERE a.status = 'published' AND a.deleted_at IS NULL ORDER BY a.published_at DESC LIMIT 3";
  const preferred = all<Record<string, unknown>>(newsSql, language);
  const news = preferred.length || language === "en" ? preferred : all<Record<string, unknown>>(newsSql, "en");
  return {
    news,
    events: all("SELECT slug, title, start_at FROM events WHERE status = 'published' AND deleted_at IS NULL AND start_at >= ? ORDER BY start_at LIMIT 3", new Date().toISOString()),
    jobs: all("SELECT id, title, job_type FROM jobs WHERE status = 'published' AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 3"),
    deals: all("SELECT id, title, ends_at FROM deals WHERE status = 'published' AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 3"),
    notices: all("SELECT id, title, notice_type FROM public_notices WHERE status = 'published' AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 3"),
  };
}

export function awardPoints(userId: string, actionKey: string, points: number, reason: string): boolean {
  ensureReady();
  if (!Number.isInteger(points) || points === 0) throw new AppError(400, "Points must be a whole number");
  try {
    transaction(() => {
      run("INSERT INTO rewards_ledger (id, user_id, action_key, points, reason, created_at) VALUES (?, ?, ?, ?, ?, ?)", newId(), userId, actionKey, points, reason, new Date().toISOString());
      const current = get<{ balance: number }>("SELECT balance FROM rewards_accounts WHERE user_id = ?", userId)?.balance ?? 0;
      const next = current + points;
      if (next < 0) throw new AppError(400, "Not enough points");
      run(
        `INSERT INTO rewards_accounts (user_id, balance, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET balance = ?, updated_at = excluded.updated_at`,
        userId,
        next,
        new Date().toISOString(),
        next,
      );
    });
    return true;
  } catch (error) {
    if (error instanceof AppError) throw error;
    return false;
  }
}

export function redeemOffer(user: SessionUser, offerId: string): void {
  ensureReady();
  assertActive(user);
  const offer = get<{ points_cost: number; status: string; title: string }>("SELECT points_cost, status, title FROM rewards_offers WHERE id = ?", offerId);
  if (!offer || offer.status !== "published") throw new AppError(404, "Offer not found");
  const awarded = awardPoints(user.id, `redeem:${offerId}:${user.id}`, -offer.points_cost, offer.title);
  if (!awarded) throw new AppError(409, "This offer was already redeemed");
  run("INSERT INTO rewards_redemptions (id, offer_id, user_id, points_spent, status, created_at) VALUES (?, ?, ?, ?, 'reserved', ?)", newId(), offerId, user.id, offer.points_cost, new Date().toISOString());
}

export function pointsBalance(userId: string): number {
  ensureReady();
  return get<{ balance: number }>("SELECT balance FROM rewards_accounts WHERE user_id = ?", userId)?.balance ?? 0;
}
