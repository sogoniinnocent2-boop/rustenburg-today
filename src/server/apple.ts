import { createPrivateKey, createPublicKey, createSign, createVerify, type JsonWebKey } from "node:crypto";
import { AppError } from "./errors";

export function appleConfigured(): boolean {
  return Boolean(process.env.APPLE_CLIENT_ID && process.env.APPLE_TEAM_ID && process.env.APPLE_KEY_ID && process.env.APPLE_PRIVATE_KEY);
}

export function appleRedirectUri(): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  return `${base.replace(/\/$/, "")}/api/auth/apple/callback`;
}

export function appleStartUrl(locale: string, state: string): string {
  if (!appleConfigured()) throw new AppError(503, "Apple sign-in is not configured");
  const url = new URL("https://appleid.apple.com/auth/authorize");
  url.searchParams.set("client_id", process.env.APPLE_CLIENT_ID || "");
  url.searchParams.set("redirect_uri", appleRedirectUri());
  url.searchParams.set("response_type", "code");
  url.searchParams.set("response_mode", "form_post");
  url.searchParams.set("scope", "name email");
  url.searchParams.set("state", `${locale}.${state}`);
  return url.toString();
}

export function appleClientSecret(): string {
  const kid = process.env.APPLE_KEY_ID || "";
  const team = process.env.APPLE_TEAM_ID || "";
  const client = process.env.APPLE_CLIENT_ID || "";
  const pem = (process.env.APPLE_PRIVATE_KEY || "").replace(/\\n/g, "\n");
  if (!kid || !team || !client || !pem) throw new AppError(503, "Apple sign-in is not configured");
  const now = Math.floor(Date.now() / 1000);
  return signEs256Jwt({ alg: "ES256", kid }, { iss: team, iat: now, exp: now + 300, aud: "https://appleid.apple.com", sub: client }, pem);
}

export function signEs256Jwt(header: Record<string, unknown>, payload: Record<string, unknown>, pem: string): string {
  const encodedHeader = Buffer.from(JSON.stringify(header)).toString("base64url");
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signer = createSign("SHA256");
  signer.update(`${encodedHeader}.${encodedPayload}`);
  signer.end();
  const signature = signer.sign({ key: createPrivateKey(pem), dsaEncoding: "ieee-p1363" });
  return `${encodedHeader}.${encodedPayload}.${signature.toString("base64url")}`;
}

type AppleJwk = { kid?: string; kty?: string; crv?: string; x?: string; y?: string };

export function readAppleIdentity(token: string, keys: AppleJwk[], audience: string): { sub: string; email: string; emailVerified: boolean } {
  const parts = token.split(".");
  if (parts.length !== 3) throw new AppError(400, "Apple did not return a valid identity");
  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const header = JSON.parse(Buffer.from(encodedHeader, "base64url").toString("utf8")) as { alg?: string; kid?: string };
  if (header.alg !== "ES256" || !header.kid) throw new AppError(400, "Apple did not return a valid identity");
  const jwk = keys.find((key) => key.kid === header.kid);
  if (!jwk) throw new AppError(400, "Apple did not return a valid identity");
  const verifier = createVerify("SHA256");
  verifier.update(`${encodedHeader}.${encodedPayload}`);
  verifier.end();
  const valid = verifier.verify({ key: createPublicKey({ key: jwk as JsonWebKey, format: "jwk" }), dsaEncoding: "ieee-p1363" }, Buffer.from(encodedSignature, "base64url"));
  if (!valid) throw new AppError(400, "Apple did not return a valid identity");
  const claims = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as { iss?: string; aud?: string | string[]; exp?: number; sub?: string; email?: string; email_verified?: boolean | string };
  const audienceOk = Array.isArray(claims.aud) ? claims.aud.includes(audience) : claims.aud === audience;
  if (claims.iss !== "https://appleid.apple.com" || !audienceOk || !claims.exp || claims.exp * 1000 < Date.now()) throw new AppError(400, "Apple did not return a valid identity");
  if (!claims.sub || !claims.email) throw new AppError(400, "Apple did not return an email");
  const verified = claims.email_verified === true || claims.email_verified === "true";
  return { sub: claims.sub, email: claims.email.toLowerCase(), emailVerified: verified };
}

export async function exchangeAppleCode(code: string): Promise<{ sub: string; email: string; emailVerified: boolean }> {
  if (!appleConfigured()) throw new AppError(503, "Apple sign-in is not configured");
  const body = new URLSearchParams({
    client_id: process.env.APPLE_CLIENT_ID || "",
    client_secret: appleClientSecret(),
    code,
    grant_type: "authorization_code",
    redirect_uri: appleRedirectUri(),
  });
  const tokenResponse = await fetch("https://appleid.apple.com/auth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!tokenResponse.ok) throw new AppError(400, "Apple did not accept this sign-in");
  const token = (await tokenResponse.json()) as { id_token?: string };
  if (!token.id_token) throw new AppError(400, "Apple did not return an account");
  const keysResponse = await fetch("https://appleid.apple.com/auth/keys");
  if (!keysResponse.ok) throw new AppError(503, "Apple did not provide signing keys");
  const keys = (await keysResponse.json()) as { keys?: AppleJwk[] };
  return readAppleIdentity(token.id_token, keys.keys || [], process.env.APPLE_CLIENT_ID || "");
}
