/** Live public launch smoke checks — no secrets. */
import fs from "node:fs";
import path from "node:path";

const BASE = (process.argv[2] || "https://www.rustenburgtoday.co.za").replace(/\/$/, "");
const OUT = path.resolve("evidence/public-launch/smoke.json");

const routes = [
  "/en",
  "/en/news",
  "/en/news/official",
  "/en/marketplace",
  "/en/events",
  "/en/jobs",
  "/en/learn",
  "/en/business",
  "/en/property",
  "/en/community",
  "/en/auth/sign-in",
  "/en/auth/sign-up",
  "/en/auth/forgot",
  "/en/department",
  "/en/admin",
  "/en/account",
  "/robots.txt",
  "/sitemap.xml",
  "/api/v1/health",
];

const results = [];
for (const route of routes) {
  const res = await fetch(`${BASE}${route}`, { redirect: "manual" });
  const text = await res.text();
  const lower = text.toLowerCase();
  results.push({
    route,
    status: res.status,
    location: res.headers.get("location") || "",
    demoLeak: /demonstration tone|how-the-digital-city-works/i.test(text),
    stackTrace: /at Object\.|TypeError:|Prisma|sqlite error/i.test(text),
    paymentsHonesty: route.includes("marketplace") ? /checkout is not active|payments stay disabled|payment provider/i.test(text) : null,
    oauthHonesty: route.includes("sign-in") || route.includes("sign-up")
      ? /not configured|missing|Google|Facebook/i.test(text)
      : null,
    emptyOfficial: route.includes("official") || route === "/en" ? /no official|empty|latest official/i.test(lower) : null,
  });
}

const search = await fetch(`${BASE}/api/v1/search?q=rustenburg`);
const searchJson = await search.json().catch(() => null);

const report = {
  base: BASE,
  checkedAt: new Date().toISOString(),
  results,
  searchOk: search.status === 200 && searchJson?.ok !== false,
  failures: results.filter((r) => r.status >= 500 || r.demoLeak || r.stackTrace),
};
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log(JSON.stringify({
  routes: results.length,
  serverErrors: results.filter((r) => r.status >= 500).length,
  demoLeaks: results.filter((r) => r.demoLeak).length,
  marketplaceHonesty: results.find((r) => r.route.includes("marketplace"))?.paymentsHonesty,
  robots: results.find((r) => r.route === "/robots.txt")?.status,
  sitemap: results.find((r) => r.route === "/sitemap.xml")?.status,
  searchOk: report.searchOk,
  authRedirects: results.filter((r) => ["/en/admin", "/en/account"].includes(r.route)).map((r) => ({ route: r.route, status: r.status, location: r.location })),
}, null, 2));
