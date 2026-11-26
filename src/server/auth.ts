import { z } from "zod";
import { ageFromDob, slugify } from "@/lib/text";
import { DEFAULT_ROLE_NAMES, REQUEST_ONLY_ROLES, ROLES } from "./access";
import { hashPassword, randomToken, readSignedValue, sha256, signValue, verifyPassword } from "./crypto";
import { all, get, newId, run, transaction } from "./db";
import { AppError } from "./errors";
import { ensureReady } from "./init";
import { queueEmail } from "./mail";
import { grantRole, hasPermission, requirePermission, userRoleNames } from "./permissions";
import { audit, rateLimit } from "./store";

const passwordSchema = z.string().min(10, "Use at least 10 characters").max(200).regex(/[A-Za-z]/, "Include a letter").regex(/\d/, "Include a number");
const emailSchema = z.string().trim().email("Enter a valid email").max(180).transform((value) => value.toLowerCase());

export type SessionUser = {
  id: string;
  email: string;
  phone: string | null;
  status: string;
  isMinor: boolean;
  emailVerified: boolean;
  displayName: string;
  username: string;
  language: string;
  locationId: string | null;
  biography: string | null;
  avatarUrl: string | null;
  coverUrl: string | null;
  websiteUrl: string | null;
  visibility: string;
  hasPassword: boolean;
  roles: string[];
};

type UserRow = {
  id: string;
  email: string;
  phone: string | null;
  password_hash: string | null;
  email_verified_at: string | null;
  status: string;
  is_minor: number;
};

const DUMMY_HASH = hashPassword("timing-pad-password-9");

export function loadUser(userId: string): SessionUser | null {
  ensureReady();
  const row = get<UserRow & { display_name: string; username: string; preferred_language: string; location_id: string | null; biography: string | null; avatar_url: string | null; cover_url: string | null; website_url: string | null; visibility: string }>(
    `SELECT u.id, u.email, u.phone, u.password_hash, u.email_verified_at, u.status, u.is_minor,
            p.display_name, p.username, p.preferred_language, p.location_id, p.biography, p.avatar_url, p.cover_url, p.website_url, p.visibility
     FROM users u JOIN profiles p ON p.user_id = u.id WHERE u.id = ?`,
    userId,
  );
  if (!row || row.status === "deleted") return null;
  return {
    id: row.id,
    email: row.email,
    phone: row.phone,
    status: row.status,
    isMinor: row.is_minor === 1,
    emailVerified: Boolean(row.email_verified_at),
    displayName: row.display_name,
    username: row.username,
    language: row.preferred_language,
    locationId: row.location_id,
    biography: row.biography,
    avatarUrl: row.avatar_url,
    coverUrl: row.cover_url ?? null,
    websiteUrl: row.website_url ?? null,
    visibility: row.visibility,
    hasPassword: Boolean(row.password_hash),
    roles: userRoleNames(row.id),
  };
}

export function startSession(userId: string, meta?: { ip?: string; userAgent?: string }): string {
  ensureReady();
  const token = randomToken();
  const expires = new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString();
  run(
    "INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at, user_agent, ip_address) VALUES (?, ?, ?, ?, ?, ?, ?)",
    newId(),
    userId,
    sha256(token),
    expires,
    new Date().toISOString(),
    meta?.userAgent?.slice(0, 240) || null,
    meta?.ip || null,
  );
  return signValue(token);
}

export function userFromCookie(signed: string | null | undefined): SessionUser | null {
  ensureReady();
  const token = readSignedValue(signed);
  if (!token) return null;
  const session = get<{ user_id: string; expires_at: string }>("SELECT user_id, expires_at FROM sessions WHERE token_hash = ?", sha256(token));
  if (!session || session.expires_at < new Date().toISOString()) return null;
  return loadUser(session.user_id);
}

export function assertActive(user: SessionUser, options?: { verified?: boolean }): void {
  if (user.status === "suspended") throw new AppError(403, "This account is suspended");
  if (user.status === "deleted") throw new AppError(403, "This account is closed");
  if (options?.verified !== false && !user.emailVerified) throw new AppError(403, "Verify your email before doing this");
  if (user.status === "pending") throw new AppError(403, "Finish setting up this account before doing this");
}

function uniqueUsername(displayName: string): string {
  const base = slugify(displayName).replace(/-/g, "_").replace(/[^a-z0-9_]/g, "").slice(0, 18);
  let candidate = base.length >= 3 ? base : `resident_${base || "user"}`;
  let n = 2;
  while (get("SELECT user_id FROM profiles WHERE username = ?", candidate)) {
    candidate = `${base.slice(0, 16)}_${n++}`;
  }
  return candidate.slice(0, 24);
}

export function registerAccount(input: {
  email: string;
  password: string;
  displayName: string;
  dateOfBirth: string;
  phone?: string;
  locationId?: string | null;
  acceptedTerms: boolean;
  guardianConsent: boolean;
  locale: string;
  ip?: string;
}): { userId: string; verifyToken: string } {
  ensureReady();
  rateLimit(`register:${input.ip || "local"}`, 8, 60 * 60 * 1000);
  const email = emailSchema.parse(input.email);
  const password = passwordSchema.parse(input.password);
  const displayName = z.string().trim().min(2).max(60).parse(input.displayName);
  if (!input.acceptedTerms) throw new AppError(400, "Accept the terms to create an account");
  const age = ageFromDob(input.dateOfBirth);
  if (age === null || age > 120) throw new AppError(400, "Enter a real date of birth");
  if (age < 13) throw new AppError(400, "Accounts are not available under 13");
  if (age < 18 && !input.guardianConsent) throw new AppError(400, "A parent or guardian must consent");
  if (get("SELECT id FROM users WHERE email = ?", email)) throw new AppError(409, "An account with that email already exists");

  const userId = newId();
  const profileId = newId();
  const stamp = new Date().toISOString();
  const verifyToken = randomToken();
  transaction(() => {
    run(
      "INSERT INTO users (id, auth_user_id, email, phone, password_hash, status, is_minor, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?)",
      userId,
      userId,
      email,
      input.phone?.trim() || null,
      hashPassword(password),
      age < 18 ? 1 : 0,
      stamp,
      stamp,
    );
    run(
      "INSERT INTO profiles (id, user_id, display_name, username, preferred_language, location_id, visibility, date_of_birth, guardian_consent_at, biography, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'public', ?, ?, '', ?, ?)",
      profileId,
      userId,
      displayName,
      uniqueUsername(displayName),
      input.locale === "af" || input.locale === "tn" ? input.locale : "en",
      input.locationId || null,
      input.dateOfBirth,
      age < 18 ? stamp : null,
      stamp,
      stamp,
    );
    run(
      "INSERT INTO user_preferences (user_id, theme, language, notification_settings, privacy_settings) VALUES (?, 'light', ?, '{}', ?)",
      userId,
      input.locale === "af" || input.locale === "tn" ? input.locale : "en",
      JSON.stringify({ messagePolicy: age < 18 ? "none" : "connections" }),
    );
    run("INSERT INTO briefing_preferences (user_id, interests_json, channel, delivery_hour, enabled) VALUES (?, ?, 'in_app', 7, 1)", userId, JSON.stringify(["news", "events", "jobs", "deals", "notices"]));
    run("INSERT INTO rewards_accounts (user_id, balance, updated_at) VALUES (?, 0, ?)", userId, stamp);
    for (const role of DEFAULT_ROLE_NAMES) grantRole(userId, role);
    run("INSERT INTO consent_records (id, user_id, consent_type, version, granted, created_at) VALUES (?, ?, 'terms', '1.0', 1, ?)", newId(), userId, stamp);
    if (age < 18) {
      run("INSERT INTO consent_records (id, user_id, consent_type, version, granted, created_at) VALUES (?, ?, 'guardian', '1.0', 1, ?)", newId(), userId, stamp);
    }
    run(
      "INSERT INTO email_tokens (id, user_id, purpose, token_hash, expires_at, created_at) VALUES (?, ?, 'verify', ?, ?, ?)",
      newId(),
      userId,
      sha256(verifyToken),
      new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
      stamp,
    );
  });
  queueEmail(email, "verify", input.locale, { url: `/auth/verify?token=${verifyToken}` });
  audit(userId, "account.register", "user", userId);
  return { userId, verifyToken };
}

export function verifyEmail(token: string): SessionUser {
  ensureReady();
  const row = get<{ id: string; user_id: string; expires_at: string; used_at: string | null }>(
    "SELECT id, user_id, expires_at, used_at FROM email_tokens WHERE token_hash = ? AND purpose = 'verify'",
    sha256(token),
  );
  if (!row || row.used_at || row.expires_at < new Date().toISOString()) throw new AppError(400, "This verification link is not valid");
  const stamp = new Date().toISOString();
  run("UPDATE email_tokens SET used_at = ? WHERE id = ?", stamp, row.id);
  run("UPDATE users SET email_verified_at = ?, status = 'active', updated_at = ? WHERE id = ? AND status != 'suspended'", stamp, stamp, row.user_id);
  audit(row.user_id, "account.verify", "user", row.user_id);
  const user = loadUser(row.user_id);
  if (!user) throw new AppError(404, "Account not found");
  return user;
}

export function loginAccount(email: string, password: string, meta?: { ip?: string; userAgent?: string }): { user: SessionUser; cookie: string } {
  ensureReady();
  rateLimit(`login:${meta?.ip || "local"}`, 10, 15 * 60 * 1000);
  const parsed = emailSchema.safeParse(email);
  const user = parsed.success ? get<UserRow>("SELECT * FROM users WHERE email = ?", parsed.data) : undefined;
  const hash = user?.password_hash || DUMMY_HASH;
  const match = verifyPassword(password, hash);
  if (!user || !match || user.status === "deleted") throw new AppError(401, "Email or password is incorrect");
  if (user.status === "suspended") throw new AppError(403, "This account is suspended");
  const token = randomToken();
  const expires = new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString();
  run(
    "INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at, user_agent, ip_address) VALUES (?, ?, ?, ?, ?, ?, ?)",
    newId(),
    user.id,
    sha256(token),
    expires,
    new Date().toISOString(),
    meta?.userAgent?.slice(0, 240) || null,
    meta?.ip || null,
  );
  audit(user.id, "account.login", "user", user.id);
  const sessionUser = loadUser(user.id);
  if (!sessionUser) throw new AppError(404, "Account not found");
  return { user: sessionUser, cookie: signValue(token) };
}

export function logoutCookie(signed: string | null | undefined): void {
  ensureReady();
  const token = readSignedValue(signed);
  if (!token) return;
  const session = get<{ user_id: string }>("SELECT user_id FROM sessions WHERE token_hash = ?", sha256(token));
  run("DELETE FROM sessions WHERE token_hash = ?", sha256(token));
  if (session) audit(session.user_id, "account.logout", "user", session.user_id);
}

export function requestPasswordReset(email: string, locale: string): { token: string | null } {
  ensureReady();
  const parsed = emailSchema.safeParse(email);
  if (!parsed.success) return { token: null };
  const user = get<{ id: string; status: string }>("SELECT id, status FROM users WHERE email = ?", parsed.data);
  if (!user || user.status === "deleted" || user.status === "suspended") return { token: null };
  const token = randomToken();
  run(
    "INSERT INTO email_tokens (id, user_id, purpose, token_hash, expires_at, created_at) VALUES (?, ?, 'reset', ?, ?, ?)",
    newId(),
    user.id,
    sha256(token),
    new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    new Date().toISOString(),
  );
  queueEmail(parsed.data, "reset", locale, { url: `/auth/reset?token=${token}` });
  return { token };
}

export function resetPassword(token: string, password: string): void {
  ensureReady();
  const next = passwordSchema.parse(password);
  const row = get<{ id: string; user_id: string; expires_at: string; used_at: string | null }>(
    "SELECT id, user_id, expires_at, used_at FROM email_tokens WHERE token_hash = ? AND purpose = 'reset'",
    sha256(token),
  );
  if (!row || row.used_at || row.expires_at < new Date().toISOString()) throw new AppError(400, "This reset link is not valid");
  const stamp = new Date().toISOString();
  run("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?", hashPassword(next), stamp, row.user_id);
  run("UPDATE email_tokens SET used_at = ? WHERE id = ?", stamp, row.id);
  run("DELETE FROM sessions WHERE user_id = ?", row.user_id);
  audit(row.user_id, "account.reset", "user", row.user_id);
}

function safeWebsite(value: string | null): string | null {
  if (!value || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("protocol");
    return url.toString().slice(0, 300);
  } catch {
    throw new AppError(400, "Use a valid http or https website address");
  }
}

export function updateProfile(user: SessionUser, input: { displayName?: string; biography?: string; language?: string; locationId?: string | null; visibility?: string; phone?: string; theme?: string; messagePolicy?: string; avatarUrl?: string | null; coverUrl?: string | null; websiteUrl?: string | null }): void {
  ensureReady();
  assertActive(user);
  const displayName = input.displayName ? z.string().trim().min(2).max(60).parse(input.displayName) : user.displayName;
  const biography = (input.biography ?? user.biography ?? "").slice(0, 800);
  const language = input.language === "af" || input.language === "tn" || input.language === "en" ? input.language : user.language;
  const visibility = input.visibility === "private" || input.visibility === "public" ? input.visibility : user.visibility;
  const policy = user.isMinor ? "none" : input.messagePolicy === "everyone" || input.messagePolicy === "none" || input.messagePolicy === "connections" ? input.messagePolicy : "connections";
  const stamp = new Date().toISOString();
  run(
    "UPDATE profiles SET display_name = ?, biography = ?, preferred_language = ?, location_id = ?, visibility = ?, updated_at = ? WHERE user_id = ?",
    displayName,
    biography,
    language,
    input.locationId === undefined ? user.locationId : input.locationId,
    visibility,
    stamp,
    user.id,
  );
  if (input.phone !== undefined) run("UPDATE users SET phone = ?, updated_at = ? WHERE id = ?", input.phone.trim() || null, stamp, user.id);
  if (input.avatarUrl !== undefined) run("UPDATE profiles SET avatar_url = ?, updated_at = ? WHERE user_id = ?", input.avatarUrl, stamp, user.id);
  if (input.coverUrl !== undefined) run("UPDATE profiles SET cover_url = ?, updated_at = ? WHERE user_id = ?", input.coverUrl, stamp, user.id);
  if (input.websiteUrl !== undefined) run("UPDATE profiles SET website_url = ?, updated_at = ? WHERE user_id = ?", safeWebsite(input.websiteUrl), stamp, user.id);
  run(
    "UPDATE user_preferences SET theme = ?, language = ?, privacy_settings = ? WHERE user_id = ?",
    input.theme === "dark" ? "dark" : input.theme === "light" ? "light" : "light",
    language,
    JSON.stringify({ messagePolicy: policy }),
    user.id,
  );
  audit(user.id, "account.profile", "user", user.id);
}

export function messagePolicy(userId: string): "everyone" | "connections" | "none" {
  const row = get<{ privacy_settings: string }>("SELECT privacy_settings FROM user_preferences WHERE user_id = ?", userId);
  const policy = row ? (JSON.parse(row.privacy_settings) as { messagePolicy?: string }).messagePolicy : "connections";
  return policy === "everyone" || policy === "none" ? policy : "connections";
}

export function changePassword(user: SessionUser, current: string, next: string): void {
  ensureReady();
  assertActive(user, { verified: false });
  const row = get<{ password_hash: string }>("SELECT password_hash FROM users WHERE id = ?", user.id);
  if (!row || !verifyPassword(current, row.password_hash)) throw new AppError(400, "Current password is incorrect");
  run("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?", hashPassword(passwordSchema.parse(next)), new Date().toISOString(), user.id);
  audit(user.id, "account.password", "user", user.id);
}

export function deleteAccount(user: SessionUser, password: string, confirmation: string): void {
  ensureReady();
  if (confirmation !== "DELETE") throw new AppError(400, "Type DELETE to confirm this closes the account");
  const row = get<{ password_hash: string | null }>("SELECT password_hash FROM users WHERE id = ?", user.id);
  if (!row) throw new AppError(404, "Account not found");
  if (row.password_hash && !verifyPassword(password, row.password_hash)) throw new AppError(400, "Password is incorrect");
  const stamp = new Date().toISOString();
  transaction(() => {
    run("INSERT INTO deletion_requests (id, user_id, status, reason, created_at, completed_at) VALUES (?, ?, 'completed', 'self-service', ?, ?)", newId(), user.id, stamp, stamp);
    run("DELETE FROM sessions WHERE user_id = ?", user.id);
    run("UPDATE users SET email = ?, phone = NULL, password_hash = NULL, status = 'deleted', deleted_at = ?, updated_at = ? WHERE id = ?", `deleted+${user.id}@invalid.local`, stamp, stamp, user.id);
    run("UPDATE profiles SET display_name = 'Deleted user', biography = '', avatar_url = NULL, visibility = 'private', date_of_birth = NULL, updated_at = ? WHERE user_id = ?", stamp, user.id);
  });
  audit(user.id, "account.delete", "user", user.id);
}

export function exportAccount(userId: string): Record<string, unknown> {
  ensureReady();
  return {
    user: get("SELECT id, email, phone, status, created_at FROM users WHERE id = ?", userId),
    profile: get("SELECT display_name, username, biography, preferred_language, visibility FROM profiles WHERE user_id = ?", userId),
    consents: all("SELECT consent_type, version, granted, created_at FROM consent_records WHERE user_id = ?", userId),
    posts: all("SELECT id, body, status, created_at FROM community_posts WHERE author_id = ?", userId),
    articles: all("SELECT id, slug, status, created_at FROM articles WHERE author_id = ?", userId),
    applications: all("SELECT id, job_id, application_status, created_at FROM job_applications WHERE applicant_id = ?", userId),
    orders: all("SELECT id, total_cents, order_status, payment_status, created_at FROM marketplace_orders WHERE buyer_id = ? OR seller_id = ?", userId, userId),
    notifications: all("SELECT title, body, created_at, read_at FROM notifications WHERE user_id = ?", userId),
  };
}

export function enableSelfServeRole(user: SessionUser, roleName: string): void {
  ensureReady();
  assertActive(user);
  const role = ROLES[roleName];
  if (!role?.selfServe) throw new AppError(400, "That capability has to be approved by staff");
  grantRole(user.id, roleName);
  if (roleName === "seller" && !get("SELECT id FROM seller_profiles WHERE user_id = ?", user.id)) {
    run(
      "INSERT INTO seller_profiles (id, user_id, display_name, biography, verification_status, created_at) VALUES (?, ?, ?, '', 'unverified', ?)",
      newId(),
      user.id,
      user.displayName,
      new Date().toISOString(),
    );
  }
  if (roleName === "creator" && !get("SELECT id FROM creator_profiles WHERE user_id = ?", user.id)) {
    const slug = `${user.username}-channel`;
    run(
      "INSERT INTO creator_profiles (id, user_id, display_name, biography, channel_slug, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      newId(),
      user.id,
      user.displayName,
      user.biography || "Creator on Rustenburg Today",
      slug,
      new Date().toISOString(),
    );
  }
  audit(user.id, "account.role", "role", roleName);
}

export function requestPrivilegedRole(user: SessionUser, roleName: string): void {
  ensureReady();
  assertActive(user);
  if (!REQUEST_ONLY_ROLES.includes(roleName)) throw new AppError(400, "That role cannot be requested here");
  run("INSERT INTO role_requests (id, user_id, role_name, status, created_at) VALUES (?, ?, ?, 'pending', ?)", newId(), user.id, roleName, new Date().toISOString());
  audit(user.id, "account.role.request", "role", roleName);
}

export function decideRoleRequest(actor: SessionUser, requestId: string, approve: boolean): void {
  ensureReady();
  requirePermission(actor.id, "users.manage");
  const request = get<{ id: string; user_id: string; role_name: string; status: string }>("SELECT * FROM role_requests WHERE id = ?", requestId);
  if (!request || request.status !== "pending") throw new AppError(404, "Request not found");
  const stamp = new Date().toISOString();
  run("UPDATE role_requests SET status = ?, decided_by = ?, decided_at = ? WHERE id = ?", approve ? "approved" : "rejected", actor.id, stamp, request.id);
  if (approve) {
    grantRole(request.user_id, request.role_name);
    provisionRoleProfile(request.user_id, request.role_name);
  }
  audit(actor.id, approve ? "role.approve" : "role.reject", "role_request", request.id);
}

function provisionRoleProfile(userId: string, roleName: string): void {
  const person = get<{ display_name: string; username: string; biography: string | null }>("SELECT display_name, username, biography FROM profiles WHERE user_id = ?", userId);
  if (!person) return;
  const stamp = new Date().toISOString();
  if (roleName === "seller" && !get("SELECT id FROM seller_profiles WHERE user_id = ?", userId)) {
    run("INSERT INTO seller_profiles (id, user_id, display_name, biography, verification_status, created_at) VALUES (?, ?, ?, '', 'unverified', ?)", newId(), userId, person.display_name, stamp);
  }
  if ((roleName === "creator" || roleName === "podcaster" || roleName === "presenter") && !get("SELECT id FROM creator_profiles WHERE user_id = ?", userId)) {
    run("INSERT INTO creator_profiles (id, user_id, display_name, biography, channel_slug, created_at) VALUES (?, ?, ?, ?, ?, ?)", newId(), userId, person.display_name, person.biography || "", `${person.username}-channel`, stamp);
  }
}

export function revokeRole(actor: SessionUser, userId: string, roleName: string): void {
  ensureReady();
  requirePermission(actor.id, "users.manage");
  if (roleName === "administrator") throw new AppError(400, "Administrator access is changed outside this form");
  const role = get<{ id: string }>("SELECT id FROM roles WHERE name = ?", roleName);
  if (!role) throw new AppError(404, "Role not found");
  run("DELETE FROM user_roles WHERE user_id = ? AND role_id = ?", userId, role.id);
  audit(actor.id, "role.revoke", "user", userId, { roleName });
}

export function setUserStatus(actor: SessionUser, userId: string, status: "active" | "suspended"): void {
  ensureReady();
  requirePermission(actor.id, "users.suspend");
  if (actor.id === userId) throw new AppError(400, "You cannot change your own suspension");
  run("UPDATE users SET status = ?, updated_at = ? WHERE id = ? AND status != 'deleted'", status, new Date().toISOString(), userId);
  if (status === "suspended") run("DELETE FROM sessions WHERE user_id = ?", userId);
  audit(actor.id, `user.${status}`, "user", userId);
}

export function can(user: SessionUser | null, permission: string): boolean {
  if (!user) return false;
  return hasPermission(user.id, permission);
}

export function listPublicProfile(username: string): { user: SessionUser; posts: Array<{ id: string; body: string; created_at: string }> } | null {
  ensureReady();
  const row = get<{ user_id: string; visibility: string }>("SELECT user_id, visibility FROM profiles WHERE username = ?", username);
  if (!row || row.visibility !== "public") return null;
  const user = loadUser(row.user_id);
  if (!user || user.status !== "active") return null;
  const posts = all<{ id: string; body: string; created_at: string }>(
    "SELECT id, body, created_at FROM community_posts WHERE author_id = ? AND status = 'published' AND deleted_at IS NULL AND visibility = 'public' ORDER BY created_at DESC LIMIT 20",
    user.id,
  );
  return { user, posts };
}
