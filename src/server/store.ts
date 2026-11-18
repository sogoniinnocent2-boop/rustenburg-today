import { get, newId, run } from "./db";
import { AppError } from "./errors";

export function rateLimit(bucket: string, limit: number, windowMs: number): void {
  const now = new Date();
  const row = get<{ count: number; window_start: string }>("SELECT count, window_start FROM rate_limits WHERE bucket = ?", bucket);
  if (!row || now.getTime() - new Date(row.window_start).getTime() >= windowMs) {
    run(
      `INSERT INTO rate_limits (bucket, count, window_start) VALUES (?, 1, ?)
       ON CONFLICT(bucket) DO UPDATE SET count = 1, window_start = excluded.window_start`,
      bucket,
      now.toISOString(),
    );
    return;
  }
  if (row.count >= limit) throw new AppError(429, "Too many attempts. Please wait and try again.");
  run("UPDATE rate_limits SET count = count + 1 WHERE bucket = ?", bucket);
}

export function audit(actorId: string | null, action: string, resourceType: string, resourceId: string, metadata: Record<string, unknown> = {}): void {
  run(
    "INSERT INTO audit_logs (id, actor_id, action, resource_type, resource_id, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    newId(),
    actorId,
    action,
    resourceType,
    resourceId,
    JSON.stringify(metadata),
    new Date().toISOString(),
  );
}

export function indexDocument(input: {
  entityType: string;
  entityId: string;
  language: string;
  title: string;
  body: string;
  locationName?: string | null;
  popularity?: number;
  publishedAt?: string | null;
}): void {
  run(
    `INSERT INTO search_documents (id, entity_type, entity_id, language_code, title, body, location_name, popularity, published_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(entity_type, entity_id, language_code) DO UPDATE SET
       title = excluded.title,
       body = excluded.body,
       location_name = excluded.location_name,
       popularity = excluded.popularity,
       published_at = excluded.published_at`,
    newId(),
    input.entityType,
    input.entityId,
    input.language,
    input.title,
    input.body,
    input.locationName ?? null,
    input.popularity ?? 0,
    input.publishedAt ?? null,
  );
}

export function removeIndex(entityType: string, entityId: string): void {
  run("DELETE FROM search_documents WHERE entity_type = ? AND entity_id = ?", entityType, entityId);
}

export function setting(key: string, fallback = ""): string {
  return get<{ value: string }>("SELECT value FROM admin_settings WHERE key = ?", key)?.value ?? fallback;
}

export function putSetting(key: string, value: string): void {
  run(
    `INSERT INTO admin_settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    key,
    value,
    new Date().toISOString(),
  );
}

export function locationBySlug(slug: string | null | undefined): { id: string; name: string; latitude: number | null; longitude: number | null } | null {
  if (!slug) return null;
  return (
    get<{ id: string; name: string; latitude: number | null; longitude: number | null }>(
      "SELECT id, name, latitude, longitude FROM locations WHERE slug = ? AND active = 1",
      slug,
    ) ?? null
  );
}

export function track(eventName: string, entityType: string | null, entityId: string | null, userId: string | null): void {
  run(
    "INSERT INTO analytics_events (id, user_id, event_name, entity_type, entity_id, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    newId(),
    userId,
    eventName,
    entityType,
    entityId,
    new Date().toISOString(),
  );
}
