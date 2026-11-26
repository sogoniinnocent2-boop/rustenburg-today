import { NextResponse, type NextRequest } from "next/server";
import { exchangeFacebookCode } from "@/server/facebook";
import { ensureReady } from "@/server/init";
import { acceptOAuthProfile, completeOAuthLink } from "@/server/oauth";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  ensureReady();
  const url = new URL(request.url);
  const state = url.searchParams.get("state") || "";
  const [localePart, nonce] = state.split(".");
  const locale = localePart === "af" || localePart === "tn" ? localePart : "en";
  const back = (message: string, path = `/auth/sign-in`) =>
    NextResponse.redirect(new URL(`/${locale}${path}?error=${encodeURIComponent(message)}`, request.url));
  if (url.searchParams.get("error")) return back("Facebook sign-in was cancelled");
  const expected = request.cookies.get("rt_facebook_state")?.value;
  if (!nonce || !expected || nonce !== expected) return back("This Facebook sign-in expired. Start again.");
  const code = url.searchParams.get("code");
  if (!code) return back("Facebook did not return a sign-in code");
  try {
    const profile = await exchangeFacebookCode(code);
    const linkTicket = request.cookies.get("rt_oauth_link")?.value;
    if (linkTicket) {
      completeOAuthLink(linkTicket, "facebook", profile);
      const response = NextResponse.redirect(
        new URL(`/${locale}/account/security?notice=${encodeURIComponent("Facebook linked")}`, request.url),
      );
      response.cookies.set("rt_facebook_state", "", { path: "/", maxAge: 0 });
      response.cookies.set("rt_oauth_link", "", { path: "/", maxAge: 0 });
      return response;
    }
    const result = acceptOAuthProfile("facebook", profile, locale, {
      ip: request.headers.get("x-forwarded-for") || undefined,
      userAgent: request.headers.get("user-agent") || undefined,
    });
    const next = result.next === "profile" ? `/${locale}/auth/google-profile` : `/${locale}`;
    const response = NextResponse.redirect(new URL(next, request.url));
    response.cookies.set("rt_session", result.cookie, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 14 * 24 * 60 * 60,
    });
    response.cookies.set("rt_facebook_state", "", { path: "/", maxAge: 0 });
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Facebook sign-in failed";
    const linkTicket = request.cookies.get("rt_oauth_link")?.value;
    return back(message, linkTicket ? "/account/security" : "/auth/sign-in");
  }
}
