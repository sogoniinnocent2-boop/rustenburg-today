export function nowIso(): string {
  return new Date().toISOString();
}

export function slugify(input: string): string {
  const slug = input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
  return slug || "item";
}

export function readingMinutes(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

export function randsToCents(value: string): number {
  const cleaned = value.trim().replace(/^R/i, "").replace(/\s/g, "").replace(/,/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) {
    throw new Error("Enter an amount in rands, such as 199.95");
  }
  const [major, minor = ""] = cleaned.split(".");
  const cents = Number(major) * 100 + Number(minor.padEnd(2, "0").slice(0, 2));
  if (!Number.isSafeInteger(cents) || cents > 100_000_000_00) {
    throw new Error("Amount is too large");
  }
  return cents;
}

export function formatMoney(cents: number | null | undefined, currency = "ZAR"): string {
  if (cents === null || cents === undefined) return "—";
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(Math.trunc(cents));
  const major = Math.floor(abs / 100).toLocaleString("en-ZA");
  const minor = String(abs % 100).padStart(2, "0");
  return currency === "ZAR" ? `${sign}R${major}.${minor}` : `${sign}${currency} ${major}.${minor}`;
}

export function formatWhen(iso: string | null | undefined, locale: string): string {
  if (!iso) return "";
  const loc = locale === "af" ? "af-ZA" : locale === "tn" ? "en-ZA" : "en-ZA";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(loc, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export function ageFromDob(dob: string, today = new Date()): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) return null;
  const [year, month, day] = dob.split("-").map(Number);
  if (!year || !month || !day) return null;
  let age = today.getUTCFullYear() - year;
  const nowMonth = today.getUTCMonth() + 1;
  if (nowMonth < month || (nowMonth === month && today.getUTCDate() < day)) age -= 1;
  return age;
}

export function containsSensitiveIdentity(text: string): boolean {
  return /\b\d{13}\b/.test(text);
}

export function excerpt(text: string, length = 180): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= length) return flat;
  return `${flat.slice(0, length - 1).trimEnd()}…`;
}

export function safeExternalUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function videoEmbed(provider: string, providerId: string): string | null {
  if (provider === "youtube" && /^[A-Za-z0-9_-]{6,20}$/.test(providerId)) {
    return `https://www.youtube-nocookie.com/embed/${providerId}`;
  }
  if (provider === "vimeo" && /^\d{6,12}$/.test(providerId)) {
    return `https://player.vimeo.com/video/${providerId}`;
  }
  if (provider === "mux" && /^[A-Za-z0-9]{10,80}$/.test(providerId)) {
    return `https://player.mux.com/${providerId}`;
  }
  return null;
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    let previous = i - 1;
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const current = row[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + cost);
      previous = current;
    }
  }
  return row[b.length];
}

export function paragraphs(text: string): string[] {
  return text
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function clampPage(value: string | number | undefined, fallback = 1): number {
  const page = Number(value);
  if (!Number.isFinite(page) || page < 1) return fallback;
  return Math.min(500, Math.floor(page));
}

export function pageWindow(page: number, pageSize = 12): { limit: number; offset: number; page: number; pageSize: number } {
  const size = Math.min(48, Math.max(1, pageSize));
  const current = clampPage(page);
  return { limit: size, offset: (current - 1) * size, page: current, pageSize: size };
}
