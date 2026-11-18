import { locationScope } from "./platform";
import { all, get } from "./db";
import { ensureReady } from "./init";

export type Discovery = {
  breaking: Array<Record<string, unknown>>;
  businesses: Array<Record<string, unknown>>;
  businessOfWeek: Record<string, unknown> | null;
  events: Array<Record<string, unknown>>;
  today: Array<Record<string, unknown>>;
  properties: Array<Record<string, unknown>>;
  jobs: Array<Record<string, unknown>>;
  posts: Array<Record<string, unknown>>;
  deals: Array<Record<string, unknown>>;
  podcasts: Array<Record<string, unknown>>;
  videos: Array<Record<string, unknown>>;
  notices: Array<Record<string, unknown>>;
  places: Array<Record<string, unknown>>;
};

export function cityDiscovery(locationId?: string | null): Discovery {
  ensureReady();
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  const businesses = all<Record<string, unknown>>(`SELECT id, name, slug, description, verification_status, featured FROM businesses WHERE status = 'published' AND deleted_at IS NULL${scopeSql("location_id", locationId)} ORDER BY featured DESC, name LIMIT 6`, ...scopeParams(locationId));
  return {
    breaking: all(
      `SELECT a.id, a.slug, a.is_demo, COALESCE(en.title, '') as title, COALESCE(en.excerpt, '') as excerpt
       FROM articles a
       JOIN article_categories c ON c.id = a.category_id
       LEFT JOIN article_translations en ON en.article_id = a.id AND en.language_code = 'en'
       WHERE a.status = 'published' AND c.slug = 'breaking-news'
       ORDER BY a.published_at DESC LIMIT 3`,
    ),
    businesses,
    businessOfWeek: get<Record<string, unknown>>("SELECT id, name, slug, description, verification_status FROM businesses WHERE status = 'published' AND deleted_at IS NULL AND featured = 1 ORDER BY updated_at DESC LIMIT 1") || businesses[0] || null,
    events: all(`SELECT id, title, slug, description, venue, start_at FROM events WHERE status = 'published' AND deleted_at IS NULL AND start_at >= ?${scopeSql("location_id", locationId)} ORDER BY start_at LIMIT 4`, now.toISOString(), ...scopeParams(locationId)),
    today: all(`SELECT id, title, slug, venue, start_at FROM events WHERE status = 'published' AND deleted_at IS NULL AND start_at >= ? AND start_at < ?${scopeSql("location_id", locationId)} ORDER BY start_at`, start.toISOString(), end.toISOString(), ...scopeParams(locationId)),
    properties: all(`SELECT id, title, listing_type, property_type, price_cents, area_label, verification_status FROM properties WHERE status = 'published' AND deleted_at IS NULL${scopeSql("location_id", locationId)} ORDER BY updated_at DESC LIMIT 4`, ...scopeParams(locationId)),
    jobs: all(`SELECT id, title, job_type, closing_date, employer_id FROM jobs WHERE status = 'published' AND deleted_at IS NULL AND (closing_date IS NULL OR closing_date >= ?)${scopeSql("location_id", locationId)} ORDER BY created_at DESC LIMIT 4`, new Date().toISOString().slice(0, 10), ...scopeParams(locationId)),
    posts: all("SELECT p.id, p.body, pr.display_name FROM community_posts p JOIN profiles pr ON pr.user_id = p.author_id WHERE p.status = 'published' ORDER BY p.created_at DESC LIMIT 3"),
    deals: all("SELECT id, title, description, price_cents, ends_at FROM deals WHERE status = 'published' AND deleted_at IS NULL AND (ends_at IS NULL OR ends_at >= ?) ORDER BY featured DESC, ends_at LIMIT 4", now.toISOString()),
    podcasts: all("SELECT id, title, slug, description, is_demo FROM podcasts WHERE status = 'published' ORDER BY created_at DESC LIMIT 2"),
    videos: all("SELECT id, title, slug, description FROM videos WHERE status = 'published' ORDER BY published_at DESC LIMIT 2"),
    notices: all("SELECT id, title, notice_type FROM public_notices WHERE status = 'published' AND deleted_at IS NULL AND (expires_at IS NULL OR expires_at >= ?) ORDER BY created_at DESC LIMIT 4", now.toISOString()),
    places: all(
      `SELECT id, title, summary, category, latitude, longitude, source_name, source_type, source_id, verification_status
       FROM map_points WHERE verification_status = 'verified' AND moderation_status = 'approved' AND sensitive = 0
         AND (expires_at IS NULL OR expires_at > ?) ORDER BY created_at DESC LIMIT 80`,
      now.toISOString(),
    ),
  };
}

export function discoverPlaces(filters: { q?: string; category?: string }): Array<Record<string, unknown>> {
  ensureReady();
  const where = ["verification_status = 'verified'", "moderation_status = 'approved'", "sensitive = 0", "(expires_at IS NULL OR expires_at > ?)"];
  const params: unknown[] = [new Date().toISOString()];
  if (filters.category) {
    where.push("category = ?");
    params.push(filters.category);
  }
  if (filters.q) {
    where.push("(lower(title) LIKE ? OR lower(summary) LIKE ?)");
    const like = `%${filters.q.toLowerCase()}%`;
    params.push(like, like);
  }
  return all(`SELECT id, title, summary, category, latitude, longitude, source_name, source_type, source_id, verification_status FROM map_points WHERE ${where.join(" AND ")} ORDER BY title LIMIT 80`, ...params);
}

export function publishedTickets(): Array<Record<string, unknown>> {
  ensureReady();
  return all(
    `SELECT e.id, e.title, e.slug, e.venue, e.start_at, e.ticket_url,
            t.id as ticket_id, t.ticket_type, t.price_cents, t.capacity, t.reserved_count
     FROM events e
     LEFT JOIN event_tickets t ON t.event_id = e.id
     WHERE e.status = 'published' AND e.deleted_at IS NULL
     ORDER BY e.start_at, t.price_cents`,
  );
}

export const MAP_CATEGORIES = ["business", "restaurant", "event", "accommodation", "property", "school", "clinic", "pharmacy", "transport", "tourism", "shop", "service", "traffic", "alert"] as const;

function scopeParams(locationId?: string | null): string[] {
  return locationId ? locationScope(locationId) : [];
}

function scopeSql(column: string, locationId?: string | null): string {
  if (!locationId) return "";
  return ` AND ${column} IN (${scopeParams(locationId).map(() => "?").join(", ")})`;
}
