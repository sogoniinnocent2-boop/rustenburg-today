import { NextResponse, type NextRequest } from "next/server";
import { acceptGoogleProfile, exchangeGoogleCode } from "@/server/google";
import { ensureReady } from "@/server/init";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  ensureReady();
  const url = new URL(request.url);
  const state = url.searchParams.get("state") || "";
  const [localePart, nonce] = state.split(".");
  const locale = localePart === "af" || localePart === "tn" ? localePart : "en";
  const back = (message: string) => NextResponse.redirect(new URL(`/${locale}/auth/sign-in?error=${encodeURIComponent(message)}`, request.url));
  if (url.searchParams.get("error")) return back("Google sign-in was cancelled");
  const expected = request.cookies.get("rt_google_state")?.value;
  if (!nonce || !expected || nonce !== expected) return back("This Google sign-in expired. Start again.");
  const code = url.searchParams.get("code");
  if (!code) return back("Google did not return a sign-in code");
  try {
    const profile = await exchangeGoogleCode(code);
    const result = acceptGoogleProfile(profile, locale, { ip: request.headers.get("x-forwarded-for") || undefined, userAgent: request.headers.get("user-agent") || undefined });
    const next = result.next === "profile" ? `/${locale}/auth/google-profile` : `/${locale}`;
    const response = NextResponse.redirect(new URL(next, request.url));
    response.cookies.set("rt_session", result.cookie, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 14 * 24 * 60 * 60 });
    response.cookies.set("rt_google_state", "", { path: "/", maxAge: 0 });
    return response;
  } catch (error) {
    return back(error instanceof Error ? error.message : "Google sign-in failed");
  }
}
