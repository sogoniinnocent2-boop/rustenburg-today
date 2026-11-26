"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { localePath, t, type Locale, type MessageKey } from "@/lib/i18n";
import { sections } from "@/lib/sections";

const primaryNav: Array<[string, MessageKey]> = [
  ["/", "nav.home"],
  ["/news", "nav.news"],
  ["/map", "nav.explore"],
  ["/business", "nav.business"],
  ["/marketplace", "nav.marketplace"],
  ["/jobs", "nav.opportunities"],
];

const actionNav: Array<[string, MessageKey, string]> = [
  ["/tickets", "nav.tickets", "tickets"],
  ["/property", "nav.property", "property"],
];

function isCurrent(rest: string, href: string) {
  return href === "/" ? rest === "/" : rest === href || rest.startsWith(`${href}/`);
}

export function MobileDock({ locale, signedIn }: { locale: Locale; signedIn: boolean }) {
  const path = usePathname() || `/${locale}`;
  const rest = path.replace(/^\/(en|tn|af)/, "") || "/";
  const items: Array<[string, MessageKey]> = [
    ["/", "nav.home"],
    ["/news", "nav.news"],
    ["/map", "nav.explore"],
    ["/saved", "nav.saved"],
    [signedIn ? "/account" : "/auth/sign-in", "nav.profile"],
  ];
  return (
    <nav className="dock" aria-label={t(locale, "menu")} lang={locale}>
      {items.map(([href, label]) => {
        const current = href === "/" ? rest === "/" : rest === href || rest.startsWith(`${href}/`);
        return <Link key={label} href={localePath(locale, href)} aria-current={current ? "page" : undefined}>{t(locale, label)}</Link>;
      })}
    </nav>
  );
}

export function PrimaryNav({ locale, trackerHref }: { locale: Locale; trackerHref: string }) {
  const path = usePathname() || `/${locale}`;
  const rest = path.replace(/^\/(en|tn|af)/, "") || "/";
  return (
    <nav aria-label={t(locale, "menu")} className="bar-nav" lang={locale}>
      <div className="nav-rail">
        {primaryNav.map(([href, label]) => (
          <Link key={href} className="nav-pill bar-link" href={localePath(locale, href)} aria-current={isCurrent(rest, href) ? "page" : undefined}>{t(locale, label)}</Link>
        ))}
      </div>
      <div className="nav-actions">
      <Link className="tracker-chip" href={trackerHref}>{t(locale, "nav.safetrack")}</Link>
      {actionNav.map(([href, label, action]) => (
        <Link key={href} className={`nav-pill bar-action bar-action-${action}`} href={localePath(locale, href)} aria-current={isCurrent(rest, href) ? "page" : undefined}>{t(locale, label)}</Link>
      ))}
      <details className="nav-drop">
        <summary className="nav-pill bar-link">{t(locale, "nav.more")}</summary>
        <div className="nav-drop-panel glass-card max-h-80 overflow-auto text-graphite dark:text-cloud">
          <Link className="nav-link" href={localePath(locale, "/property")}>{t(locale, "nav.property")}</Link>
          <Link className="nav-link" href={localePath(locale, "/tickets")}>{t(locale, "nav.tickets")}</Link>
          <Link className="nav-link" href={localePath(locale, "/safetrack")}>{t(locale, "nav.safetrack")}</Link>
          <Link className="nav-link" href={localePath(locale, "/briefing")}>{t(locale, "nav.briefing")}</Link>
          <Link className="nav-link" href={localePath(locale, "/edition")}>{t(locale, "nav.edition")}</Link>
          <Link className="nav-link" href={localePath(locale, "/desks")}>{t(locale, "nav.cityDesks")}</Link>
          <Link className="nav-link" href={localePath(locale, "/community")}>{t(locale, "nav.posts")}</Link>
          <Link className="nav-link" href={localePath(locale, "/books")}>{t(locale, "nav.books")}</Link>
          <Link className="nav-link" href={localePath(locale, "/live")}>{t(locale, "nav.live")}</Link>
          <Link className="nav-link" href={localePath(locale, "/features")}>{t(locale, "nav.features")}</Link>
          {sections.filter((section) => !["news", "map", "business", "marketplace", "jobs"].includes(section.slug)).map((section) => (
            <Link key={section.slug} className="nav-link" href={localePath(locale, `/${section.slug}`)}>{t(locale, section.titleKey)}</Link>
          ))}
        </div>
      </details>
      </div>
    </nav>
  );
}
