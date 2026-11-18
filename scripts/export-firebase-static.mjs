import fs from "node:fs";
import path from "node:path";

const base = process.env.SNAPSHOT_ORIGIN || "http://127.0.0.1:3010";
const out = path.resolve("firebase-static");
const locales = ["en", "tn", "af"];
const sections = [
  "news", "community", "podcasts", "tv", "radio", "music", "talent", "marketplace", "jobs", "learn",
  "events", "business", "advertising", "property", "food", "sports", "youth", "support", "transport",
  "tourism", "health", "voice", "deals", "competitions", "history", "services", "agriculture", "faith",
  "family", "technology", "productivity", "notices", "creators", "map", "briefing", "ask",
];
const pages = [
  "", "/about", "/features", "/desks", "/story", "/history/rustenburg", "/play", "/tutors", "/planner",
  "/appointments", "/invoices", "/tools", "/languages", "/k53", "/study", "/network", "/tickets",
  "/watch", "/edition", "/saved", "/safetrack", "/safetrack/desk", "/media", "/books", "/plans",
  "/search", "/live", "/loyalty", "/account", "/auth/sign-in", "/auth/sign-up", "/legal/terms",
  "/legal/privacy", "/legal/guidelines",
];

const queue = [];
for (const locale of locales) {
  for (const page of pages) queue.push(`/${locale}${page}`);
  for (const slug of sections) queue.push(`/${locale}/${slug}`);
}

const seen = new Set();
const saved = [];
const failed = [];

function stripScripts(html) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<link\b[^>]*\bas="script"[^>]*>/gi, "");
}

function saveHtml(pathname, html) {
  const relative = pathname === "/" ? "index.html" : `${pathname.replace(/^\//, "")}/index.html`;
  const file = path.join(out, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, html);
  saved.push(pathname);
}

function enqueue(pathname) {
  if (!pathname.startsWith("/")) return;
  if (pathname.startsWith("/_next") || pathname.startsWith("/api") || pathname.includes(".")) return;
  const segment = pathname.split("/")[1];
  if (!locales.includes(segment)) return;
  if (seen.has(pathname) || queue.includes(pathname)) return;
  if (seen.size + queue.length > 800) return;
  queue.push(pathname);
}

async function fetchPage(pathname) {
  const response = await fetch(base + pathname, { redirect: "manual" });
  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get("location");
    if (location) enqueue(new URL(location, base).pathname);
    return;
  }
  const type = response.headers.get("content-type") || "";
  if (!type.includes("text/html")) {
    if (response.ok) {
      const file = path.join(out, pathname.replace(/^\//, ""));
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, Buffer.from(await response.arrayBuffer()));
    }
    return;
  }
  const html = stripScripts(await response.text());
  if (!response.ok) {
    if (response.status === 404 && pathname === "/en/not-a-real-page") {
      fs.writeFileSync(path.join(out, "404.html"), html);
    } else {
      failed.push(`${response.status} ${pathname}`);
    }
    return;
  }
  saveHtml(pathname, html);
  for (const match of html.matchAll(/\b(?:href|src)="([^"]+)"/g)) {
    const value = match[1];
    if (!value.startsWith("/") || value.startsWith("//")) continue;
    const clean = value.split("#")[0].split("?")[0];
    enqueue(clean);
  }
}

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

while (queue.length) {
  const batch = [];
  while (queue.length && batch.length < 6) {
    const pathname = queue.shift();
    if (seen.has(pathname)) continue;
    seen.add(pathname);
    batch.push(pathname);
  }
  await Promise.all(batch.map(async (pathname) => {
    try {
      await fetchPage(pathname);
    } catch (error) {
      failed.push(`error ${pathname} ${error.message}`);
    }
  }));
}

await fetchPage("/en/not-a-real-page");

fs.cpSync("public", out, { recursive: true });
const staticDir = path.join(".next-firebase", "static");
if (fs.existsSync(staticDir)) fs.cpSync(staticDir, path.join(out, "_next", "static"), { recursive: true });

console.log(JSON.stringify({ pages: saved.length, failed: failed.slice(0, 20), failedCount: failed.length }));
