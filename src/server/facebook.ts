import { AppError } from "./errors";

export function facebookConfigured(): boolean {
  return Boolean(process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_SECRET);
}

export function facebookRedirectUri(): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  return `${base.replace(/\/$/, "")}/api/auth/facebook/callback`;
}

export function facebookStartUrl(locale: string, state: string): string {
  if (!facebookConfigured()) throw new AppError(503, "Facebook sign-in is not configured");
  const url = new URL("https://www.facebook.com/v19.0/dialog/oauth");
  url.searchParams.set("client_id", process.env.FACEBOOK_APP_ID || "");
  url.searchParams.set("redirect_uri", facebookRedirectUri());
  url.searchParams.set("state", `${locale}.${state}`);
  url.searchParams.set("scope", "email,public_profile");
  url.searchParams.set("response_type", "code");
  return url.toString();
}

export async function exchangeFacebookCode(code: string): Promise<{ sub: string; email: string; emailVerified: boolean; name: string }> {
  if (!facebookConfigured()) throw new AppError(503, "Facebook sign-in is not configured");
  const tokenUrl = new URL("https://graph.facebook.com/v19.0/oauth/access_token");
  tokenUrl.searchParams.set("client_id", process.env.FACEBOOK_APP_ID || "");
  tokenUrl.searchParams.set("client_secret", process.env.FACEBOOK_APP_SECRET || "");
  tokenUrl.searchParams.set("redirect_uri", facebookRedirectUri());
  tokenUrl.searchParams.set("code", code);
  const tokenResponse = await fetch(tokenUrl);
  if (!tokenResponse.ok) throw new AppError(400, "Facebook did not accept this sign-in");
  const token = (await tokenResponse.json()) as { access_token?: string };
  if (!token.access_token) throw new AppError(400, "Facebook did not accept this sign-in");
  const profileUrl = new URL("https://graph.facebook.com/me");
  profileUrl.searchParams.set("fields", "id,name,email");
  profileUrl.searchParams.set("access_token", token.access_token);
  const profileResponse = await fetch(profileUrl);
  if (!profileResponse.ok) throw new AppError(400, "Facebook did not return an account");
  const profile = (await profileResponse.json()) as { id?: string; name?: string; email?: string };
  if (!profile.id || !profile.email) throw new AppError(400, "Facebook did not return an email");
  return { sub: profile.id, email: profile.email.toLowerCase(), emailVerified: true, name: profile.name || "Rustenburg resident" };
}
