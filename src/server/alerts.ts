import { all, get, newId, run } from "./db";
import { queueEmail } from "./mail";

export function notify(userId: string, category: string, title: string, body: string, targetUrl: string | null, channel: "in_app" | "email" = "in_app"): void {
  const pref = get<{ enabled: number }>("SELECT enabled FROM notification_preferences WHERE user_id = ? AND channel = ? AND category = ?", userId, channel, category);
  if (pref && pref.enabled === 0) return;
  if (channel === "in_app") {
    run(
      "INSERT INTO notifications (id, user_id, notification_type, title, body, target_url, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      newId(),
      userId,
      category,
      title,
      body,
      targetUrl,
      new Date().toISOString(),
    );
    return;
  }
  const user = get<{ email: string; preferred_language: string }>(
    "SELECT u.email as email, p.preferred_language as preferred_language FROM users u JOIN profiles p ON p.user_id = u.id WHERE u.id = ? AND u.status = 'active'",
    userId,
  );
  if (user) queueEmail(user.email, "notice", user.preferred_language, { title, body });
}

export function fanout(category: string, title: string, body: string, targetUrl: string, locationId?: string | null): void {
  const rows = all<{ user_id: string; channel: string }>(
    `SELECT user_id, channel FROM alert_subscriptions
     WHERE category = ? AND enabled = 1
       AND (? IS NULL OR location_id IS NULL OR location_id = ?)`,
    category,
    locationId ?? null,
    locationId ?? null,
  );
  for (const row of rows) {
    if (row.channel === "email" || row.channel === "in_app") {
      notify(row.user_id, category, title, body, targetUrl, row.channel);
    }
  }
}

export function setPreference(userId: string, channel: string, category: string, enabled: boolean): void {
  run(
    `INSERT INTO notification_preferences (id, user_id, channel, category, enabled) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(user_id, channel, category) DO UPDATE SET enabled = excluded.enabled`,
    newId(),
    userId,
    channel,
    category,
    enabled ? 1 : 0,
  );
}

export function followTopic(userId: string, categorySlug: string): boolean {
  const slug = categorySlug.trim().toLowerCase();
  const known = get("SELECT slug FROM article_categories WHERE slug = ?", slug) || get("SELECT category_slug as slug FROM news_items WHERE category_slug = ? LIMIT 1", slug);
  if (!known) throw new Error("Unknown topic");
  const category = `news:${slug}`;
  const existing = get("SELECT id FROM alert_subscriptions WHERE user_id = ? AND category = ? AND channel = 'in_app'", userId, category);
  if (existing) {
    run("DELETE FROM alert_subscriptions WHERE user_id = ? AND category = ? AND channel = 'in_app'", userId, category);
    return false;
  }
  run(
    "INSERT INTO alert_subscriptions (id, user_id, category, location_id, channel, enabled, created_at) VALUES (?, ?, ?, NULL, 'in_app', 1, ?)",
    newId(),
    userId,
    category,
    new Date().toISOString(),
  );
  return true;
}

export function followStory(userId: string, kind: string, id: string): boolean {
  if (kind !== "article" && kind !== "news") throw new Error("Unknown story");
  const published = kind === "article"
    ? get("SELECT id FROM articles WHERE id = ? AND status = 'published' AND deleted_at IS NULL", id)
    : get("SELECT id FROM news_items WHERE id = ? AND status = 'published'", id);
  if (!published) throw new Error("That story is not published");
  const category = `story:${kind}:${id}`;
  const existing = get("SELECT id FROM alert_subscriptions WHERE user_id = ? AND category = ? AND channel = 'in_app'", userId, category);
  if (existing) {
    run("DELETE FROM alert_subscriptions WHERE user_id = ? AND category = ? AND channel = 'in_app'", userId, category);
    return false;
  }
  run(
    "INSERT INTO alert_subscriptions (id, user_id, category, location_id, channel, enabled, created_at) VALUES (?, ?, ?, NULL, 'in_app', 1, ?)",
    newId(),
    userId,
    category,
    new Date().toISOString(),
  );
  return true;
}

export function storyIsFollowed(userId: string, kind: string, id: string): boolean {
  return Boolean(get("SELECT id FROM alert_subscriptions WHERE user_id = ? AND category = ? AND channel = 'in_app' AND enabled = 1", userId, `story:${kind}:${id}`));
}

export function followedStories(userId: string): Array<{ kind: string; id: string; title: string; href: string }> {
  const rows = all<{ category: string }>("SELECT category FROM alert_subscriptions WHERE user_id = ? AND channel = 'in_app' AND enabled = 1 AND category LIKE 'story:%' ORDER BY created_at DESC", userId);
  const stories: Array<{ kind: string; id: string; title: string; href: string }> = [];
  for (const row of rows) {
    const [, kind, ...rest] = row.category.split(":");
    const id = rest.join(":");
    if (kind === "news") {
      const item = get<{ headline: string; slug: string }>("SELECT headline, slug FROM news_items WHERE id = ?", id);
      if (item) stories.push({ kind, id, title: item.headline, href: `/news/${item.slug}` });
    } else if (kind === "article") {
      const item = get<{ title: string; slug: string }>("SELECT COALESCE(en.title, 'Story') as title, a.slug as slug FROM articles a LEFT JOIN article_translations en ON en.article_id = a.id AND en.language_code = 'en' WHERE a.id = ?", id);
      if (item) stories.push({ kind, id, title: item.title, href: `/news/${item.slug}` });
    }
  }
  return stories;
}

export function followedTopics(userId: string): string[] {
  return all<{ category: string }>("SELECT category FROM alert_subscriptions WHERE user_id = ? AND channel = 'in_app' AND enabled = 1 AND category LIKE 'news:%' ORDER BY category", userId).map((row) => row.category.slice(5));
}

export function subscribeAlert(userId: string, category: string, channel: "in_app" | "email", locationId?: string | null): void {
  const allowed = ["breaking", "neighbourhood", "traffic", "municipal", "events", "jobs", "deals", "safety", "official"];
  if (!allowed.includes(category) && !category.startsWith("desk:") && !category.startsWith("news:")) {
    throw new Error("Unknown alert");
  }
  run("DELETE FROM alert_subscriptions WHERE user_id = ? AND category = ? AND channel = ? AND IFNULL(location_id, '') = IFNULL(?, '')", userId, category, channel, locationId || null);
  run(
    "INSERT INTO alert_subscriptions (id, user_id, category, location_id, channel, enabled, created_at) VALUES (?, ?, ?, ?, ?, 1, ?)",
    newId(),
    userId,
    category,
    locationId || null,
    channel,
    new Date().toISOString(),
  );
}

/** Free official Rustenburg Today news subscription (all original journalism). */
export function subscribeOfficialNews(userId: string, channel: "in_app" | "email" = "in_app", locationId?: string | null): void {
  subscribeAlert(userId, "official", channel, locationId);
}

export function unsubscribeOfficialNews(userId: string, channel?: "in_app" | "email"): void {
  if (channel) {
    run("UPDATE alert_subscriptions SET enabled = 0 WHERE user_id = ? AND category = 'official' AND channel = ?", userId, channel);
    return;
  }
  run("UPDATE alert_subscriptions SET enabled = 0 WHERE user_id = ? AND category = 'official'", userId);
}

export function officialNewsSubscribed(userId: string): { inApp: boolean; email: boolean } {
  const rows = all<{ channel: string; enabled: number }>(
    "SELECT channel, enabled FROM alert_subscriptions WHERE user_id = ? AND category = 'official'",
    userId,
  );
  return {
    inApp: rows.some((row) => row.channel === "in_app" && row.enabled === 1),
    email: rows.some((row) => row.channel === "email" && row.enabled === 1),
  };
}

/** Notify official-news subscribers once per publication event. */
export function notifyOfficialPublication(input: {
  articleId: string;
  title: string;
  body: string;
  href: string;
  departmentSlug?: string | null;
  categorySlug?: string | null;
  locationId?: string | null;
}): void {
  const already = get<{ alerts_sent: number }>("SELECT alerts_sent FROM articles WHERE id = ?", input.articleId);
  if (already && already.alerts_sent === 1) return;
  fanout("official", input.title, input.body, input.href, input.locationId);
  if (input.categorySlug) fanout(`news:${input.categorySlug}`, input.title, input.body, input.href, input.locationId);
  if (input.departmentSlug) fanout(`desk:${input.departmentSlug}`, input.title, input.body, input.href, input.locationId);
  run("UPDATE articles SET alerts_sent = 1 WHERE id = ?", input.articleId);
}

export function listNotifications(userId: string, limit = 20): Array<{ id: string; title: string; body: string; target_url: string | null; read_at: string | null; created_at: string }> {
  return all("SELECT id, title, body, target_url, read_at, created_at FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT ?", userId, limit);
}

export function markNotificationsRead(userId: string): void {
  run("UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL", new Date().toISOString(), userId);
}

export function unreadCount(userId: string): number {
  return get<{ count: number }>("SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND read_at IS NULL", userId)?.count ?? 0;
}
