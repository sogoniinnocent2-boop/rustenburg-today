import Link from "next/link";
import { cookies } from "next/headers";
import { localePath, t } from "@/lib/i18n";
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
  const editionDate = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Johannesburg", weekday: "long", day: "numeric", month: "long" }).format(new Date());
  return (
    <div className="home-flow">
      <HeroStage scenes={scenes}>
        <div className="cine-layout">
          <div className="cine-copy">
            <Mark />
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#DCE2EA]">{t(locale, "positioning")}</p>
            <h1 className="mt-3 max-w-3xl font-serif text-5xl leading-[1.02] text-white md:text-6xl">{t(locale, "home.hero")}</h1>
            <p className="mt-4 max-w-xl text-lg text-[#F4F6F9]">Your digital home for news, opportunities, business, learning, entertainment and everything happening around you.</p>
            <form action={localePath(locale, "/search")} className="cine-search">
              <label className="sr-only" htmlFor="city-search">{t(locale, "search")}</label>
              <input id="city-search" name="q" placeholder="Search news, work, events and businesses" className="min-w-0 flex-1 bg-transparent px-4 py-3 text-[#101827] outline-none" />
              <button className="m-1 rounded-full bg-[#101827] px-4 py-2 text-sm text-white">Search</button>
            </form>
            <form action={locationAction} className="cine-place">
              <input type="hidden" name="locale" value={locale} />
              <input type="hidden" name="return" value={localePath(locale)} />
              <label className="sr-only" htmlFor="home-location">Place</label>
              <select key={selected?.id || "all"} id="home-location" name="location" defaultValue={selected?.id || ""}>
                <option value="">All places</option>
                {places.map((place) => <option key={place.id} value={place.id}>{place.label}</option>)}
              </select>
              <button>Show</button>
            </form>
            <div className="mt-4 flex flex-wrap gap-2">
              {shortcuts.map(([href, label]) => <Link key={href} className="cine-chip" href={localePath(locale, href)}>{label}</Link>)}
            </div>
          </div>
          {rustenburg ? <LivePanel places={weatherPlaces} initialId={rustenburg.id} /> : null}
        </div>
      </HeroStage>

      <p className="edition-bar"><span>Rustenburg edition · {editionDate}</span><span>Independent · not a municipal channel</span></p>

      <section>
        <div className="mb-3 flex items-end justify-between gap-3">
          <h2 className="font-serif text-4xl">Rustenburg in view</h2>
          <p className="max-w-sm text-right text-xs text-[#4c5968]">A horizontal row. Places outside the city centre stay labelled that way.</p>
        </div>
        <ViewRail cards={heroScenes} locale={locale} />
      </section>

      {slides.length ? <TopFive stories={slides} title={edition.editorial ? "Today's top stories" : "Latest official stories"} /> : (
        <p className="text-sm">No approved story is ready for the top of the page.</p>
      )}

      <section>
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="font-serif text-4xl">Latest news</h2>
          <Link className="text-sm font-semibold text-[#1d4e89]" href={localePath(locale, "/news")}>Open the newsroom</Link>
        </div>
        <div className="news-spread">
          {lead ? (
            <a className="news-lead" href={lead.href}>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#E7D7B1]">{lead.category} · {lead.source}</p>
              <p className="mt-3 font-serif text-4xl leading-tight text-white md:text-5xl">{lead.headline}</p>
              <p className="mt-4 text-sm text-[#DCE2EA]">{lead.published ? lead.published.slice(0, 16).replace("T", " ") : "Time from the source"} · Open the original report</p>
            </a>
          ) : <p className="news-lead text-sm">Further headlines appear after the next feed check. Nothing is invented to fill this list.</p>}
          <ul className="news-side">
            {rest.slice(0, 3).map((item) => (
              <li key={item.key}>
                <a className="news-row" href={item.href}>
                  <span className="news-kicker">{item.category}</span>
                  <span className="font-serif text-xl leading-snug">{item.headline}</span>
                  <span className="text-xs text-[#5e6b7c]">{item.source} · {item.published ? item.published.slice(0, 16).replace("T", " ") : "time from the source"}</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="range-band">
        <img src={heroScenes[0].src} alt="" />
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#DCE2EA]">Rustenburg and North West</p>
          <h2 className="mt-2 font-serif text-4xl text-white md:text-5xl">A story still being written.</h2>
          <p className="mt-3 max-w-xl text-[#F4F6F9]">From the 1850 birth of the town recorded by South African History Online, through the siege, apartheid removals and platinum, to the city now. The mountain in this photograph is the Magaliesberg.</p>
          {edition.local.length ? <ul className="mt-4 space-y-2">{edition.local.map((item) => <li key={item.key}><a className="font-semibold text-white" href={item.href}>{item.headline}</a></li>)}</ul> : <p className="mt-3 text-sm text-[#DCE2EA]">No Rustenburg story is in the current official feed. National headlines stay in Latest news.</p>}
          <Link className="cine-chip mt-4 inline-flex" href={localePath(locale, "/history/rustenburg")}>Read the full story</Link>
        </div>
      </section>

      <section>
        <h2 className="mb-3 font-serif text-3xl">Explore</h2>
        <div className="explore-grid">
          {explore.map(([href, label, note, icon]) => (
            <Link key={href} className="explore-tile" href={localePath(locale, href)}>
              <ExploreIcon name={icon} />
              <span>
                <span className="block text-sm font-semibold">{label}</span>
                <span className="block text-xs leading-4 text-[#4c5968]">{note}</span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className="home-trio">
        <div className="panel-work">
          <div className="mb-3 flex items-baseline justify-between"><h2 className="font-serif text-3xl">Work</h2><Link href={localePath(locale, "/jobs")}>All jobs</Link></div>
          {city.jobs.length ? (
            <ul className="space-y-3">{city.jobs.slice(0, 3).map((job) => <li key={String(job.id)}><Link className="font-semibold" href={localePath(locale, `/jobs/${job.id}`)}>{String(job.title)}</Link></li>)}</ul>
          ) : <p>No confirmed vacancy is published. An employer adds a real listing from the jobs desk.</p>}
        </div>
        <div className="panel-live">
          <div className="mb-3 flex items-baseline justify-between"><h2 className="font-serif text-3xl">This week</h2><Link href={localePath(locale, "/events")}>Events</Link></div>
          {city.events.length ? (
            <ul className="space-y-3">{city.events.slice(0, 3).map((event) => <li key={String(event.id)}><Link className="font-semibold" href={localePath(locale, `/events/${event.slug}`)}>{String(event.title)}</Link><p className="text-sm">{String(event.venue || "")}</p></li>)}</ul>
          ) : <p>No published event is on the calendar. An organiser can draft one.</p>}
          {city.businesses.length ? <ul className="mt-4 space-y-2">{city.businesses.slice(0, 2).map((business) => <li key={String(business.id)}><Link href={localePath(locale, `/business/${business.slug}`)}>{String(business.name)}</Link></li>)}</ul> : <p className="mt-4 text-sm">No business profile is published yet.</p>}
        </div>
        <aside className="panel-ad">
          <p className="text-xs font-semibold uppercase tracking-[0.16em]">Advertisement</p>
          {ad && typeof ad.destination_url === "string" ? (
            <a href={ad.destination_url}>
              <p className="mt-3 text-xs font-semibold uppercase tracking-[0.14em]">Sponsored</p>
              {typeof ad.media_url === "string" && ad.media_url ? <img className="mt-3 h-28 w-full rounded-xl object-cover" src={ad.media_url} alt={String(ad.alt_text || ad.title || "Sponsored")} /> : null}
              <p className="mt-3 font-serif text-2xl">{String(ad.title || "Sponsored placement")}</p>
            </a>
          ) : (
            <>
              <p className="mt-3 font-serif text-2xl">This banner is open.</p>
              <p className="mt-2 text-sm">No paid campaign is booked. A live advertisement is labelled Sponsored and does not change which story leads the news.</p>
              <Link className="mt-4 inline-block font-semibold" href={localePath(locale, "/advertising")}>Advertise on Rustenburg Today</Link>
            </>
          )}
        </aside>
      </section>

      <section>
        <h2 className="mb-3 font-serif text-3xl">Discover more</h2>
        <div className="explore-grid">
          {more.map(([href, label, icon]) => (
            <Link key={href} className="explore-tile" href={localePath(locale, href)}>
              <ExploreIcon name={icon} />
              <span className="text-sm font-semibold">{label}</span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

const shortcuts = [["/auth/sign-up", "Create account"], ["/community", "Community"], ["/tickets", "Tickets"], ["/property", "Property"], ["/safetrack", "SafeTrack"], ["/news", "News"], ["/jobs", "Jobs"]] as const;

const explore: Array<[string, string, string, string]> = [
  ["/news", "News", "Official headlines, one click from the original.", "news"],
  ["/business", "Business", "Profiles the owner has published.", "business"],
  ["/marketplace", "Marketplace", "Goods from sellers on this platform.", "market"],
  ["/jobs", "Work", "Vacancies with a real employer.", "work"],
  ["/events", "Events", "Published gatherings and tickets.", "events"],
  ["/property", "Property", "Listings from agents and owners.", "property"],
  ["/learn", "Learn", "Lessons and practice records.", "learn"],
  ["/map", "Places", "Public places on the city map.", "places"],
  ["/food", "Food", "Kitchens with a published profile.", "food"],
  ["/community", "Community", "Posts that have passed review.", "community"],
  ["/history/rustenburg", "Heritage", "The sourced story, from 1850.", "heritage"],
  ["/tools", "Tools", "Word count and files. No AI model.", "tools"],
];

const more: Array<[string, string, string]> = [
  ["/watch", "City watch", "watch"],
  ["/sports", "Sports", "events"],
  ["/tourism", "Tourism", "places"],
  ["/notices", "Notices", "story"],
  ["/radio", "Radio", "news"],
  ["/safetrack", "SafeTrack", "safety"],
  ["/desks", "City desks", "community"],
];
