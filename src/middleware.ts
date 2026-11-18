import { NextResponse, type NextRequest } from "next/server";

const LOCALES = ["en", "tn", "af"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/api") || pathname.startsWith("/_next") || pathname.startsWith("/audio") || pathname.startsWith("/brand") || pathname.includes(".")) {
    return NextResponse.next();
  }
  const segment = pathname.split("/")[1] || "";
  if (!LOCALES.includes(segment)) {
    const preferred = request.cookies.get("rt_locale")?.value;
    const locale = preferred && LOCALES.includes(preferred) ? preferred : "en";
    const url = request.nextUrl.clone();
    url.pathname = `/${locale}${pathname === "/" ? "" : pathname}`;
    const response = NextResponse.redirect(url);
    response.cookies.set("rt_locale", locale, { path: "/", sameSite: "lax", maxAge: 31536000 });
    return response;
  }
  const headers = new Headers(request.headers);
  headers.set("x-rt-locale", segment);
  headers.set("x-rt-path", pathname);
  const response = NextResponse.next({ request: { headers } });
  response.cookies.set("rt_locale", segment, { path: "/", sameSite: "lax", maxAge: 31536000 });
  return response;
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
