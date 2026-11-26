import Link from "next/link";
import { cookies } from "next/headers";
import { localePath, t, type MessageKey } from "@/lib/i18n";
import { ExploreIcon } from "@/components/explore-icon";
import { Mark } from "@/components/mark";
import { HeroStage } from "@/components/hero-stage";
import { ViewRail } from "@/components/view-rail";
import { LivePanel } from "@/components/live-panel";
import { TopFive } from "@/components/top-five";
import { heroScenes, type HeroScene } from "@/lib/hero-scenes";
import { homeEdition } from "@/server/citydesk";
import { cityDiscovery } from "@/server/discover";
import { locationAction } from "@/server/actions";
import { liveCampaigns } from "@/server/commerce";
import { approvedHero } from "@/server/media-library";
import { listLocationChoices } from "@/server/platform";

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const locationId = (await cookies()).get("rt_location")?.value || null;
  const places = listLocationChoices();
  const selected = places.find((item) => item.id === locationId) || null;
  const city = cityDiscovery(selected?.id || null);
  const edition = homeEdition();
  const hero = approvedHero();
  const scenes: HeroScene[] = hero
    ? [{ id: hero.id, src: hero.url, alt: hero.alt, credit: hero.credit, label: "Editor's photograph", place: "Approved for the homepage", href: "/news", note: "Placed by the newsroom. It is shown only while the permission is current.", category: "Newsroom", when: "Current permission", scope: "Shown only while the editor's permission is current." }, ...heroScenes]
    : heroScenes;
  const weatherPlaces = places.flatMap((place) => (
    typeof place.latitude === "number" && typeof place.longitude === "number" && Number.isFinite(place.latitude) && Number.isFinite(place.longitude)
      ? [{ id: place.id, label: place.label, latitude: place.latitude, longitude: place.longitude }]
      : []
  ));
  const rustenburg = weatherPlaces.find((place) => place.label.endsWith("Rustenburg")) || weatherPlaces[0];
  const slides = edition.slides.map((story) => ({ ...story, href: story.external ? story.href : localePath(locale, story.href) }));
  const [lead, ...rest] = edition.latest;
  const ad = liveCampaigns("homepage-banner")[0];
  const dateLocale = locale === "af" ? "af-ZA" : locale === "tn" ? "en-ZA" : "en-GB";
  const editionDate = new Intl.DateTimeFormat(dateLocale, { timeZone: "Africa/Johannesburg", weekday: "long", day: "numeric", month: "long" }).format(new Date());
  return (
    <div className="home-flow" lang={locale}>
      <HeroStage scenes={scenes}>
        <div className="cine-layout">
          <div className="cine-copy">
            <Mark />
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#DCE2EA]">{t(locale, "positioning")}</p>
            <h1 className="mt-3 max-w-3xl font-serif text-5xl leading-[1.02] text-white md:text-6xl">{t(locale, "home.hero")}</h1>
            <p className="mt-4 max-w-xl text-lg text-[#F4F6F9]">{t(locale, "home.heroSupport")}</p>
            <form action={localePath(locale, "/search")} className="cine-search">
              <label className="sr-only" htmlFor="city-search">{t(locale, "search")}</label>
              <input id="city-search" name="q" placeholder={t(locale, "home.searchWide")} className="min-w-0 flex-1 bg-transparent px-4 py-3 text-[#101827] outline-none" />
              <button className="m-1 rounded-full bg-[#101827] px-4 py-2 text-sm text-white">{t(locale, "search")}</button>
            </form>
            <form action={locationAction} className="cine-place">
              <input type="hidden" name="locale" value={locale} />
              <input type="hidden" name="return" value={localePath(locale)} />
              <label className="sr-only" htmlFor="home-location">{t(locale, "home.place")}</label>
              <select key={selected?.id || "all"} id="home-location" name="location" defaultValue={selected?.id || ""}>
                <option value="">{t(locale, "home.allPlaces")}</option>
                {places.map((place) => <option key={place.id} value={place.id}>{place.label}</option>)}
              </select>
              <button>{t(locale, "home.show")}</button>
            </form>
            <div className="mt-4 flex flex-wrap gap-2">
              {shortcuts.map(([href, label]) => <Link key={href} className="cine-chip" href={localePath(locale, href)}>{t(locale, label)}</Link>)}
            </div>
          </div>
          {rustenburg ? <LivePanel places={weatherPlaces} initialId={rustenburg.id} /> : null}
        </div>
      </HeroStage>

      <p className="edition-bar"><span>{t(locale, "home.editionBar")} · {editionDate}</span><span>{t(locale, "home.independent")}</span></p>

      <section>
        <div className="mb-3 flex items-end justify-between gap-3">
          <h2 className="font-serif text-4xl">{t(locale, "home.inView")}</h2>
          <p className="max-w-sm text-right text-xs text-[#4c5968]">{t(locale, "home.inViewNote")}</p>
        </div>
        <ViewRail cards={heroScenes} locale={locale} />
      </section>

      {slides.length ? <TopFive stories={slides} title={edition.editorial ? t(locale, "home.topStories") : t(locale, "home.latestOfficial")} /> : (
        <p className="text-sm">{t(locale, "home.noTop")}</p>
      )}

      <section>
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="font-serif text-4xl">{t(locale, "home.latestNews")}</h2>
          <Link className="text-sm font-semibold text-[#1d4e89]" href={localePath(locale, "/news")}>{t(locale, "home.openNewsroom")}</Link>
        </div>
        <div className="news-spread">
          {lead ? (
            <a className="news-lead" href={lead.href}>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#E7D7B1]">{lead.category} · {lead.source}</p>
              <p className="mt-3 font-serif text-4xl leading-tight text-white md:text-5xl">{lead.headline}</p>
              <p className="mt-4 text-sm text-[#DCE2EA]">{lead.published ? lead.published.slice(0, 16).replace("T", " ") : t(locale, "home.timeFromSource")} · {t(locale, "home.openOriginal")}</p>
            </a>
          ) : <p className="news-lead text-sm">{t(locale, "home.waitingFeed")}</p>}
          <ul className="news-side">
            {rest.slice(0, 3).map((item) => (
              <li key={item.key}>
                <a className="news-row" href={item.href}>
                  <span className="news-kicker">{item.category}</span>
                  <span className="font-serif text-xl leading-snug">{item.headline}</span>
                  <span className="text-xs text-[#5e6b7c]">{item.source} · {item.published ? item.published.slice(0, 16).replace("T", " ") : t(locale, "home.timeFromSource")}</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="range-band">
        <img src={heroScenes[0].src} alt="" />
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#DCE2EA]">{t(locale, "home.rangeKicker")}</p>
          <h2 className="mt-2 font-serif text-4xl text-white md:text-5xl">{t(locale, "home.rangeTitle")}</h2>
          <p className="mt-3 max-w-xl text-[#F4F6F9]">{t(locale, "home.rangeBody")}</p>
          {edition.local.length ? <ul className="mt-4 space-y-2">{edition.local.map((item) => <li key={item.key}><a className="font-semibold text-white" href={item.href}>{item.headline}</a></li>)}</ul> : <p className="mt-3 text-sm text-[#DCE2EA]">{t(locale, "home.noLocal")}</p>}
          <Link className="cine-chip mt-4 inline-flex" href={localePath(locale, "/history/rustenburg")}>{t(locale, "home.readStory")}</Link>
        </div>
      </section>

      <section>
        <h2 className="mb-3 font-serif text-3xl">{t(locale, "home.explore")}</h2>
        <div className="explore-grid">
          {explore.map(([href, label, note, icon]) => (
            <Link key={href} className="explore-tile" href={localePath(locale, href)}>
              <ExploreIcon name={icon} />
              <span>
                <span className="block text-sm font-semibold">{t(locale, label)}</span>
                <span className="block text-xs leading-4 text-[#4c5968]">{t(locale, note)}</span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className="home-trio">
        <div className="panel-work">
          <div className="mb-3 flex items-baseline justify-between"><h2 className="font-serif text-3xl">{t(locale, "home.work")}</h2><Link href={localePath(locale, "/jobs")}>{t(locale, "home.allJobs")}</Link></div>
          {city.jobs.length ? (
            <ul className="space-y-3">{city.jobs.slice(0, 3).map((job) => <li key={String(job.id)}><Link className="font-semibold" href={localePath(locale, `/jobs/${job.id}`)}>{String(job.title)}</Link></li>)}</ul>
          ) : <p>{t(locale, "home.noJobs")}</p>}
        </div>
        <div className="panel-live">
          <div className="mb-3 flex items-baseline justify-between"><h2 className="font-serif text-3xl">{t(locale, "home.thisWeek")}</h2><Link href={localePath(locale, "/events")}>{t(locale, "dept.events")}</Link></div>
          {city.events.length ? (
            <ul className="space-y-3">{city.events.slice(0, 3).map((event) => <li key={String(event.id)}><Link className="font-semibold" href={localePath(locale, `/events/${event.slug}`)}>{String(event.title)}</Link><p className="text-sm">{String(event.venue || "")}</p></li>)}</ul>
          ) : <p>{t(locale, "home.noEvents")}</p>}
          {city.businesses.length ? <ul className="mt-4 space-y-2">{city.businesses.slice(0, 2).map((business) => <li key={String(business.id)}><Link href={localePath(locale, `/business/${business.slug}`)}>{String(business.name)}</Link></li>)}</ul> : <p className="mt-4 text-sm">{t(locale, "home.noBusiness")}</p>}
        </div>
        <aside className="panel-ad">
          <p className="text-xs font-semibold uppercase tracking-[0.16em]">{t(locale, "home.ad")}</p>
          {ad && typeof ad.destination_url === "string" ? (
            <a href={ad.destination_url}>
              <p className="mt-3 text-xs font-semibold uppercase tracking-[0.14em]">{t(locale, "sponsored")}</p>
              {typeof ad.media_url === "string" && ad.media_url ? <img className="mt-3 h-28 w-full rounded-xl object-cover" src={ad.media_url} alt={String(ad.alt_text || ad.title || t(locale, "sponsored"))} /> : null}
              <p className="mt-3 font-serif text-2xl">{String(ad.title || t(locale, "sponsored"))}</p>
            </a>
          ) : (
            <>
              <p className="mt-3 font-serif text-2xl">{t(locale, "home.adOpen")}</p>
              <p className="mt-2 text-sm">{t(locale, "home.adEmpty")}</p>
              <Link className="mt-4 inline-block font-semibold" href={localePath(locale, "/advertising")}>{t(locale, "home.advertise")}</Link>
            </>
          )}
        </aside>
      </section>

      <section>
        <h2 className="mb-3 font-serif text-3xl">{t(locale, "home.discoverMore")}</h2>
        <div className="explore-grid">
          {more.map(([href, label, icon]) => (
            <Link key={href} className="explore-tile" href={localePath(locale, href)}>
              <ExploreIcon name={icon} />
              <span className="text-sm font-semibold">{t(locale, label)}</span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

const shortcuts: Array<[string, MessageKey]> = [
  ["/auth/sign-up", "register"],
  ["/community", "dept.community"],
  ["/tickets", "nav.tickets"],
  ["/property", "nav.property"],
  ["/safetrack", "nav.safetrack"],
  ["/news", "dept.news"],
  ["/jobs", "dept.jobs"],
];

const explore: Array<[string, MessageKey, MessageKey, string]> = [
  ["/news", "ex.news", "ex.news.note", "news"],
  ["/business", "ex.business", "ex.business.note", "business"],
  ["/marketplace", "ex.market", "ex.market.note", "market"],
  ["/jobs", "ex.work", "ex.work.note", "work"],
  ["/events", "ex.events", "ex.events.note", "events"],
  ["/property", "ex.property", "ex.property.note", "property"],
  ["/learn", "ex.learn", "ex.learn.note", "learn"],
  ["/map", "ex.places", "ex.places.note", "places"],
  ["/food", "ex.food", "ex.food.note", "food"],
  ["/community", "ex.community", "ex.community.note", "community"],
  ["/history/rustenburg", "ex.heritage", "ex.heritage.note", "heritage"],
  ["/tools", "ex.tools", "ex.tools.note", "tools"],
];

const more: Array<[string, MessageKey, string]> = [
  ["/watch", "ex.watch", "watch"],
  ["/sports", "ex.sports", "events"],
  ["/tourism", "ex.tourism", "places"],
  ["/notices", "ex.notices", "story"],
  ["/radio", "ex.radio", "news"],
  ["/safetrack", "nav.safetrack", "safety"],
  ["/desks", "nav.cityDesks", "community"],
];
