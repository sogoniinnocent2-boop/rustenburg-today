const EXTRA = new Set([
  "/tickets",
  "/community",
  "/community/new",
  "/property",
  "/property/new",
  "/events",
  "/events/new",
  "/jobs",
  "/jobs/new",
  "/marketplace",
  "/marketplace/new",
  "/news",
  "/news/new",
  "/news/official",
  "/business",
  "/business/new",
  "/learn",
  "/learn/new",
]);

const ALLOWED_QUERY = new Set(["subscribe=1", "notice=subscribed", "notice=unsubscribed"]);

function allowed(relative: string): boolean {
  if (relative === "/" || relative === "") return true;
  if (relative === "/admin" || /^\/admin\/[a-z0-9-]+$/.test(relative)) return true;
  if (relative === "/desk" || /^\/desk\/[a-z0-9-]+$/.test(relative)) return true;
  if (relative === "/department" || /^\/department\/[a-z0-9-]+$/.test(relative)) return true;
  if (relative === "/safetrack" || relative === "/safetrack/desk") return true;
  if (relative === "/account" || /^\/account\/[a-z]+$/.test(relative)) return true;
  if (EXTRA.has(relative)) return true;
  return /^\/[a-z0-9-]+\/new$/.test(relative);
}

export function safeReturn(locale: string, raw: string): string | null {
  if (!raw || /[\\]|\/\/|\.\./.test(raw) || !raw.startsWith("/")) return null;
  let path = raw;
  let query = "";
  const hash = path.indexOf("#");
  if (hash >= 0) path = path.slice(0, hash);
  const qIndex = path.indexOf("?");
  if (qIndex >= 0) {
    const q = path.slice(qIndex + 1);
    if (!ALLOWED_QUERY.has(q)) return null;
    query = `?${q}`;
    path = path.slice(0, qIndex);
  }
  const prefix = `/${locale}`;
  const relative = path === prefix || path.startsWith(`${prefix}/`) ? path.slice(prefix.length) || "/" : path;
  if (!relative.startsWith("/") || !allowed(relative === "" ? "/" : relative)) return null;
  const clean = relative === "/" ? "" : relative;
  return `${prefix}${clean}${query}`;
}
