/** Controlled values for news display classification across all publishing departments. */

export const NEWS_DISPLAY_TYPES = ["headline", "body"] as const;
export type NewsDisplayType = (typeof NEWS_DISPLAY_TYPES)[number];

export const EDITORIAL_PRIORITIES = ["breaking", "top", "important", "standard"] as const;
export type EditorialPriority = (typeof EDITORIAL_PRIORITIES)[number];

/** Site-wide live Headline News slots (excludes Main Editorial Story manager). */
export const MAX_SITE_HEADLINES = 8;

/** Per-department live Headline News slots. */
export const MAX_DEPARTMENT_HEADLINES = 3;

/**
 * Departments authorised to publish original news through the CMS / desk flows.
 * Uses existing section slugs — does not invent new departments.
 */
export const NEWS_PUBLISHING_DEPARTMENTS: Array<{ slug: string; label: string }> = [
  { slug: "news", label: "News and Journalism" },
  { slug: "sports", label: "Sports and Recreation" },
  { slug: "business", label: "Business and Economy" },
  { slug: "learn", label: "Education and Learning" },
  { slug: "health", label: "Health and Wellness" },
  { slug: "voice", label: "Public Voice and Municipal Accountability" },
  { slug: "agriculture", label: "Agriculture and Farming" },
  { slug: "technology", label: "Technology and Innovation" },
  { slug: "youth", label: "Youth and Children" },
  { slug: "community", label: "Community Help and Social Impact" },
  { slug: "tourism", label: "Tourism and Discover Rustenburg" },
  { slug: "jobs", label: "Jobs and Opportunities" },
  { slug: "events", label: "Events" },
  { slug: "notices", label: "Public Notices" },
  { slug: "transport", label: "Transport" },
  { slug: "food", label: "Food" },
  { slug: "family", label: "Family" },
  { slug: "faith", label: "Faith" },
  { slug: "services", label: "Services" },
  { slug: "support", label: "Community Support" },
  { slug: "history", label: "History and Heritage" },
  { slug: "creators", label: "Creators" },
];

export function isNewsPublishingDepartment(slug: string): boolean {
  return NEWS_PUBLISHING_DEPARTMENTS.some((item) => item.slug === slug);
}

export function normalizeDisplayType(value: string | null | undefined): NewsDisplayType {
  return value === "headline" ? "headline" : "body";
}

export function normalizePriority(value: string | null | undefined): EditorialPriority {
  if (value === "breaking" || value === "top" || value === "important" || value === "standard") return value;
  return "standard";
}
