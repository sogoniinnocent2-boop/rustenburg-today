import { NextResponse, type NextRequest } from "next/server";
import { exchangeAppleCode } from "@/server/apple";
import { ensureReady } from "@/server/init";
import { acceptOAuthProfile } from "@/server/oauth";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  ensureReady();
  const form = await request.formData();
  return finish(request, String(form.get("state") || ""), String(form.get("code") || ""), String(form.get("error") || ""), String(form.get("user") || ""));
}

export async function GET(request: NextRequest) {
  ensureReady();
  const url = new URL(request.url);
  return finish(request, url.searchParams.get("state") || "", url.searchParams.get("code") || "", url.searchParams.get("error") || "", "");
}

async function finish(request: NextRequest, state: string, code: string, error: string, userJson: string) {
  const [localePart, nonce] = state.split(".");
  const locale = localePart === "af" || localePart === "tn" ? localePart : "en";
  const back = (message: string) => NextResponse.redirect(new URL(`/${locale}/auth/sign-in?error=${encodeURIComponent(message)}`, request.url));
  if (error) return back("Apple sign-in was cancelled");
  const expected = request.cookies.get("rt_apple_state")?.value;
  if (!nonce || !expected || nonce !== expected) return back("This Apple sign-in expired. Start again.");
  if (!code) return back("Apple did not return a sign-in code");
  try {
    const identity = await exchangeAppleCode(code);
    const name = appleName(userJson) || "Rustenburg resident";
    const result = acceptOAuthProfile("apple", { sub: identity.sub, email: identity.email, emailVerified: identity.emailVerified, name }, locale, {
      ip: request.headers.get("x-forwarded-for") || undefined,
      userAgent: request.headers.get("user-agent") || undefined,
    });
    const next = result.next === "profile" ? `/${locale}/auth/google-profile` : `/${locale}`;
    const response = NextResponse.redirect(new URL(next, request.url));
    response.cookies.set("rt_session", result.cookie, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 14 * 24 * 60 * 60 });
    response.cookies.set("rt_apple_state", "", { path: "/", maxAge: 0 });
    return response;
  } catch (caught) {
    return back(caught instanceof Error ? caught.message : "Apple sign-in failed");
  }
}

function appleName(userJson: string): string {
  if (!userJson) return "";
  try {
    const parsed = JSON.parse(userJson) as { name?: { firstName?: string; lastName?: string } };
    return `${parsed.name?.firstName || ""} ${parsed.name?.lastName || ""}`.trim();
  } catch {
    return "";
  }
}
