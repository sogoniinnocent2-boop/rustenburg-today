import { ageFromDob } from "@/lib/text";
import { DEFAULT_ROLE_NAMES } from "./access";
import { assertActive, loadUser, type SessionUser } from "./auth";
import { randomToken, readSignedValue, sha256, signValue, verifyPassword } from "./crypto";
import { all, get, newId, run, transaction } from "./db";
import { AppError } from "./errors";
import { ensureReady } from "./init";
import { grantRole } from "./permissions";
import { audit, rateLimit } from "./store";

export type OAuthProvider = "google" | "apple" | "facebook";

export type OAuthProfile = {
  sub: string;
  email: string | null;
  emailVerified: boolean;
  name: string;
};

export function acceptOAuthProfile(
  provider: OAuthProvider,
  profile: OAuthProfile,
  locale: string,
  meta?: { ip?: string; userAgent?: string },
): { cookie: string; next: "home" | "profile" } {
  ensureReady();
  rateLimit(`oauth:${provider}:${meta?.ip || "local"}`, 30, 60 * 60 * 1000);

  const existing = get<{ user_id: string }>("SELECT user_id FROM oauth_identities WHERE provider = ? AND subject = ?", provider, profile.sub);
  if (existing) {
    const user = loadUser(existing.user_id);
    if (!user || user.status === "deleted" || user.status === "suspended") throw new AppError(403, "This account cannot sign in");
    run("UPDATE oauth_identities SET email = COALESCE(?, email) WHERE provider = ? AND subject = ?", profile.email, provider, profile.sub);
    return { cookie: openSession(existing.user_id, meta), next: user.status === "pending" ? "profile" : "home" };
  }

  if (profile.email) {
    if (!profile.emailVerified) throw new AppError(400, "The provider has not verified this email");
    const byEmail = get<{ id: string; status: string }>("SELECT id, status FROM users WHERE email = ?", profile.email.toLowerCase());
    if (byEmail) {
      // Do not silently merge accounts. The person must sign in and link from Account settings.
      throw new AppError(
        409,
        "An account already uses this email. Sign in with your password, then link this provider from Account → Security.",
      );
    }
  }

  const userId = newId();
  const stamp = new Date().toISOString();
  const language = locale === "af" || locale === "tn" ? locale : "en";
  const email = profile.email?.toLowerCase() || placeholderEmail(provider, profile.sub);
  transaction(() => {
    run(
      "INSERT INTO users (id, auth_user_id, email, password_hash, email_verified_at, status, is_minor, created_at, updated_at) VALUES (?, ?, ?, NULL, ?, 'pending', 0, ?, ?)",
      userId,
      userId,
      email,
      profile.email && profile.emailVerified ? stamp : null,
      stamp,
      stamp,
    );
    run(
      "INSERT INTO profiles (id, user_id, display_name, username, preferred_language, visibility, biography, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'public', '', ?, ?)",
      newId(),
      userId,
      profile.name.slice(0, 60),
      oauthUsername(profile.name),
      language,
      stamp,
      stamp,
    );
    run("INSERT INTO user_preferences (user_id, theme, language, notification_settings, privacy_settings) VALUES (?, 'light', ?, '{}', '{}')", userId, language);
    run("INSERT INTO rewards_accounts (user_id, balance, updated_at) VALUES (?, 0, ?)", userId, stamp);
    run(
      "INSERT INTO oauth_identities (id, provider, subject, user_id, email, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      newId(),
      provider,
      profile.sub,
      userId,
      email,
      stamp,
    );
    for (const role of DEFAULT_ROLE_NAMES) grantRole(userId, role);
  });
  audit(userId, `account.${provider}.create`, "user", userId);
  return { cookie: openSession(userId, meta), next: "profile" };
}

/** After password confirmation, return a short-lived ticket used by the OAuth callback to finish linking. */
export function beginOAuthLink(user: SessionUser, password: string, provider: OAuthProvider): string {
  ensureReady();
  assertActive(user);
  rateLimit(`oauth-link:${user.id}`, 10, 60 * 60 * 1000);
  if (provider !== "google" && provider !== "facebook") throw new AppError(400, "That provider cannot be linked here");
  const row = get<{ password_hash: string | null }>("SELECT password_hash FROM users WHERE id = ?", user.id);
  if (!row?.password_hash || !verifyPassword(password, row.password_hash)) throw new AppError(403, "Confirm your password to link this sign-in");
  if (get("SELECT 1 as ok FROM oauth_identities WHERE provider = ? AND user_id = ?", provider, user.id)) {
    throw new AppError(409, "This account already has that provider linked");
  }
  const expires = Date.now() + 10 * 60 * 1000;
  return signValue(`${user.id}|${provider}|${expires}`);
}

export function completeOAuthLink(ticket: string, provider: OAuthProvider, profile: OAuthProfile): void {
  ensureReady();
  const raw = readSignedValue(ticket);
  if (!raw) throw new AppError(400, "This link request expired. Confirm your password and try again.");
  const [userId, ticketProvider, expiresRaw] = raw.split("|");
  if (!userId || ticketProvider !== provider || Number(expiresRaw) < Date.now()) {
    throw new AppError(400, "This link request expired. Confirm your password and try again.");
  }
  const user = loadUser(userId);
  if (!user || user.status !== "active") throw new AppError(403, "This account cannot link a sign-in provider");
  if (get("SELECT 1 as ok FROM oauth_identities WHERE provider = ? AND subject = ?", provider, profile.sub)) {
    throw new AppError(409, "That provider account is already linked");
  }
  if (get("SELECT 1 as ok FROM oauth_identities WHERE provider = ? AND user_id = ?", provider, user.id)) {
    throw new AppError(409, "This account already has that provider linked");
  }
  run(
    "INSERT INTO oauth_identities (id, provider, subject, user_id, email, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    newId(),
    provider,
    profile.sub,
    user.id,
    profile.email || placeholderEmail(provider, profile.sub),
    new Date().toISOString(),
  );
  audit(user.id, `account.${provider}.link`, "user", user.id);
}

/** Link a social provider to the signed-in account after password confirmation (same-request flow). */
export function linkOAuthProvider(user: SessionUser, password: string, provider: OAuthProvider, profile: OAuthProfile): void {
  const ticket = beginOAuthLink(user, password, provider);
  completeOAuthLink(ticket, provider, profile);
}

export function unlinkOAuthProvider(user: SessionUser, provider: OAuthProvider): void {
  ensureReady();
  assertActive(user);
  const row = get<{ password_hash: string | null }>("SELECT password_hash FROM users WHERE id = ?", user.id);
  const links = get<{ count: number }>("SELECT COUNT(*) as count FROM oauth_identities WHERE user_id = ?", user.id)?.count || 0;
  if (!row?.password_hash && links <= 1) throw new AppError(400, "Set a password before unlinking your only sign-in method");
  run("DELETE FROM oauth_identities WHERE user_id = ? AND provider = ?", user.id, provider);
  audit(user.id, `account.${provider}.unlink`, "user", user.id);
}

export function listOAuthProviders(userId: string): OAuthProvider[] {
  ensureReady();
  return all<{ provider: OAuthProvider }>("SELECT provider FROM oauth_identities WHERE user_id = ? ORDER BY provider", userId).map((row) => row.provider);
}

export function needsOAuthEmail(email: string): boolean {
  return isPlaceholderEmail(email);
}

export function completeOAuthProfile(user: SessionUser, dateOfBirth: string, acceptedTerms: boolean, guardianConsent: boolean, email?: string): void {
  ensureReady();
  if (!get("SELECT id FROM oauth_identities WHERE user_id = ?", user.id)) throw new AppError(400, "This account is not waiting for sign-in setup");
  if (!acceptedTerms) throw new AppError(400, "Accept the terms to create an account");
  const age = ageFromDob(dateOfBirth);
  if (age === null || age > 120) throw new AppError(400, "Enter a real date of birth");
  if (age < 13) throw new AppError(400, "Accounts are not available under 13");
  if (age < 18 && !guardianConsent) throw new AppError(400, "A parent or guardian must consent");
  const stamp = new Date().toISOString();
  const current = get<{ email: string }>("SELECT email FROM users WHERE id = ?", user.id);
  let nextEmail = current?.email || "";
  if (isPlaceholderEmail(nextEmail)) {
    const cleaned = (email || "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned)) throw new AppError(400, "Enter your email address to finish registration");
    if (get("SELECT id FROM users WHERE email = ? AND id != ?", cleaned, user.id)) throw new AppError(409, "That email is already registered");
    nextEmail = cleaned;
  }
  transaction(() => {
    run("UPDATE users SET email = ?, email_verified_at = COALESCE(email_verified_at, ?), status = 'active', is_minor = ?, updated_at = ? WHERE id = ?", nextEmail, stamp, age < 18 ? 1 : 0, stamp, user.id);
    run("UPDATE profiles SET date_of_birth = ?, guardian_consent_at = ?, updated_at = ? WHERE user_id = ?", dateOfBirth, age < 18 ? stamp : null, stamp, user.id);
    run("INSERT INTO consent_records (id, user_id, consent_type, version, granted, created_at) VALUES (?, ?, 'terms', '1.0', 1, ?)", newId(), user.id, stamp);
    if (age < 18) run("INSERT INTO consent_records (id, user_id, consent_type, version, granted, created_at) VALUES (?, ?, 'guardian', '1.0', 1, ?)", newId(), user.id, stamp);
  });
  audit(user.id, "account.oauth.profile", "user", user.id);
}

function placeholderEmail(provider: OAuthProvider, sub: string): string {
  const safe = sub.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 48) || "user";
  return `${provider}.${safe}@oauth.pending.local`;
}

function isPlaceholderEmail(email: string): boolean {
  return email.endsWith("@oauth.pending.local");
}

function openSession(userId: string, meta?: { ip?: string; userAgent?: string }): string {
  const token = randomToken();
  run(
    "INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at, user_agent, ip_address) VALUES (?, ?, ?, ?, ?, ?, ?)",
    newId(),
    userId,
    sha256(token),
    new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString(),
    new Date().toISOString(),
    meta?.userAgent?.slice(0, 240) || null,
    meta?.ip || null,
  );
  return signValue(token);
}

function oauthUsername(name: string): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 16) || "resident";
  let candidate = base.length >= 3 ? base : `resident_${base}`;
  let n = 2;
  while (get("SELECT user_id FROM profiles WHERE username = ?", candidate)) candidate = `${base.slice(0, 14)}_${n++}`;
  return candidate.slice(0, 24);
}
