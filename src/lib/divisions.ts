import type { MessageKey } from "./i18n";

export type Division = {
  id: string;
  labelKey: MessageKey;
  slugs: string[];
  links?: Array<{ href: string; labelKey: MessageKey }>;
};

/** The 30 departments stay addressable. These 12 divisions only group navigation. */
export const divisions: Division[] = [
  { id: "news", labelKey: "div.news", slugs: ["news", "podcasts", "tv", "radio", "music"] },
  { id: "events", labelKey: "div.events", slugs: ["events", "competitions"], links: [{ href: "/tickets", labelKey: "nav.tickets" }] },
  { id: "market", labelKey: "div.market", slugs: ["marketplace"] },
  { id: "property", labelKey: "div.property", slugs: ["property"] },
  { id: "business", labelKey: "div.business", slugs: ["business", "advertising", "deals"] },
  { id: "learn", labelKey: "div.learn", slugs: ["learn"] },
  { id: "jobs", labelKey: "div.jobs", slugs: ["jobs"] },
  { id: "community", labelKey: "div.community", slugs: ["community"] },
  { id: "discover", labelKey: "div.discover", slugs: ["map", "tourism", "transport", "services"] },
  { id: "talent", labelKey: "div.talent", slugs: ["talent", "creators"] },
  { id: "life", labelKey: "div.life", slugs: ["food", "sports", "youth", "health", "family", "agriculture", "faith"], links: [{ href: "/safetrack", labelKey: "nav.safetrack" }] },
  { id: "city", labelKey: "div.city", slugs: ["voice", "history", "notices", "support", "technology", "briefing", "ask"] },
];

export function divisionForSlug(slug: string): Division | undefined {
  return divisions.find((division) => division.slugs.includes(slug));
}
