import type { MessageKey } from "./i18n";

export type SectionMeta = {
  slug: string;
  titleKey: MessageKey;
  summaryKey: MessageKey;
  group: "primary" | "media" | "opportunity" | "city" | "platform";
  disclaimerKey?: MessageKey;
};

export const sections: SectionMeta[] = [
  { slug: "news", titleKey: "dept.news", summaryKey: "sum.news", group: "primary" },
  { slug: "community", titleKey: "dept.community", summaryKey: "sum.community", group: "primary" },
  { slug: "podcasts", titleKey: "dept.podcasts", summaryKey: "sum.podcasts", group: "media" },
  { slug: "tv", titleKey: "dept.tv", summaryKey: "sum.tv", group: "media" },
  { slug: "radio", titleKey: "dept.radio", summaryKey: "sum.radio", group: "media", disclaimerKey: "disclaimer.radio" },
  { slug: "music", titleKey: "dept.music", summaryKey: "sum.music", group: "media", disclaimerKey: "disclaimer.radio" },
  { slug: "talent", titleKey: "dept.talent", summaryKey: "sum.talent", group: "opportunity" },
  { slug: "marketplace", titleKey: "dept.marketplace", summaryKey: "sum.marketplace", group: "primary", disclaimerKey: "disclaimer.payments" },
  { slug: "jobs", titleKey: "dept.jobs", summaryKey: "sum.jobs", group: "primary" },
  { slug: "learn", titleKey: "dept.learn", summaryKey: "sum.learn", group: "opportunity", disclaimerKey: "disclaimer.learn" },
  { slug: "events", titleKey: "dept.events", summaryKey: "sum.events", group: "primary" },
  { slug: "business", titleKey: "dept.business", summaryKey: "sum.business", group: "city" },
  { slug: "advertising", titleKey: "dept.advertising", summaryKey: "sum.advertising", group: "city" },
  { slug: "property", titleKey: "dept.property", summaryKey: "sum.property", group: "city" },
  { slug: "food", titleKey: "dept.food", summaryKey: "sum.food", group: "city" },
  { slug: "sports", titleKey: "dept.sports", summaryKey: "sum.sports", group: "city" },
  { slug: "youth", titleKey: "dept.youth", summaryKey: "sum.youth", group: "opportunity", disclaimerKey: "disclaimer.youth" },
  { slug: "support", titleKey: "dept.support", summaryKey: "sum.support", group: "city", disclaimerKey: "disclaimer.support" },
  { slug: "transport", titleKey: "dept.transport", summaryKey: "sum.transport", group: "city" },
  { slug: "tourism", titleKey: "dept.tourism", summaryKey: "sum.tourism", group: "city" },
  { slug: "health", titleKey: "dept.health", summaryKey: "sum.health", group: "city", disclaimerKey: "disclaimer.health" },
  { slug: "voice", titleKey: "dept.voice", summaryKey: "sum.voice", group: "city", disclaimerKey: "footer.notOfficial" },
  { slug: "deals", titleKey: "dept.deals", summaryKey: "sum.deals", group: "city" },
  { slug: "competitions", titleKey: "dept.competitions", summaryKey: "sum.competitions", group: "opportunity" },
  { slug: "history", titleKey: "dept.history", summaryKey: "sum.history", group: "city" },
  { slug: "services", titleKey: "dept.services", summaryKey: "sum.services", group: "city" },
  { slug: "agriculture", titleKey: "dept.agriculture", summaryKey: "sum.agriculture", group: "city" },
  { slug: "faith", titleKey: "dept.faith", summaryKey: "sum.faith", group: "city" },
  { slug: "family", titleKey: "dept.family", summaryKey: "sum.family", group: "city" },
  { slug: "technology", titleKey: "dept.technology", summaryKey: "sum.technology", group: "city" },
  { slug: "productivity", titleKey: "dept.productivity", summaryKey: "sum.productivity", group: "platform" },
  { slug: "notices", titleKey: "dept.notices", summaryKey: "sum.notices", group: "primary" },
  { slug: "creators", titleKey: "dept.creators", summaryKey: "sum.creators", group: "media" },
  { slug: "map", titleKey: "dept.map", summaryKey: "sum.map", group: "platform", disclaimerKey: "disclaimer.map" },
  { slug: "briefing", titleKey: "dept.briefing", summaryKey: "sum.briefing", group: "platform" },
  { slug: "ask", titleKey: "dept.ask", summaryKey: "sum.ask", group: "platform", disclaimerKey: "disclaimer.ask" },
];

export function sectionBySlug(slug: string): SectionMeta | undefined {
  return sections.find((section) => section.slug === slug);
}

export const primaryNav = ["news", "community", "jobs", "marketplace", "events", "learn"];
