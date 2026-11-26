/**
 * Editorial news categories for the reader-facing newsroom.
 * These map onto `article_categories` and wire `category_slug` / region fields.
 * They do NOT replace the platform's 12 divisions or 30+ department sections.
 */

export type EditorialCategory = {
  slug: string;
  name: string;
  summary: string;
  /** Matching article_categories.slug values */
  articleSlugs: string[];
  /** Matching news_items.category_slug values */
  wireSlugs: string[];
  /** Optional region filters for wires (lowercase) */
  wireRegions?: string[];
  /** When true, only include stories with verified local geography */
  localNorthwest?: boolean;
};

export const EDITORIAL_CATEGORIES: EditorialCategory[] = [
  {
    slug: "breaking",
    name: "Breaking News",
    summary: "Active breaking stories marked by editors.",
    articleSlugs: ["breaking-news"],
    wireSlugs: [],
  },
  {
    slug: "latest",
    name: "Latest News",
    summary: "Recently published stories across the newsroom.",
    articleSlugs: [],
    wireSlugs: [],
  },
  {
    slug: "politics",
    name: "Politics",
    summary: "Government, Parliament, parties and policy.",
    articleSlugs: ["politics", "municipal"],
    wireSlugs: ["government", "politics"],
  },
  {
    slug: "business",
    name: "Business & Economy",
    summary: "Markets, trade, industry and local enterprise.",
    articleSlugs: ["business-mining"],
    wireSlugs: ["business"],
    wireRegions: ["business"],
  },
  {
    slug: "local",
    name: "Local & Community News",
    summary: "Rustenburg, Bojanala and North West reporting.",
    articleSlugs: ["local-news", "community", "municipal", "announcements"],
    wireSlugs: ["local-news", "government"],
    localNorthwest: true,
  },
  {
    slug: "world",
    name: "World News",
    summary: "International affairs and diplomacy.",
    articleSlugs: ["world"],
    wireSlugs: ["world"],
    wireRegions: ["international"],
  },
  {
    slug: "africa",
    name: "African News",
    summary: "Continental developments across Africa.",
    articleSlugs: ["africa"],
    wireSlugs: ["africa"],
    wireRegions: ["africa"],
  },
  {
    slug: "south-africa",
    name: "South African News",
    summary: "National stories from across South Africa.",
    articleSlugs: ["south-africa", "announcements"],
    wireSlugs: ["government"],
    wireRegions: ["national"],
  },
  {
    slug: "sports",
    name: "Sports",
    summary: "Fixtures, results and sports reporting.",
    articleSlugs: ["sports"],
    wireSlugs: ["sport"],
    wireRegions: ["sport"],
  },
  {
    slug: "entertainment",
    name: "Entertainment",
    summary: "Arts, culture, music and screen.",
    articleSlugs: ["entertainment"],
    wireSlugs: ["entertainment"],
  },
  {
    slug: "education",
    name: "Education",
    summary: "Schools, universities and skills.",
    articleSlugs: ["education"],
    wireSlugs: ["education"],
  },
  {
    slug: "health",
    name: "Health",
    summary: "Public health and wellness information.",
    articleSlugs: ["health"],
    wireSlugs: ["health"],
    wireRegions: ["health"],
  },
  {
    slug: "jobs",
    name: "Jobs & Opportunities",
    summary: "Careers coverage and opportunity reporting.",
    articleSlugs: ["jobs-opportunities"],
    wireSlugs: ["jobs"],
  },
  {
    slug: "technology",
    name: "Technology & Innovation",
    summary: "Science, digital innovation and technology.",
    articleSlugs: ["technology"],
    wireSlugs: ["science", "technology"],
    wireRegions: ["technology"],
  },
  {
    slug: "environment",
    name: "Environment & Climate",
    summary: "Climate, conservation and environmental news.",
    articleSlugs: ["environment"],
    wireSlugs: ["science", "environment"],
  },
  {
    slug: "investigations",
    name: "Investigations",
    summary: "Accountability reporting and fact-checking.",
    articleSlugs: ["investigations"],
    wireSlugs: ["investigations"],
  },
  {
    slug: "opinion",
    name: "Opinion & Editorials",
    summary: "Comment and analysis from named contributors.",
    articleSlugs: ["opinion"],
    wireSlugs: ["opinion"],
  },
  {
    slug: "lifestyle",
    name: "Lifestyle",
    summary: "Living, culture and lifestyle features.",
    articleSlugs: ["lifestyle"],
    wireSlugs: ["lifestyle"],
  },
  {
    slug: "agriculture",
    name: "Agriculture",
    summary: "Farming, food systems and rural economy.",
    articleSlugs: ["agriculture"],
    wireSlugs: ["agriculture"],
  },
  {
    slug: "crime",
    name: "Crime & Justice",
    summary: "Courts, safety and justice reporting.",
    articleSlugs: ["crime-safety"],
    wireSlugs: ["crime", "justice"],
  },
  {
    slug: "multimedia",
    name: "Multimedia",
    summary: "Video, audio and visual journalism links.",
    articleSlugs: ["multimedia"],
    wireSlugs: ["multimedia", "video"],
  },
];

/** Categories seeded into article_categories (extends, does not remove, the original set). */
export const ARTICLE_CATEGORY_SEEDS: Array<[string, string]> = [
  ["Breaking news", "breaking-news"],
  ["Local news", "local-news"],
  ["Municipal", "municipal"],
  ["Crime and safety", "crime-safety"],
  ["Traffic", "traffic"],
  ["Business and mining", "business-mining"],
  ["Education", "education"],
  ["Sports", "sports"],
  ["Health", "health"],
  ["Politics", "politics"],
  ["Investigations", "investigations"],
  ["Opinion", "opinion"],
  ["Community", "community"],
  ["Announcements", "announcements"],
  ["World news", "world"],
  ["African news", "africa"],
  ["South African news", "south-africa"],
  ["Entertainment", "entertainment"],
  ["Lifestyle", "lifestyle"],
  ["Environment", "environment"],
  ["Technology", "technology"],
  ["Agriculture", "agriculture"],
  ["Jobs and opportunities", "jobs-opportunities"],
  ["Multimedia", "multimedia"],
];

const LOCAL_MARKERS = /\b(rustenburg|boitekong|phokeng|tlhabane|bojanala|north[\s-]?west|mahikeng|klerksdorp|potchefstroom|mogwase|marikana|lefaragatlhe|cashan|zinniaville)\b/i;

export function editorialBySlug(slug: string): EditorialCategory | undefined {
  return EDITORIAL_CATEGORIES.find((item) => item.slug === slug);
}

export function isLocalNorthwestText(...parts: Array<string | null | undefined>): boolean {
  return LOCAL_MARKERS.test(parts.filter(Boolean).join(" "));
}

export function newsNavCategories(): EditorialCategory[] {
  return EDITORIAL_CATEGORIES.filter((item) => item.slug !== "africa" && item.slug !== "south-africa");
}
