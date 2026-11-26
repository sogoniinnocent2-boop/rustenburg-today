import { ARTICLE_REACTIONS, type ArticleReactionId } from "@/lib/reactions";
import { sections } from "@/lib/sections";
import type { SessionUser } from "./auth";
import { assertActive } from "./auth";
import { hashPassword, randomToken } from "./crypto";
import { all, get, newId, run, transaction, writeBootstrapSecret } from "./db";
import { AppError } from "./errors";
import { ensureReady } from "./init";
import { grantRole, hasPermission, requirePermission } from "./permissions";
import { audit } from "./store";

export type DeskStoryStat = {
  id: string;
  slug: string;
  title: string;
  status: string;
  publishedAt: string | null;
  author: string;
  views: number;
  reactions: number;
  counts: Record<ArticleReactionId, number>;
};

const MANAGEABLE = new Set(
  sections.map((section) => section.slug).filter((slug) => !["map", "briefing", "ask", "productivity"].includes(slug)),
);

const MODULE_DESKS: Record<string, { table: string; owner: string; title: string }> = {
  property: { table: "properties", owner: "owner_id", title: "title" },
  food: { table: "food_places", owner: "owner_id", title: "name" },
  sports: { table: "sports_teams", owner: "owner_id", title: "name" },
  youth: { table: "youth_opportunities", owner: "owner_id", title: "title" },
  support: { table: "support_campaigns", owner: "organiser_id", title: "title" },
  transport: { table: "traffic_reports", owner: "author_id", title: "title" },
  tourism: { table: "tourism_listings", owner: "owner_id", title: "name" },
  health: { table: "health_providers", owner: "owner_id", title: "name" },
  voice: { table: "petitions", owner: "author_id", title: "title" },
  deals: { table: "deals", owner: "owner_id", title: "title" },
  competitions: { table: "competitions", owner: "organiser_id", title: "title" },
  history: { table: "heritage_items", owner: "author_id", title: "title" },
  services: { table: "service_providers", owner: "owner_id", title: "name" },
  agriculture: { table: "agriculture_listings", owner: "owner_id", title: "title" },
  faith: { table: "faith_organisations", owner: "owner_id", title: "name" },
  family: { table: "family_resources", owner: "author_id", title: "title" },
  technology: { table: "technology_organisations", owner: "owner_id", title: "name" },
  notices: { table: "public_notices", owner: "author_id", title: "title" },
};

export function manageableSections(): string[] {
  return [...MANAGEABLE];
}

export function isManageableSection(section: string): boolean {
  return MANAGEABLE.has(section);
}

export function sectionForModule(moduleKey: string): string | null {
  const map: Record<string, string> = {
    property: "property",
    food: "food",
    team: "sports",
    youth: "youth",
    campaign: "support",
    traffic: "transport",
    tourism: "tourism",
    health: "health",
    petition: "voice",
    deal: "deals",
    competition: "competitions",
    heritage: "history",
    service: "services",
    agriculture: "agriculture",
    faith: "faith",
    family: "family",
    technology: "technology",
    notice: "notices",
  };
  return map[moduleKey] || null;
}

export function assignedSections(userId: string): string[] {
  ensureReady();
  return all<{ section_slug: string }>(
    "SELECT section_slug FROM department_assignments WHERE user_id = ? ORDER BY section_slug",
    userId,
  ).map((row) => row.section_slug);
}

export function isAssigned(userId: string, section: string): boolean {
  ensureReady();
  return Boolean(get("SELECT user_id FROM department_assignments WHERE user_id = ? AND section_slug = ?", userId, section));
}

export function canPublishSection(user: SessionUser, section: string): boolean {
  if (!isManageableSection(section)) return false;
  if (user.roles.includes("administrator") || user.roles.includes("editor")) return true;
  return hasPermission(user.id, "departments.publish") && isAssigned(user.id, section);
}

export function requireAssigned(user: SessionUser, section: string): void {
  assertActive(user);
  if (!canPublishSection(user, section)) throw new AppError(403, "You are not assigned to this department");
}

export function listAssignments(): Array<{ user_id: string; email: string; display_name: string; username: string; section_slug: string; created_at: string }> {
  ensureReady();
  return all(
    `SELECT a.user_id, u.email, p.display_name, p.username, a.section_slug, a.created_at
     FROM department_assignments a
     JOIN users u ON u.id = a.user_id
     JOIN profiles p ON p.user_id = a.user_id
     WHERE u.status != 'deleted'
     ORDER BY a.section_slug, p.display_name`,
  );
}

export function assignDepartment(admin: SessionUser, input: { userId?: string; email?: string; section: string }): void {
  ensureReady();
  assertActive(admin);
  requirePermission(admin.id, "users.manage");
  const section = input.section.trim().toLowerCase();
  if (!isManageableSection(section)) throw new AppError(400, "Choose a department page");
  const userId = resolveUserId(input.userId, input.email);
  const stamp = new Date().toISOString();
  run(
    "INSERT OR IGNORE INTO department_assignments (user_id, section_slug, created_by, created_at) VALUES (?, ?, ?, ?)",
    userId,
    section,
    admin.id,
    stamp,
  );
  grantRole(userId, "department_editor");
  audit(admin.id, "department.assign", "user", userId, { section });
}

export function revokeDepartment(admin: SessionUser, userId: string, section: string): void {
  ensureReady();
  assertActive(admin);
  requirePermission(admin.id, "users.manage");
  if (!isManageableSection(section)) throw new AppError(400, "Choose a department page");
  run("DELETE FROM department_assignments WHERE user_id = ? AND section_slug = ?", userId, section);
  if (!assignedSections(userId).length) {
    const role = get<{ id: string }>("SELECT id FROM roles WHERE name = 'department_editor'");
    if (role) run("DELETE FROM user_roles WHERE user_id = ? AND role_id = ?", userId, role.id);
  }
  audit(admin.id, "department.revoke", "user", userId, { section });
}

function staffPassword(raw?: string): string {
  if (!raw) return randomToken(12);
  const password = raw.trim();
  if (password.length < 10 || password.length > 200) throw new AppError(400, "Use at least 10 characters for the password");
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) throw new AppError(400, "Password needs a letter and a number");
  return password;
}

export function createDepartmentStaff(
  admin: SessionUser,
  input: { email: string; displayName: string; section: string; password?: string },
): { userId: string; email: string; passwordFile: string | null } {
  ensureReady();
  assertActive(admin);
  requirePermission(admin.id, "users.manage");
  const section = input.section.trim().toLowerCase();
  if (!isManageableSection(section)) throw new AppError(400, "Choose a department page");
  const email = input.email.trim().toLowerCase();
  if (!/^[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}$/.test(email) || email.length > 180) throw new AppError(400, "Enter a valid email");
  if (get("SELECT id FROM users WHERE email = ?", email)) throw new AppError(409, "That email already has an account");
  const displayName = input.displayName.trim().slice(0, 80);
  if (displayName.length < 2) throw new AppError(400, "Enter the person's name");
  const password = staffPassword(input.password);
  const userId = newId();
  const stamp = new Date().toISOString();
  const username = uniqueStaffUsername(displayName);
  transaction(() => {
    run(
      "INSERT INTO users (id, auth_user_id, email, password_hash, email_verified_at, status, is_minor, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'active', 0, ?, ?)",
      userId,
      userId,
      email,
      hashPassword(password),
      stamp,
      stamp,
      stamp,
    );
    run(
      "INSERT INTO profiles (id, user_id, display_name, username, preferred_language, visibility, biography, created_at, updated_at) VALUES (?, ?, ?, ?, 'en', 'public', ?, ?, ?)",
      newId(),
      userId,
      displayName,
      username,
      `${displayName} · ${section} desk`,
      stamp,
      stamp,
    );
    run("INSERT INTO user_preferences (user_id, theme, language, notification_settings, privacy_settings) VALUES (?, 'light', 'en', '{}', '{\"messagePolicy\":\"connections\"}')", userId);
    run("INSERT INTO rewards_accounts (user_id, balance, updated_at) VALUES (?, 0, ?)", userId, stamp);
    run("INSERT INTO consent_records (id, user_id, consent_type, version, granted, created_at) VALUES (?, ?, 'terms', '1.0', 1, ?)", newId(), userId, stamp);
    for (const role of ["resident", "reader", "contributor"]) grantRole(userId, role);
    grantRole(userId, "department_editor");
    run(
      "INSERT INTO department_assignments (user_id, section_slug, created_by, created_at) VALUES (?, ?, ?, ?)",
      userId,
      section,
      admin.id,
      stamp,
    );
  });
  let passwordFile: string | null = null;
  if (process.env.NODE_ENV !== "test") {
    passwordFile = writeBootstrapSecret(
      `department-${section}-${username}.txt`,
      `email=${email}\npassword=${password}\nsection=${section}\nOpen /department after signing in, then choose your desk. Change the password under Account → Security.\n`,
    );
  }
  audit(admin.id, "department.staff.create", "user", userId, { section, email });
  return { userId, email, passwordFile };
}

export function deskStoryReport(user: SessionUser, section: string): DeskStoryStat[] {
  ensureReady();
  requireAssigned(user, section);
  const emptyCounts = () => Object.fromEntries(ARTICLE_REACTIONS.map((item) => [item.id, 0])) as Record<ArticleReactionId, number>;
  const rows = all<{
    id: string;
    slug: string;
    title: string;
    status: string;
    published_at: string | null;
    author: string;
    views: number;
  }>(
    `SELECT a.id, a.slug, COALESCE(t.title, a.slug) as title, a.status, a.published_at, p.display_name as author, a.view_count as views
     FROM articles a
     LEFT JOIN article_translations t ON t.article_id = a.id AND t.language_code = 'en'
     JOIN profiles p ON p.user_id = a.author_id
     WHERE a.department_slug = ? AND a.deleted_at IS NULL
     ORDER BY COALESCE(a.published_at, a.updated_at) DESC
     LIMIT 200`,
    section,
  );
  if (!rows.length) return [];
  const countsByArticle = new Map<string, Record<ArticleReactionId, number>>();
  const placeholders = rows.map(() => "?").join(", ");
  for (const row of all<{ article_id: string; reaction_type: string; total: number }>(
    `SELECT article_id, reaction_type, COUNT(*) as total
     FROM article_reactions
     WHERE article_id IN (${placeholders})
     GROUP BY article_id, reaction_type`,
    ...rows.map((row) => row.id),
  )) {
    const bucket = countsByArticle.get(row.article_id) || emptyCounts();
    if (row.reaction_type in bucket) bucket[row.reaction_type as ArticleReactionId] = Number(row.total);
    countsByArticle.set(row.article_id, bucket);
  }
  return rows.map((row) => {
    const counts = countsByArticle.get(row.id) || emptyCounts();
    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      status: row.status,
      publishedAt: row.published_at,
      author: row.author,
      views: Number(row.views) || 0,
      reactions: Object.values(counts).reduce((sum, value) => sum + value, 0),
      counts,
    };
  });
}

export function deskStoryReportCsv(user: SessionUser, section: string): string {
  const rows = deskStoryReport(user, section);
  const headers = [
    "title",
    "slug",
    "status",
    "published_at",
    "author",
    "views",
    "reactions_total",
    ...ARTICLE_REACTIONS.map((item) => item.id),
  ];
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(
      [
        csvCell(row.title),
        csvCell(row.slug),
        csvCell(row.status),
        csvCell(row.publishedAt || ""),
        csvCell(row.author),
        row.views,
        row.reactions,
        ...ARTICLE_REACTIONS.map((item) => row.counts[item.id]),
      ].join(","),
    );
  }
  return `${lines.join("\n")}\n`;
}

function csvCell(value: string | number): string {
  const text = String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

export function deskItems(userId: string, section: string): Array<Record<string, unknown>> {
  ensureReady();
  const stories = all<Record<string, unknown>>(
    `SELECT a.id, a.slug, a.status, COALESCE(t.title, a.slug) as title, a.updated_at, a.featured_image as image, a.view_count as views, 'story' as kind
     FROM articles a
     LEFT JOIN article_translations t ON t.article_id = a.id AND t.language_code = 'en'
     WHERE a.author_id = ? AND a.department_slug = ? AND a.deleted_at IS NULL
     ORDER BY a.updated_at DESC LIMIT 40`,
    userId,
    section,
  );
  if (section === "news") return stories;
  let records: Array<Record<string, unknown>> = [];
  if (section === "jobs") records = all("SELECT id, title, status, updated_at FROM jobs WHERE employer_id = ? ORDER BY updated_at DESC LIMIT 40", userId);
  else if (section === "events") records = all("SELECT id, title, status, updated_at FROM events WHERE organiser_id = ? ORDER BY updated_at DESC LIMIT 40", userId);
  else if (section === "learn") records = all("SELECT id, title, status, updated_at FROM courses WHERE instructor_id = ? ORDER BY updated_at DESC LIMIT 40", userId);
  else if (section === "business") records = all("SELECT id, name as title, status, updated_at FROM businesses WHERE owner_id = ? ORDER BY updated_at DESC LIMIT 40", userId);
  else if (section === "marketplace") records = all("SELECT id, title, listing_status as status, updated_at FROM products WHERE seller_id = ? ORDER BY updated_at DESC LIMIT 40", userId);
  else if (section === "community") records = all("SELECT id, substr(body, 1, 120) as title, status, updated_at FROM community_posts WHERE author_id = ? ORDER BY updated_at DESC LIMIT 40", userId);
  else if (section === "creators") {
    records = all(
      `SELECT p.id, p.title, p.status, p.updated_at FROM creator_posts p
       JOIN creator_profiles c ON c.id = p.creator_id
       WHERE c.user_id = ? ORDER BY p.updated_at DESC LIMIT 40`,
      userId,
    );
  } else if (section === "podcasts") records = all("SELECT id, title, status, updated_at FROM podcasts WHERE creator_id = ? ORDER BY updated_at DESC LIMIT 40", userId);
  else if (section === "tv") records = all("SELECT id, title, status, updated_at FROM videos WHERE creator_id = ? ORDER BY updated_at DESC LIMIT 40", userId);
  else if (section === "talent") records = all("SELECT id, stage_name as title, status, updated_at FROM talent_profiles WHERE user_id = ? ORDER BY updated_at DESC LIMIT 40", userId);
  else if (section === "advertising") records = all("SELECT id, title, approval_status as status, updated_at FROM advertising_campaigns WHERE advertiser_id = ? ORDER BY updated_at DESC LIMIT 40", userId);
  else if (section === "radio" || section === "music") records = [];
  else {
    const spec = MODULE_DESKS[section];
    if (spec) {
      records = all(
        `SELECT id, ${spec.title} as title, status, updated_at FROM ${spec.table} WHERE ${spec.owner} = ? AND deleted_at IS NULL ORDER BY updated_at DESC LIMIT 40`,
        userId,
      );
    }
  }
  return [...stories, ...records].slice(0, 40);
}

function resolveUserId(userId?: string, email?: string): string {
  if (userId?.trim()) {
    const row = get<{ id: string }>("SELECT id FROM users WHERE id = ? AND status != 'deleted'", userId.trim());
    if (!row) throw new AppError(404, "Account not found");
    return row.id;
  }
  const value = email?.trim().toLowerCase();
  if (!value) throw new AppError(400, "Enter the account email");
  const row = get<{ id: string }>("SELECT id FROM users WHERE email = ? AND status != 'deleted'", value);
  if (!row) throw new AppError(404, "No account uses that email");
  return row.id;
}

function uniqueStaffUsername(displayName: string): string {
  const base = displayName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || "desk";
  let candidate = base;
  let n = 1;
  while (get("SELECT id FROM profiles WHERE username = ?", candidate)) {
    candidate = `${base}-${n++}`;
  }
  return candidate;
}
