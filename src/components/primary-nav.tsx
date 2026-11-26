"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { localePath, t, type Locale } from "@/lib/i18n";
import { sections } from "@/lib/sections";

const primaryNav: Array<[string, string]> = [
  ["/", "Home"],
  ["/news", "News"],
  ["/map", "Explore"],
  ["/business", "Business"],
  ["/marketplace", "Marketplace"],
  ["/jobs", "Opportunities"],
];

const actionNav: Array<[string, string]> = [
  ["/tickets", "Tickets"],
  ["/property", "Property"],
];

function isCurrent(rest: string, href: string) {
  return href === "/" ? rest === "/" : rest === href || rest.startsWith(`${href}/`);
}

export function MobileDock({ locale, signedIn }: { locale: Locale; signedIn: boolean }) {
  const path = usePathname() || `/${locale}`;
  const rest = path.replace(/^\/(en|tn|af)/, "") || "/";
  const items: Array<[string, string]> = [
    ["/", "Home"],
    ["/news", "News"],
    ["/map", "Explore"],
    ["/saved", "Saved"],
    [signedIn ? "/account" : "/auth/sign-in", "Profile"],
  ];
  return (
    <nav className="dock" aria-label="Mobile">
      {items.map(([href, label]) => {
        const current = href === "/" ? rest === "/" : rest === href || rest.startsWith(`${href}/`);
        return <Link key={label} href={localePath(locale, href)} aria-current={current ? "page" : undefined}>{label}</Link>;
      })}
    </nav>
  );
}

export function PrimaryNav({ locale, trackerHref }: { locale: Locale; trackerHref: string }) {
  const path = usePathname() || `/${locale}`;
  const rest = path.replace(/^\/(en|tn|af)/, "") || "/";
  return (
    <nav aria-label="Primary" className="bar-nav">
      <div className="nav-rail">
        {primaryNav.map(([href, label]) => (
          <Link key={href} className="nav-pill bar-link" href={localePath(locale, href)} aria-current={isCurrent(rest, href) ? "page" : undefined}>{label}</Link>
        ))}
      </div>
      <div className="nav-actions">
      <Link className="tracker-chip" href={trackerHref}>SafeTrack</Link>
      {actionNav.map(([href, label]) => (
        <Link key={href} className={`nav-pill bar-action bar-action-${label.toLowerCase()}`} href={localePath(locale, href)} aria-current={isCurrent(rest, href) ? "page" : undefined}>{label}</Link>
      ))}
      <details className="nav-drop">
        <summary className="nav-pill bar-link">More</summary>
        <div className="nav-drop-panel glass-card max-h-80 overflow-auto text-graphite dark:text-cloud">
          <Link className="nav-link" href={localePath(locale, "/safetrack")}>SafeTrack</Link>
          <Link className="nav-link" href={localePath(locale, "/briefing")}>Daily briefing</Link>
          <Link className="nav-link" href={localePath(locale, "/edition")}>Morning edition</Link>
          <Link className="nav-link" href={localePath(locale, "/desks")}>City desks</Link>
          <Link className="nav-link" href={localePath(locale, "/community")}>Public posts</Link>
          <Link className="nav-link" href={localePath(locale, "/books")}>Books</Link>
          <Link className="nav-link" href={localePath(locale, "/live")}>Live notices</Link>
          <Link className="nav-link" href={localePath(locale, "/features")}>More features</Link>
          {sections.filter((section) => !["news", "map", "business", "marketplace", "jobs"].includes(section.slug)).map((section) => (
            <Link key={section.slug} className="nav-link" href={localePath(locale, `/${section.slug}`)}>{t(locale, section.titleKey)}</Link>
          ))}
        </div>
      </details>
      </div>
    </nav>
  );
}
