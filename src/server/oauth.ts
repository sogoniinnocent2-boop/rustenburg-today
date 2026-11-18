import { ageFromDob } from "@/lib/text";
import { DEFAULT_ROLE_NAMES } from "./access";
import { loadUser, type SessionUser } from "./auth";
import { randomToken, sha256, signValue } from "./crypto";
import { get, newId, run, transaction } from "./db";
import { AppError } from "./errors";
import { ensureReady } from "./init";
import { grantRole } from "./permissions";
import { audit } from "./store";

export type OAuthProvider = "google" | "apple" | "facebook";

export type OAuthProfile = {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string;
};

export function acceptOAuthProfile(provider: OAuthProvider, profile: OAuthProfile, locale: string, meta?: { ip?: string; userAgent?: string }): { cookie: string; next: "home" | "profile" } {
  ensureReady();
  if (!profile.emailVerified) throw new AppError(400, "The provider has not verified this email");
  const email = profile.email.toLowerCase();
  const existing = get<{ user_id: string }>("SELECT user_id FROM oauth_identities WHERE provider = ? AND subject = ?", provider, profile.sub);
  if (existing) {
    const user = loadUser(existing.user_id);
    if (!user || user.status === "deleted" || user.status === "suspended") throw new AppError(403, "This account cannot sign in");
    return { cookie: openSession(existing.user_id, meta), next: user.status === "pending" ? "profile" : "home" };
  }
  const byEmail = get<{ id: string; status: string }>("SELECT id, status FROM users WHERE email = ?", email);
  if (byEmail) {
    if (byEmail.status === "deleted" || byEmail.status === "suspended") throw new AppError(403, "This account cannot sign in");
    run(
      "INSERT INTO oauth_identities (id, provider, subject, user_id, email, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      newId(),
      provider,
      profile.sub,
      byEmail.id,
      email,
      new Date().toISOString(),
    );
    audit(byEmail.id, `account.${provider}.link`, "user", byEmail.id);
    return { cookie: openSession(byEmail.id, meta), next: byEmail.status === "pending" ? "profile" : "home" };
  }
  const userId = newId();
  const stamp = new Date().toISOString();
  const language = locale === "af" || locale === "tn" ? locale : "en";
  transaction(() => {
    run(
      "INSERT INTO users (id, auth_user_id, email, password_hash, email_verified_at, status, is_minor, created_at, updated_at) VALUES (?, ?, ?, NULL, ?, 'pending', 0, ?, ?)",
      userId,
      userId,
      email,
      stamp,
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
    run("INSERT INTO oauth_identities (id, provider, subject, user_id, email, created_at) VALUES (?, ?, ?, ?, ?, ?)", newId(), provider, profile.sub, userId, email, stamp);
    for (const role of DEFAULT_ROLE_NAMES) grantRole(userId, role);
  });
  audit(userId, `account.${provider}.create`, "user", userId);
  return { cookie: openSession(userId, meta), next: "profile" };
}

export function completeOAuthProfile(user: SessionUser, dateOfBirth: string, acceptedTerms: boolean, guardianConsent: boolean): void {
  ensureReady();
  if (!get("SELECT id FROM oauth_identities WHERE user_id = ?", user.id)) throw new AppError(400, "This account is not waiting for sign-in setup");
  if (!acceptedTerms) throw new AppError(400, "Accept the terms to create an account");
  const age = ageFromDob(dateOfBirth);
  if (age === null || age > 120) throw new AppError(400, "Enter a real date of birth");
  if (age < 13) throw new AppError(400, "Accounts are not available under 13");
  if (age < 18 && !guardianConsent) throw new AppError(400, "A parent or guardian must consent");
  const stamp = new Date().toISOString();
  transaction(() => {
    run("UPDATE profiles SET date_of_birth = ?, guardian_consent_at = ?, updated_at = ? WHERE user_id = ?", dateOfBirth, age < 18 ? stamp : null, stamp, user.id);
    run("UPDATE users SET status = 'active', is_minor = ?, updated_at = ? WHERE id = ?", age < 18 ? 1 : 0, stamp, user.id);
    run("INSERT INTO consent_records (id, user_id, consent_type, version, granted, created_at) VALUES (?, ?, 'terms', '1.0', 1, ?)", newId(), user.id, stamp);
    if (age < 18) run("INSERT INTO consent_records (id, user_id, consent_type, version, granted, created_at) VALUES (?, ?, 'guardian', '1.0', 1, ?)", newId(), user.id, stamp);
  });
  audit(user.id, "account.oauth.profile", "user", user.id);
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
