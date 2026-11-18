import type { SessionUser } from "./auth";
import { AppError } from "./errors";
import { acceptOAuthProfile, completeOAuthProfile, type OAuthProfile } from "./oauth";

export function googleConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function googleStartUrl(locale: string, state: string): string {
  const id = process.env.GOOGLE_CLIENT_ID;
  if (!id || !process.env.GOOGLE_CLIENT_SECRET) throw new AppError(503, "Google sign-in is not configured");
  const redirect = googleRedirectUri();
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", id);
  url.searchParams.set("redirect_uri", redirect);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", `${locale}.${state}`);
  url.searchParams.set("prompt", "select_account");
  return url.toString();
}

export function googleRedirectUri(): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  return `${base.replace(/\/$/, "")}/api/auth/google/callback`;
}

type GoogleProfile = { sub: string; email: string; email_verified: boolean; name: string };

export async function exchangeGoogleCode(code: string): Promise<GoogleProfile> {
  if (!googleConfigured()) throw new AppError(503, "Google sign-in is not configured");
  const body = new URLSearchParams({
    code,
    client_id: process.env.GOOGLE_CLIENT_ID || "",
    client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
    redirect_uri: googleRedirectUri(),
    grant_type: "authorization_code",
  });
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!tokenResponse.ok) throw new AppError(400, "Google did not accept this sign-in");
  const token = (await tokenResponse.json()) as { access_token?: string };
  if (!token.access_token) throw new AppError(400, "Google did not accept this sign-in");
  const profileResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${token.access_token}` },
  });
  if (!profileResponse.ok) throw new AppError(400, "Google did not return an account");
  const profile = (await profileResponse.json()) as Partial<GoogleProfile>;
  if (!profile.sub || !profile.email) throw new AppError(400, "Google did not return an email");
  return { sub: profile.sub, email: profile.email.toLowerCase(), email_verified: Boolean(profile.email_verified), name: profile.name || "Rustenburg resident" };
}

export function acceptGoogleProfile(profile: GoogleProfile, locale: string, meta?: { ip?: string; userAgent?: string }): { cookie: string; next: "home" | "profile" } {
  const shared: OAuthProfile = { sub: profile.sub, email: profile.email, emailVerified: profile.email_verified, name: profile.name };
  return acceptOAuthProfile("google", shared, locale, meta);
}

export function completeGoogleProfile(user: SessionUser, dateOfBirth: string, acceptedTerms: boolean, guardianConsent: boolean): void {
  completeOAuthProfile(user, dateOfBirth, acceptedTerms, guardianConsent);
}
