import { readFileSync } from "node:fs";
import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { hmacHex } from "@/server/crypto";
import { userFromCookie } from "@/server/auth";
import { listNotifications } from "@/server/alerts";
import { briefingRss } from "@/server/engage";
import { eligiblePopup, markPopupShown, recordAdEvent } from "@/server/commerce";
import { ensureReady } from "@/server/init";
import { applyPaymentWebhook } from "@/server/payments";
import { searchPlatform, searchSuggest } from "@/server/search";
import { readUpload } from "@/server/uploads";
import { get } from "@/server/db";
import { AppError } from "@/server/errors";
import { latestPoint, mySafety, raiseSos, recordPoint, startSharing } from "@/server/safetrack";

export const runtime = "nodejs";

function json(data: unknown, status = 200) {
  return NextResponse.json({ ok: status < 400, data }, { status });
}

function fail(message: string, status: number) {
  return NextResponse.json({ ok: false, error: { message } }, { status });
}

const weatherWords: Record<number, string> = {
  0: "Clear", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast", 45: "Fog", 48: "Fog",
  51: "Light drizzle", 53: "Drizzle", 55: "Dense drizzle", 61: "Slight rain", 63: "Rain", 65: "Heavy rain",
  71: "Slight snow", 73: "Snow", 75: "Heavy snow", 80: "Rain showers", 81: "Rain showers", 82: "Violent rain showers",
  95: "Thunderstorm", 96: "Thunderstorm with hail", 99: "Thunderstorm with hail",
};

async function weatherReport(url: URL) {
  const lat = Number(url.searchParams.get("lat"));
  const lon = Number(url.searchParams.get("lon"));
  const name = (url.searchParams.get("name") || "Selected place").slice(0, 120);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return fail("That place has no coordinates", 400);
  const upstream = new URL("https://api.open-meteo.com/v1/forecast");
  upstream.searchParams.set("latitude", String(lat));
  upstream.searchParams.set("longitude", String(lon));
  upstream.searchParams.set("current", "temperature_2m,apparent_temperature,weather_code,wind_speed_10m");
  upstream.searchParams.set("hourly", "temperature_2m,precipitation_probability");
  upstream.searchParams.set("daily", "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max");
  upstream.searchParams.set("timezone", "Africa/Johannesburg");
  upstream.searchParams.set("forecast_days", "4");
  let payload: {
    current?: { temperature_2m?: number; apparent_temperature?: number; weather_code?: number; wind_speed_10m?: number };
    hourly?: { time?: string[]; temperature_2m?: number[]; precipitation_probability?: number[] };
    daily?: { time?: string[]; temperature_2m_max?: number[]; temperature_2m_min?: number[]; precipitation_probability_max?: number[] };
  };
  try {
    const response = await fetch(upstream, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) return fail("Weather is unavailable", 502);
    payload = await response.json();
  } catch {
    return fail("Weather is unavailable", 502);
  }
  const current = payload.current;
  if (typeof current?.temperature_2m !== "number") return fail("Weather is unavailable", 502);
  const now = Date.now();
  const hourIndex = (payload.hourly?.time || []).findIndex((time) => Date.parse(time) >= now - 30 * 60 * 1000);
  const hours = (payload.hourly?.time || []).flatMap((time, index) => {
    const temperature = payload.hourly?.temperature_2m?.[index];
    if (typeof temperature !== "number" || Date.parse(time) < now - 30 * 60 * 1000) return [];
    return [{ time: time.slice(11, 16), temperature }];
  }).slice(0, 6);
  const days = (payload.daily?.time || []).flatMap((time, index) => {
    const high = payload.daily?.temperature_2m_max?.[index];
    const low = payload.daily?.temperature_2m_min?.[index];
    if (typeof high !== "number" || typeof low !== "number") return [];
    return [{ day: time.slice(5), high, low }];
  });
  return NextResponse.json({
    ok: true,
    data: {
      place: name,
      temperature: current.temperature_2m,
      feelsLike: typeof current.apparent_temperature === "number" ? current.apparent_temperature : null,
      condition: weatherWords[current.weather_code ?? -1] || "Conditions from the forecast",
      wind: typeof current.wind_speed_10m === "number" ? current.wind_speed_10m : null,
      high: typeof payload.daily?.temperature_2m_max?.[0] === "number" ? payload.daily.temperature_2m_max[0] : null,
      low: typeof payload.daily?.temperature_2m_min?.[0] === "number" ? payload.daily.temperature_2m_min[0] : null,
      rain: hourIndex >= 0 && typeof payload.hourly?.precipitation_probability?.[hourIndex] === "number" ? payload.hourly.precipitation_probability[hourIndex] : null,
      hours,
      days,
      fetchedAt: new Date().toISOString(),
      source: "Open-Meteo",
    },
  }, { headers: { "Cache-Control": "public, max-age=600" } });
}

function originAllowed(request: Request): boolean {
  if (request.method === "GET" || request.method === "HEAD") return true;
  const url = new URL(request.url);
  if (url.pathname === "/api/v1/payments/webhook") return true;
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (!origin || !host) return false;
  return new URL(origin).host === host;
}

export async function GET(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  ensureReady();
  const url = new URL(request.url);
  const key = path.join("/");
  if (key === "briefing.xml") {
    const origin = `${url.protocol}//${url.host}`;
    return new NextResponse(briefingRss(origin), { headers: { "Content-Type": "application/rss+xml; charset=utf-8", "Cache-Control": "public, max-age=300" } });
  }
  if (key === "weather") return weatherReport(url);
  if (key === "health") {
    const users = get<{ count: number }>("SELECT COUNT(*) as count FROM users");
    return json({ service: "rustenburg-today", database: "ok", users: users?.count ?? 0 });
  }
  if (key === "search/suggest") return json(searchSuggest(url.searchParams.get("q") || ""));
  if (key === "search") {
    const result = searchPlatform(url.searchParams.get("q") || "", { locale: url.searchParams.get("locale") || "en", page: Number(url.searchParams.get("page") || 1) });
    return json(result);
  }
  if (key === "notifications") {
    const user = userFromCookie(cookieOf(request));
    if (!user) return fail("Sign in required", 401);
    return json(listNotifications(user.id));
  }
  if (path[0] === "media" && path[1]) {
    const file = readUpload(path[1]);
    if (!file || file.public !== 1) return fail("File not found", 404);
    const bytes = readFileSync(file.absolute);
    return new NextResponse(bytes, { headers: { "Content-Type": file.mime, "Cache-Control": "public, max-age=3600", "X-Content-Type-Options": "nosniff" } });
  }
  if (path[0] === "ads" && path[1] === "popup" && !path[2]) {
    const viewer = ensureViewer(request);
    const consent = url.searchParams.get("consent") === "yes";
    const campaign = eligiblePopup(viewer.key, consent);
    const response = json({ campaign });
    if (viewer.fresh) response.cookies.set("rt_viewer", viewer.key, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 31536000 });
    return response;
  }
  if (path[0] === "ads" && path[2] === "click") {
    try {
      const viewer = ensureViewer(request);
      const result = recordAdEvent(path[1], "click", { viewerKey: viewer.key });
      if (!result.destination) return fail("This campaign has no destination", 404);
      const response = NextResponse.redirect(result.destination);
      if (viewer.fresh) response.cookies.set("rt_viewer", viewer.key, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 31536000 });
      return response;
    } catch (error) {
      return fail(error instanceof Error ? error.message : "Not found", 404);
    }
  }
  if (path[0] === "safetrack") {
    const user = userFromCookie(cookieOf(request));
    if (!user) return fail("Sign in required", 401);
    try {
      if (path[1] === "me") {
        const safety = mySafety(user);
        return json({ households: safety.households, grants: safety.grants.map((item) => ({ id: item.id, person: item.display_name, permission: item.permission, status: item.status })), contacts: safety.contacts.map((item) => ({ person: item.display_name })) });
      }
      if (path[1] === "location" && path[2]) return json(latestPoint(user, path[2]));
    } catch (error) {
      const status = error instanceof AppError ? error.status : 400;
      return fail(error instanceof Error ? error.message : "Request failed", status);
    }
    return fail("Not found", 404);
  }
  return fail("Not found", 404);
}

export async function POST(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  if (!originAllowed(request)) return fail("Cross-origin request blocked", 403);
  ensureReady();
  const key = path.join("/");
  if (key === "payments/webhook") {
    const body = await request.text();
    try {
      const result = applyPaymentWebhook(body, request.headers.get("x-payment-signature"));
      return json(result);
    } catch (error) {
      const status = typeof error === "object" && error && "status" in error ? Number((error as { status: number }).status) : 400;
      return fail(error instanceof Error ? error.message : "Payment rejected", status);
    }
  }
  if (key === "orders/pay" || key.endsWith("/pay")) return fail("Payments are confirmed only by the payment provider", 403);
  if (path[0] === "ads" && path[2] === "impression") {
    try {
      const body = await request.json().catch(() => ({} as { viewable?: boolean }));
      const viewer = ensureViewer(request);
      const result = recordAdEvent(path[1], "impression", { viewerKey: viewer.key, viewable: body.viewable === true });
      const response = json(result);
      if (viewer.fresh) response.cookies.set("rt_viewer", viewer.key, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 31536000 });
      return response;
    } catch (error) {
      return fail(error instanceof Error ? error.message : "Not found", 404);
    }
  }
  if (path[0] === "ads" && path[1] === "popup" && path[2] === "shown") {
    const body = await request.json().catch(() => ({} as { id?: string }));
    const viewer = ensureViewer(request);
    if (body.id) markPopupShown(body.id, viewer.key);
    const response = json({ saved: true });
    if (viewer.fresh) response.cookies.set("rt_viewer", viewer.key, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 31536000 });
    return response;
  }
  if (path[0] === "safetrack") {
    const user = userFromCookie(cookieOf(request));
    if (!user) return fail("Sign in required", 401);
    const body = await request.json().catch(() => ({} as Record<string, unknown>));
    try {
      if (path[1] === "sos") {
        const result = raiseSos(user, String(body.idempotencyKey || ""), typeof body.note === "string" ? body.note : undefined);
        return json({ ...result, emergencyServicesContacted: false });
      }
      if (path[1] === "location" && path[2] === "session") return json({ sessionId: startSharing(user) });
      if (path[1] === "location" && path[2] === "point") {
        return json({
          id: recordPoint(user, String(body.sessionId || ""), {
            latitude: Number(body.latitude),
            longitude: Number(body.longitude),
            accuracyM: Number(body.accuracyM),
            capturedAt: String(body.capturedAt || ""),
          }),
        });
      }
    } catch (error) {
      const status = error instanceof AppError ? error.status : 400;
      return fail(error instanceof Error ? error.message : "Request failed", status);
    }
    return fail("Not found", 404);
  }
  return fail("Not found", 404);
}

function cookieOf(request: Request): string | null {
  const raw = request.headers.get("cookie") || "";
  const match = raw.split(";").map((part) => part.trim()).find((part) => part.startsWith("rt_session="));
  return match ? decodeURIComponent(match.slice("rt_session=".length)) : null;
}

function ensureViewer(request: Request): { key: string; fresh: boolean } {
  const raw = request.headers.get("cookie") || "";
  const match = raw.split(";").map((part) => part.trim()).find((part) => part.startsWith("rt_viewer="));
  if (match) return { key: decodeURIComponent(match.slice("rt_viewer=".length)).slice(0, 80), fresh: false };
  return { key: crypto.randomUUID(), fresh: true };
}

void timingSafeEqual;
void hmacHex;
