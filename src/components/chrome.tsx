import Link from "next/link";
import { headers } from "next/headers";
import { localePath, t, type Locale, LOCALES } from "@/lib/i18n";
import { sectionBySlug, sections } from "@/lib/sections";
import { divisions } from "@/lib/divisions";
import { formatMoney, formatWhen, paragraphs } from "@/lib/text";
import { themeAction, signOutAction } from "@/server/actions";
import type { SessionUser } from "@/server/auth";
import { MenuDrawer } from "@/components/drawer";
import { PageFlow } from "@/components/page-flow";
import { CompactBar } from "@/components/compact-bar";
import { FloatDock } from "@/components/float-dock";
import { MobileDock, PrimaryNav } from "@/components/primary-nav";
import { unreadCount } from "@/server/alerts";

export async function requestPath(): Promise<string> {
  return (await headers()).get("x-rt-path") || "/en";
}

export async function Shell({ locale, user, children }: { locale: Locale; user: SessionUser | null; children: React.ReactNode }) {
  const path = await requestPath();
  return (
    <>
      <a className="skip-link" href="#content">{t(locale, "skip")}</a>
      <div className="stage" aria-hidden="true">
        <div className="orb orb-a" />
        <div className="orb orb-b" />
        <div className="orb orb-c" />
        <div className="slab slab-a" />
        <div className="slab slab-b" />
        <div className="floor" />
      </div>
      <div className="app-frame mx-auto w-full max-w-[1440px] px-3 py-3 lg:px-5">
        <Header locale={locale} user={user} path={path} />
        <Breadcrumbs locale={locale} path={path} />
        <main id="content" className="px-1 py-4 lg:px-2"><PageFlow path={path}>{children}</PageFlow></main>
        <Footer locale={locale} user={user} />
        <MobileDock locale={locale} signedIn={Boolean(user)} />
        <FloatDock locale={locale} />
      </div>
    </>
  );
}

function Sidebar({ locale, path, theme }: { locale: Locale; path: string; theme: string }) {
  const rest = path.replace(/^\/(en|tn|af)/, "") || "/";
  return (
    <>
      <Link href={localePath(locale)} className="brand-lockup border-b border-white/40 px-5 py-5 dark:border-white/10">
        <BrandMark />
        <span className="brand-copy">
          <span className="font-serif text-2xl leading-none text-forest dark:text-cloud">Rustenburg Today</span>
          <span className="brand-credit is-visible">{t(locale, "tagline")}</span>
        </span>
      </Link>
      <div className="flex gap-2 px-4 pt-3">
        <Link className="nav-pill bar-action bar-action-ticket" href={localePath(locale, "/tickets")}>Tickets</Link>
        <Link className="nav-pill bar-action bar-action-property" href={localePath(locale, "/property")}>Property</Link>
        <Link className="nav-pill" href={localePath(locale, "/desks")}>Desks</Link>
      </div>
      <div className="side-scroll flex-1 px-3 py-3">
        {divisions.map((division) => (
          <div key={division.id} className="mb-3 border-t border-white/30 pt-3 first:border-0 first:pt-0 dark:border-white/10">
            <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">{t(locale, division.labelKey)}</p>
            <ul className="space-y-0.5 text-sm">
              {division.links?.map((link) => {
                const href = localePath(locale, link.href);
                return <li key={link.href}><Link className="nav-link" href={href} aria-current={path === href || path.startsWith(`${href}/`) ? "page" : undefined}>{t(locale, link.labelKey)}</Link></li>;
              })}
              {division.slugs.map((slug) => {
                const section = sections.find((item) => item.slug === slug);
                if (!section) return null;
                const href = localePath(locale, `/${section.slug}`);
                return <li key={slug}><Link className="nav-link" href={href} aria-current={path === href || path.startsWith(`${href}/`) ? "page" : undefined}>{t(locale, section.titleKey)}</Link></li>;
              })}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-white/40 px-4 py-4 text-sm dark:border-white/10">
        <div className="flex flex-wrap gap-2">
          {LOCALES.map((item) => (
            <Link key={item} className="nav-pill" href={`/${item}${rest}`}>{item === "en" ? "English" : item === "af" ? "Afrikaans" : "Setswana"}</Link>
          ))}
        </div>
        <form action={themeAction} className="mt-3">
          <input type="hidden" name="return" value={path} />
          <input type="hidden" name="theme" value={theme} />
          <button className="nav-pill">{theme === "dark" ? t(locale, "theme.dark") : t(locale, "theme.light")}</button>
        </form>
      </div>
    </>
  );
}

export async function Header({ locale, user, path }: { locale: Locale; user: SessionUser | null; path: string }) {
  const rest = path.replace(/^\/(en|tn|af)/, "") || "/";
  const { cookies } = await import("next/headers");
  const jar = await cookies();
  const theme = jar.get("rt_theme")?.value === "dark" ? "light" : "dark";
  const unread = user ? unreadCount(user.id) : 0;
  return (
    <header className="site-header sticky top-0 z-50 text-forest dark:text-cloud">
      <CompactBar />
      <div className="site-bar">
        <div className="brand-cluster">
          <MenuDrawer label={t(locale, "menu")} closeLabel={t(locale, "close")}>
            <Sidebar locale={locale} path={path} theme={theme} />
          </MenuDrawer>
          <Link href={localePath(locale)} className="brand-lockup" aria-label={`Rustenburg Today. ${t(locale, "tagline")}`}>
            <span className="brand-mark-wrap"><BrandMark /></span>
            <span className="brand-copy">
              <span className="brand-name">Rustenburg Today</span>
              <Slogan text={t(locale, "tagline")} />
            </span>
          </Link>
        </div>
        <PrimaryNav locale={locale} trackerHref={localePath(locale, user ? "/account/notifications" : "/news")} />
        <div className="flex items-center justify-end gap-1">
          <Link className="bar-icon bar-search-icon" href={localePath(locale, "/search")} aria-label={t(locale, "search")}>
            <SearchIcon />
          </Link>
          <form action={localePath(locale, "/search")} className="bar-search">
            <label className="sr-only" htmlFor="q">{t(locale, "search")}</label>
            <input id="q" name="q" placeholder={t(locale, "search.placeholder")} className="w-40 rounded-full border border-[#A9B7C9]/70 bg-white/70 px-4 py-1.5 text-sm text-[#101827]" />
          </form>
          <Link className="bar-icon" href={localePath(locale, user ? "/account/notifications" : "/auth/sign-in")} aria-label={t(locale, "notifications")}>
            <BellIcon />
            {unread > 0 ? <span className="badge absolute -right-1 -top-1">{unread}</span> : null}
          </Link>
          <details className="nav-drop nav-drop-end">
            <summary className="nav-pill bar-link account-trigger max-w-[8.5rem] truncate bg-[#101827] font-semibold text-white">{user ? user.displayName.split(" ")[0] : t(locale, "account")}</summary>
            <div className="nav-drop-panel glass-card text-graphite dark:text-cloud">
              {user ? <Link className="nav-link" href={localePath(locale, "/account")}>{t(locale, "account")}</Link> : <Link className="nav-link" href={localePath(locale, "/auth/sign-in")}>{t(locale, "signIn")}</Link>}
              {user ? null : <Link className="nav-link" href={localePath(locale, "/auth/sign-up")}>{t(locale, "register")}</Link>}
              {user ? <Link className="nav-link" href={localePath(locale, "/safetrack")}>SafeTrack</Link> : null}
              {user?.roles.includes("administrator") ? <Link className="nav-link" href={localePath(locale, "/admin")}>{t(locale, "admin")}</Link> : null}
              {LOCALES.map((item) => (
                <Link key={item} className="nav-link" href={`/${item}${rest}`}>{item === "en" ? "English" : item === "af" ? "Afrikaans" : "Setswana"}</Link>
              ))}
              <form action={themeAction}>
                <input type="hidden" name="return" value={path} />
                <input type="hidden" name="theme" value={theme} />
                <button className="nav-link w-full text-left">{theme === "dark" ? t(locale, "theme.dark") : t(locale, "theme.light")}</button>
              </form>
              {user ? <form action={signOutAction}><input type="hidden" name="locale" value={locale} /><button className="nav-link w-full text-left">{t(locale, "signOut")}</button></form> : null}
            </div>
          </details>
        </div>
      </div>
    </header>
  );
}

function BrandMark() {
  return (
    <svg className="brand-mark" width="36" height="36" viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="9" fill="#101827" />
      <path className="ridge" d="M5 24l6.2-9 3.4 4.2 5.6-8.2L27 24" fill="none" stroke="#E7D7B1" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
      <circle className="sun" cx="23.5" cy="9" r="2" fill="#F4F6F9" />
    </svg>
  );
}

function Slogan({ text }: { text: string }) {
  const words = text.split(/\s+/).filter(Boolean);
  return (
    <span className="brand-slogan" aria-label={text}>
      <span className="brand-slogan-still">{text}</span>
      <span className="brand-slogan-track" aria-hidden="true">
        {words.map((word, index) => (
          <span key={`${word}-${index}`} className="brand-word" style={{ animationDelay: `${index * 1.8}s` }}>{word}</span>
        ))}
      </span>
    </span>
  );
}

function SearchIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M6 9a6 6 0 1 1 12 0c0 7 3 7 3 7H3s3 0 3-7" />
      <path d="M10 19a2 2 0 0 0 4 0" />
    </svg>
  );
}

export function Breadcrumbs({ locale, path }: { locale: Locale; path: string }) {
  const rest = path.replace(/^\/(en|tn|af)/, "") || "/";
  if (rest === "/") return null;
  const parts = rest.split("/").filter(Boolean);
  const crumbs = [{ href: "/", label: t(locale, "home") }];
  let built = "";
  for (const part of parts) {
    built += `/${part}`;
    const section = sectionBySlug(part);
    crumbs.push({ href: built, label: section ? t(locale, section.titleKey) : decodeURIComponent(part) });
  }
  return (
    <nav className="crumbs px-1" aria-label="Breadcrumb">
      {crumbs.map((crumb, index) => (
        <span key={`${crumb.href}-${index}`}>
          {index ? <span aria-hidden="true"> / </span> : null}
          {index === crumbs.length - 1 ? <span aria-current="page">{crumb.label}</span> : <Link href={localePath(locale, crumb.href)}>{crumb.label}</Link>}
        </span>
      ))}
    </nav>
  );
}

const footerColumns: Array<[string, Array<[string, string]>]> = [
  ["Explore", [["/news", "News"], ["/map", "Discover"], ["/desks", "City desks"], ["/tickets", "Tickets"], ["/events", "Events"], ["/tourism", "Tourism"], ["/history/rustenburg", "Rustenburg story"]]],
  ["Business", [["/business", "Business directory"], ["/marketplace", "Marketplace"], ["/property", "Property"], ["/jobs", "Jobs"], ["/advertising", "Advertise"]]],
  ["Community", [["/learn", "Learn"], ["/community", "Community"], ["/sports", "Sports"], ["/notices", "Public notices"], ["/safetrack", "SafeTrack"]]],
  ["Rustenburg Today", [["/about", "About"], ["/ask", "Ask"], ["/features", "Help and features"], ["/legal/guidelines", "Community guidelines"]]],
];

export function Footer({ locale, user }: { locale: string; user: SessionUser | null }) {
  return (
    <footer className="site-footer">
      <div className="flex items-center gap-3 px-6 pt-8">
        <BrandMark />
        <div>
          <p className="font-serif text-3xl">Rustenburg Today</p>
          <p className="text-xs tracking-wide text-[#E7D7B1]">The Product Of The Elite Crew (Pty) Ltd.</p>
        </div>
      </div>
      <div className="px-6 pt-3">
        <p className="text-sm">{t(locale, "tagline")}</p>
        <p className="mt-2 max-w-xl text-sm text-[#DCE2EA]">A digital home connecting people, businesses, opportunities, news and experiences across Rustenburg and South Africa.</p>
      </div>
      <div className="grid gap-6 px-6 py-6 sm:grid-cols-2 lg:grid-cols-4">
        {footerColumns.map(([title, links]) => (
          <div key={title}>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#E7D7B1]">{title}</p>
            <ul className="mt-3 space-y-1.5 text-sm">
              {links.map(([href, label]) => <li key={href}><Link href={localePath(locale, href)}>{label}</Link></li>)}
            </ul>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-white/15 px-6 py-4 text-sm">
        <span>© {new Date().getFullYear()} Rustenburg Today · The Product Of The Elite Crew (Pty) Ltd.</span>
        <Link href={localePath(locale, "/about")}>{t(locale, "about")}</Link>
        <Link href={localePath(locale, "/legal/privacy")}>{t(locale, "privacy")}</Link>
        <Link href={localePath(locale, "/legal/terms")}>{t(locale, "terms")}</Link>
        <Link href={localePath(locale, "/legal/guidelines")}>{t(locale, "guidelines")}</Link>
        <span className="basis-full text-xs text-[#DCE2EA]">{t(locale, "footer.notOfficial")}</span>
        {user ? <span className="text-xs text-[#DCE2EA]">{user.displayName}</span> : null}
      </div>
    </footer>
  );
}

export function PageIntro({ locale, kicker, title, summary, disclaimer }: { locale: string; kicker?: string; title: string; summary?: string; disclaimer?: string }) {
  return (
    <header lang={locale} className="glass-card liquid mb-8 max-w-3xl px-6 py-6">
      {kicker ? <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald">{kicker}</p> : null}
      <h1 className="mt-2 font-serif text-4xl leading-tight text-forest dark:text-cloud md:text-5xl">{title}</h1>
      {summary ? <p className="mt-3 text-lg text-muted">{summary}</p> : null}
      {disclaimer ? <p className="mt-4 rounded-2xl border border-white/70 bg-white/40 px-4 py-3 text-sm dark:border-white/10 dark:bg-white/5">{disclaimer}</p> : null}
    </header>
  );
}

export function Notice({ error, notice }: { error?: string; notice?: string }) {
  if (error) return <p role="alert" className="feedback mb-4 rounded-2xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900">{error}</p>;
  if (notice) return <p className="feedback mb-4 rounded-2xl border border-emerald/30 bg-emerald/10 px-4 py-3 text-sm">{notice}</p>;
  return null;
}

export function Empty({ locale }: { locale: string }) {
  return (
    <div className="glass-card px-6 py-12 text-center">
      <p className="font-serif text-2xl text-forest dark:text-cloud">{t(locale, "empty")}</p>
      <p className="mt-2 text-muted">{t(locale, "empty.hint")}</p>
    </div>
  );
}

function cardKind(href: string): string {
  if (href.includes("/marketplace")) return "product";
  if (href.includes("/property")) return "property";
  if (href.includes("/events") || href.includes("/tickets") || href.includes("/competitions")) return "event";
  if (href.includes("/jobs")) return "job";
  if (href.includes("/learn")) return "course";
  if (href.includes("/business") || href.includes("/advertising") || href.includes("/deals")) return "business";
  if (href.includes("/community")) return "social";
  if (["/podcasts", "/tv", "/radio", "/music", "/creators", "/talent"].some((part) => href.includes(part))) return "media";
  return "editorial";
}

export function StoryCard({ locale, href, title, excerpt, meta, demo, sponsored }: { locale: string; href: string; title: string; excerpt?: string; meta?: string; demo?: boolean; sponsored?: boolean }) {
  const kind = cardKind(href);
  return (
    <article className={`glass-card card-${kind} lift flex h-full flex-col p-5`}>
      <div className="mb-3 flex gap-2 text-xs font-semibold uppercase tracking-wide">
        {sponsored ? <span className="rounded-full bg-white/80 px-2 py-1 text-forest">{t(locale, "sponsored")}</span> : null}
        {demo ? <span className="rounded-full bg-forest px-2 py-1 text-cloud">{t(locale, "demo")}</span> : null}
      </div>
      <h2 className="font-serif text-2xl leading-snug text-forest dark:text-cloud"><Link href={href}>{title}</Link></h2>
      {excerpt ? <p className={`mt-2 flex-1 text-sm text-muted ${kind === "social" ? "text-base leading-6" : ""}`}>{excerpt}</p> : null}
      {meta ? <p className="card-meta mt-4 text-xs uppercase tracking-wide text-emerald">{meta}</p> : null}
    </article>
  );
}

export function Prose({ text }: { text: string }) {
  return (
    <div className="prose-city max-w-3xl text-lg leading-8">
      {paragraphs(text).map((paragraph) => <p key={paragraph.slice(0, 24)}>{paragraph}</p>)}
    </div>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm font-semibold">
      {label}
      <div className="mt-1 font-normal">{children}</div>
    </label>
  );
}

export const control = "w-full rounded-2xl border border-white/70 bg-white/70 px-3 py-2 text-graphite backdrop-blur dark:border-white/15 dark:bg-white/10 dark:text-cloud";
export const button = "rounded-full bg-forest px-4 py-2 text-sm font-semibold text-cloud shadow-lg shadow-navy/20 hover:bg-emerald";

export function Money({ cents }: { cents: number | null | undefined }) {
  return <span>{formatMoney(cents)}</span>;
}

export function When({ locale, value }: { locale: string; value: string | null | undefined }) {
  return <time dateTime={value || undefined}>{formatWhen(value, locale)}</time>;
}

export function HiddenLocale({ locale }: { locale: string }) {
  return <input type="hidden" name="locale" value={locale} />;
}
