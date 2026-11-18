import { NextResponse, type NextRequest } from "next/server";
import { randomToken } from "@/server/crypto";
import { googleConfigured, googleStartUrl } from "@/server/google";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const locale = request.nextUrl.searchParams.get("locale") || "en";
  const safe = locale === "af" || locale === "tn" ? locale : "en";
  if (!googleConfigured()) {
    return NextResponse.redirect(new URL(`/${safe}/auth/sign-in?error=${encodeURIComponent("Google sign-in is not configured")}`, request.url));
  }
  const state = randomToken(18);
  const response = NextResponse.redirect(googleStartUrl(safe, state));
  response.cookies.set("rt_google_state", state, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 600 });
  return response;
}
