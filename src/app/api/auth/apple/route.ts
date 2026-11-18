import { NextResponse, type NextRequest } from "next/server";
import { appleConfigured, appleStartUrl } from "@/server/apple";
import { randomToken } from "@/server/crypto";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const locale = request.nextUrl.searchParams.get("locale") || "en";
  const safe = locale === "af" || locale === "tn" ? locale : "en";
  if (!appleConfigured()) {
    return NextResponse.redirect(new URL(`/${safe}/auth/sign-in?error=${encodeURIComponent("Apple sign-in is not configured")}`, request.url));
  }
  const state = randomToken(18);
  const response = NextResponse.redirect(appleStartUrl(safe, state));
  response.cookies.set("rt_apple_state", state, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 600 });
  return response;
}
