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
  "/business",
  "/business/new",
  "/learn",
  "/learn/new",
]);

function allowed(relative: string): boolean {
  if (relative === "/admin" || /^\/admin\/[a-z0-9-]+$/.test(relative)) return true;
  if (relative === "/desk" || /^\/desk\/[a-z0-9-]+$/.test(relative)) return true;
  if (relative === "/safetrack" || relative === "/safetrack/desk") return true;
  if (relative === "/account" || /^\/account\/[a-z]+$/.test(relative)) return true;
  if (EXTRA.has(relative)) return true;
  return /^\/[a-z0-9-]+\/new$/.test(relative);
}

export function safeReturn(locale: string, raw: string): string | null {
  if (!raw || /[\\?#]|\/\/|\.\./.test(raw) || !raw.startsWith("/")) return null;
  const prefix = `/${locale}`;
  const relative = raw === prefix || raw.startsWith(`${prefix}/`) ? raw.slice(prefix.length) : raw;
  if (!relative.startsWith("/") || !allowed(relative)) return null;
  return `${prefix}${relative}`;
}
