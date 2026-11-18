import { containsSensitiveIdentity } from "@/lib/text";
import type { SessionUser } from "./auth";
import { assertActive } from "./auth";
import { all, get, newId, run } from "./db";
import { AppError } from "./errors";
import { ensureReady } from "./init";
import { requirePermission } from "./permissions";
import { audit, setting } from "./store";

const LIVE_CATEGORIES = ["community", "school", "business", "sport", "music", "study"];

export function publishBook(user: SessionUser, input: { title: string; description: string; language: string; sample: string; body: string; priceCents: number; rights: boolean }): { id: string; slug: string; status: string } {
  ensureReady();
  assertActive(user);
  requirePermission(user.id, "community.post");
  if (user.isMinor) throw new AppError(403, "A book is published from an adult account");
  if (!input.rights) throw new AppError(400, "Confirm you hold the rights to this text");
  const title = input.title.trim();
  const description = input.description.trim();
  const sample = input.sample.trim();
  const body = input.body.trim();
  if (title.length < 3 || title.length > 140) throw new AppError(400, "The title needs 3 to 140 characters");
  if (description.length < 10 || description.length > 600) throw new AppError(400, "Describe the book in 10 to 600 characters");
  if (sample.length < 40 || sample.length > 2000) throw new AppError(400, "The sample needs 40 to 2000 characters");
  if (body.length < 40 || body.length > 50000) throw new AppError(400, "The book text needs 40 to 50000 characters");
  if ([title, description, sample, body].some(containsSensitiveIdentity)) throw new AppError(400, "Remove identity numbers before posting");
  const language = ["en", "tn", "af"].includes(input.language) ? input.language : "en";
  const price = Math.max(0, Math.floor(input.priceCents));
  if (price > 0 && price < 100) throw new AppError(400, "A priced book starts at R1.00");
  const status = price === 0 ? "published" : setting("payment_mode", "disabled") === "disabled" ? "preview" : "unpaid";
  const id = newId();
  const slug = `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "book"}-${id.slice(0, 8)}`;
  const stamp = new Date().toISOString();
  run(
    "INSERT INTO books (id, author_id, slug, title, description, language, price_cents, sample, body, rights_confirmed, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)",
    id, user.id, slug, title, description, language, price, sample, body, status, stamp, stamp,
  );
  audit(user.id, "book.publish", "book", id, { status, cents: price });
  return { id, slug, status };
}

export function listBooks(): Array<{ slug: string; title: string; description: string; language: string; price_cents: number; status: string; display_name: string }> {
  ensureReady();
  return all(
    `SELECT b.slug, b.title, b.description, b.language, b.price_cents, b.status, pr.display_name
     FROM books b JOIN profiles pr ON pr.user_id = b.author_id
     WHERE b.status IN ('published', 'preview', 'unpaid') ORDER BY b.created_at DESC LIMIT 40`,
  );
}

export function readBook(slug: string, viewerId?: string | null): { slug: string; title: string; description: string; language: string; price_cents: number; status: string; sample: string; body: string; display_name: string; username: string; readable: boolean } | null {
  ensureReady();
  const row = get<{ slug: string; title: string; description: string; language: string; price_cents: number; status: string; sample: string; body: string; author_id: string; display_name: string; username: string }>(
    `SELECT b.slug, b.title, b.description, b.language, b.price_cents, b.status, b.sample, b.body, b.author_id, pr.display_name, pr.username
     FROM books b JOIN profiles pr ON pr.user_id = b.author_id WHERE b.slug = ?`,
    slug,
  );
  if (!row || row.status === "draft") return null;
  const readable = row.author_id === viewerId || (row.status === "published" && row.price_cents === 0);
  return { ...row, body: readable ? row.body : "", readable };
}

export function scheduleNotice(user: SessionUser, input: { title: string; category: string; startsAt: string; note: string }): { id: string } {
  ensureReady();
  assertActive(user);
  requirePermission(user.id, "community.post");
  const title = input.title.trim();
  const note = input.note.trim();
  if (title.length < 3 || title.length > 120) throw new AppError(400, "The title needs 3 to 120 characters");
  if (!LIVE_CATEGORIES.includes(input.category)) throw new AppError(400, "Choose a category");
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(input.startsAt)) throw new AppError(400, "Choose a date and time");
  if (note.length < 10 || note.length > 500) throw new AppError(400, "Say what people should expect, in 10 to 500 characters");
  if (containsSensitiveIdentity(`${title} ${note}`)) throw new AppError(400, "Remove identity numbers before posting");
  const id = newId();
  run(
    "INSERT INTO live_notices (id, host_id, title, category, starts_at, note, status, created_at) VALUES (?, ?, ?, ?, ?, ?, 'scheduled', ?)",
    id, user.id, title, input.category, input.startsAt.slice(0, 16), note, new Date().toISOString(),
  );
  audit(user.id, "live.schedule", "live_notice", id, { status: "scheduled" });
  return { id };
}

export function listNotices(): Array<{ id: string; title: string; category: string; starts_at: string; note: string; status: string; display_name: string; username: string }> {
  ensureReady();
  return all(
    `SELECT n.id, n.title, n.category, n.starts_at, n.note, n.status, pr.display_name, pr.username
     FROM live_notices n JOIN profiles pr ON pr.user_id = n.host_id
     ORDER BY n.starts_at DESC LIMIT 30`,
  );
}

export function endNotice(user: SessionUser, id: string): void {
  ensureReady();
  assertActive(user);
  const row = get<{ host_id: string; status: string }>("SELECT host_id, status FROM live_notices WHERE id = ?", id);
  if (!row || row.host_id !== user.id) throw new AppError(404, "Notice not found");
  if (row.status === "ended") return;
  run("UPDATE live_notices SET status = 'ended' WHERE id = ?", id);
  audit(user.id, "live.end", "live_notice", id, { status: "ended" });
}
