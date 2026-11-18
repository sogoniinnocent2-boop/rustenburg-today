import { deskByKind, DESKS, type DeskSpec } from "@/lib/desk-catalog";
import { containsSensitiveIdentity } from "@/lib/text";
import type { SessionUser } from "./auth";
import { assertActive } from "./auth";
import { all, get, newId, run } from "./db";
import { AppError } from "./errors";
import { ensureReady } from "./init";
import { requirePermission } from "./permissions";
import { notify } from "./alerts";
import { audit, rateLimit, setting } from "./store";

export type DeskRow = {
  id: string;
  kind: string;
  author_id: string;
  title: string;
  body: string;
  place: string | null;
  starts_on: string | null;
  ends_on: string | null;
  source_url: string | null;
  price_cents: number | null;
  status: string;
  created_at: string;
  display_name?: string;
};

function cleanUrl(value: string): string | null {
  if (!value) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new AppError(400, "The link must start with https://");
  }
  if (url.protocol !== "https:") throw new AppError(400, "The link must start with https://");
  return url.toString().slice(0, 400);
}

function cleanDate(value: string): string | null {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new AppError(400, "Use a date as YYYY-MM-DD");
  return value;
}

export function listDesk(kind: string, userId?: string | null): DeskRow[] {
  ensureReady();
  const spec = deskByKind(kind);
  if (!spec) return [];
  if (spec.mode === "personal") {
    if (!userId) return [];
    return all<DeskRow>(
      `SELECT d.*, pr.display_name as display_name
       FROM city_desks d JOIN profiles pr ON pr.user_id = d.author_id
       WHERE d.kind = ? AND d.author_id = ? AND d.status = 'personal'
       ORDER BY d.created_at DESC LIMIT 40`,
      kind,
      userId,
    );
  }
  return all<DeskRow>(
    `SELECT d.*, pr.display_name as display_name
     FROM city_desks d JOIN profiles pr ON pr.user_id = d.author_id
     WHERE d.kind = ? AND d.status IN ('published', 'preview')
     ORDER BY d.created_at DESC LIMIT 40`,
    kind,
  );
}

export function pendingDesks(kind?: string): DeskRow[] {
  ensureReady();
  if (kind) {
    return all<DeskRow>(
      `SELECT d.*, pr.display_name as display_name FROM city_desks d JOIN profiles pr ON pr.user_id = d.author_id
       WHERE d.kind = ? AND d.status = 'pending' ORDER BY d.created_at ASC LIMIT 40`,
      kind,
    );
  }
  return all<DeskRow>(
    `SELECT d.*, pr.display_name as display_name FROM city_desks d JOIN profiles pr ON pr.user_id = d.author_id
     WHERE d.status = 'pending' ORDER BY d.created_at ASC LIMIT 60`,
  );
}

export function deskCounts(): Record<string, number> {
  ensureReady();
  const rows = all<{ kind: string; total: number }>(
    "SELECT kind, COUNT(*) as total FROM city_desks WHERE status = 'published' GROUP BY kind",
  );
  return Object.fromEntries(rows.map((row) => [row.kind, row.total]));
}

export function followingDesk(userId: string, kind: string): boolean {
  ensureReady();
  return Boolean(get("SELECT user_id FROM city_desk_follows WHERE user_id = ? AND kind = ?", userId, kind));
}

export function toggleDeskFollow(user: SessionUser, kind: string): boolean {
  ensureReady();
  assertActive(user);
  const spec = deskByKind(kind);
  if (!spec || spec.mode === "personal") throw new AppError(400, "That desk cannot be followed");
  const existing = get("SELECT user_id FROM city_desk_follows WHERE user_id = ? AND kind = ?", user.id, kind);
  if (existing) {
    run("DELETE FROM city_desk_follows WHERE user_id = ? AND kind = ?", user.id, kind);
    return false;
  }
  run("INSERT INTO city_desk_follows (user_id, kind, created_at) VALUES (?, ?, ?)", user.id, kind, new Date().toISOString());
  return true;
}

function tellFollowers(spec: DeskSpec, title: string): void {
  const people = all<{ user_id: string }>("SELECT user_id FROM city_desk_follows WHERE kind = ?", spec.kind);
  for (const person of people) {
    notify(person.user_id, "desk", spec.title, title.slice(0, 140), `/desks/${spec.kind}`);
  }
}

export function fileDesk(
  user: SessionUser,
  input: { kind: string; title: string; body: string; place?: string; startsOn?: string; endsOn?: string; sourceUrl?: string; priceCents?: number | null },
): { id: string; status: string } {
  ensureReady();
  assertActive(user);
  const spec = deskByKind(input.kind);
  if (!spec) throw new AppError(404, "Unknown desk");
  rateLimit(`desk:${user.id}`, 40, 60 * 60 * 1000);
  const title = input.title.trim();
  const body = input.body.trim();
  if (title.length < 3 || title.length > 120) throw new AppError(400, "The title needs 3 to 120 characters");
  if (body.length < 2 || body.length > 2000) throw new AppError(400, "Write between 2 and 2000 characters");
  if (containsSensitiveIdentity(`${title} ${body}`)) throw new AppError(400, "Remove identity numbers before posting");
  const place = (input.place || "").trim().slice(0, 120) || null;
  const startsOn = cleanDate(input.startsOn || "");
  const endsOn = cleanDate(input.endsOn || "");
  const sourceUrl = cleanUrl((input.sourceUrl || "").trim());
  let priceCents: number | null = null;
  if (spec.mode === "income") {
    if (user.isMinor) throw new AppError(403, "A priced request is not available on accounts under 18");
    if (input.priceCents == null || !Number.isInteger(input.priceCents) || input.priceCents < 100) throw new AppError(400, "Enter an amount of at least R1");
    if (input.priceCents > 100_000_000) throw new AppError(400, "Amount is too large");
    priceCents = input.priceCents;
  }
  let status = "published";
  if (spec.mode === "personal") status = "personal";
  else if (spec.mode === "hold" || user.isMinor) status = "pending";
  else if (spec.mode === "income") status = setting("payment_mode", "disabled") === "disabled" ? "preview" : "unpaid";
  const id = newId();
  const stamp = new Date().toISOString();
  run(
    `INSERT INTO city_desks (id, kind, author_id, title, body, place, starts_on, ends_on, source_url, price_cents, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    spec.kind,
    user.id,
    title,
    body,
    place,
    startsOn,
    endsOn,
    sourceUrl,
    priceCents,
    status,
    stamp,
    stamp,
  );
  audit(user.id, "desk.file", "desk", id, { kind: spec.kind, status });
  if (status === "published") tellFollowers(spec, title);
  return { id, status };
}

export function reviewDesk(user: SessionUser, id: string, decision: "publish" | "close"): void {
  ensureReady();
  assertActive(user);
  requirePermission(user.id, "admin.access");
  const row = get<DeskRow>("SELECT * FROM city_desks WHERE id = ?", id);
  if (!row || row.status === "personal") throw new AppError(404, "That note is not waiting for review");
  const spec = deskByKind(row.kind);
  if (!spec) throw new AppError(404, "Unknown desk");
  if (decision === "close") {
    run("UPDATE city_desks SET status = 'closed', updated_at = ? WHERE id = ?", new Date().toISOString(), id);
    audit(user.id, "desk.close", "desk", id, { kind: row.kind });
    return;
  }
  if (row.status !== "pending") throw new AppError(400, "Only a note waiting for review can be published");
  if (spec.mode === "income") throw new AppError(400, "A priced request stays a preview until a signed payment webhook");
  run("UPDATE city_desks SET status = 'published', updated_at = ? WHERE id = ?", new Date().toISOString(), id);
  audit(user.id, "desk.publish", "desk", id, { kind: row.kind });
  tellFollowers(spec, row.title);
}

export function catalog(): DeskSpec[] {
  return DESKS;
}
