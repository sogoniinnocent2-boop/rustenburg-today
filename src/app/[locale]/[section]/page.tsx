import Link from "next/link";
import { notFound } from "next/navigation";
import { localePath, t } from "@/lib/i18n";
import { sectionBySlug } from "@/lib/sections";
import { divisionForSlug } from "@/lib/divisions";
import { Empty, HiddenLocale, Money, PageIntro, StoryCard, When, button, control } from "@/components/chrome";
import { newsCategories, listArticles, listCorrections, listDepartmentStories } from "@/server/editorial";
import { listDrafts, listPosts } from "@/server/community";
import { listPodcasts, listVideos, listTalent, radioDesk } from "@/server/media";
import { adProducts, listBusinesses, listProducts } from "@/server/commerce";
import { listCourses, listCreatorPosts, listEvents, listFixtures, listJobs, listRecords, moduleKeyForSection, publicMap, standings } from "@/server/city";
import { listGroups } from "@/server/platform";
import { publishedNews, radioState, wireDesk, breakingNews } from "@/server/citydesk";
import { departmentWires } from "@/server/multisource";
import { RadioMini } from "@/components/radio-mini";
import { deskAction, groupAction, postAction, topicAction } from "@/server/actions";
import { askCity, buildBriefing } from "@/server/engage";
import { aiStatus } from "@/server/ai";
import { currentUser } from "@/server/session";
import { MapView } from "@/components/map-view";

export default async function SectionPage({ params, searchParams }: { params: Promise<{ locale: string; section: string }>; searchParams: Promise<{ error?: string; notice?: string; q?: string; category?: string; soon?: string; view?: string }> }) {
  const { locale, section } = await params;
  const query = await searchParams;
  const meta = sectionBySlug(section);
  if (!meta) notFound();
  const user = await currentUser();
  const division = divisionForSlug(section);
  const intro = <PageIntro locale={locale} kicker={division ? t(locale, division.labelKey) : t(locale, "department")} title={t(locale, meta.titleKey)} summary={t(locale, meta.summaryKey)} disclaimer={meta.disclaimerKey ? t(locale, meta.disclaimerKey) : undefined} />;
  if (query.error) return <div>{intro}<p role="alert">{query.error}</p></div>;
  return (
    <div>
      {intro}
      {query.notice === "held" ? <p className="mb-4 text-sm">Your report is waiting for review. It is not on the public feed.</p> : null}
      {query.notice === "draft" ? <p className="mb-4 text-sm">Saved as a draft. It is not on the public feed.</p> : null}
      <div className="mb-6 flex flex-wrap gap-3 text-sm">
        <Link className="rounded-full bg-emerald px-4 py-2 font-semibold text-white" href={localePath(locale, `/${section}/new`)}>{t(locale, "create")}</Link>
        {section === "news" ? newsCategories().map((category) => <Link key={category.slug} className="rounded-full border px-3 py-2" href={localePath(locale, `/news/${category.slug}`)}>{category.name}</Link>) : null}
      </div>
      {section !== "news" ? <DepartmentStories locale={locale} section={section} /> : null}
      {section !== "news" ? <DepartmentWires locale={locale} section={section} /> : null}
      <SectionBody locale={locale} section={section} userId={user?.id || null} category={query.category} q={query.q} soon={query.soon === "1"} view={query.view} />
    </div>
  );
}

function DepartmentWires({ locale, section }: { locale: string; section: string }) {
  const wires = departmentWires(section, 8);
  if (!wires.length) return null;
  return (
    <section className="mb-8 space-y-3" lang={locale}>
      <h2 className="font-serif text-2xl">{t(locale, "ui.wires")}</h2>
      <p className="text-sm text-muted">{t(locale, "ui.wires.note")}</p>
      <div className="space-y-3">
        {wires.map((item) => (
          <article key={String(item.id)} className="news-row">
            <p className="news-kicker">{String(item.source_name || item.publisher)} · {String(item.region)}</p>
            <h3 className="font-serif text-xl">
              {typeof item.canonical_url === "string" && item.canonical_url.startsWith("http") ? (
                <a href={String(item.canonical_url)} rel="noopener noreferrer">{String(item.headline)}</a>
              ) : (
                <Link href={localePath(locale, `/news/${item.slug}`)}>{String(item.headline)}</Link>
              )}
            </h3>
            <p className="text-sm">{String(item.summary)}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function DepartmentStories({ locale, section }: { locale: string; section: string }) {
  const stories = listDepartmentStories(section, locale, 8);
  if (!stories.length) return null;
  return (
    <section className="mb-8 space-y-3" lang={locale}>
      <h2 className="font-serif text-2xl">{t(locale, "ui.deskUpdates")}</h2>
      <div className="grid gap-4 md:grid-cols-3">
        {stories.map((story) => (
          <StoryCard
            key={story.id}
            locale={locale}
            href={localePath(locale, `/news/${story.slug}`)}
            title={story.title}
            excerpt={story.excerpt}
            meta={`${story.author} · ${story.readingMinutes} min`}
            image={story.image}
            video={story.video}
            demo={story.demo}
          />
        ))}
      </div>
    </section>
  );
}

function SectionBody({ locale, section, userId, category, q, soon, view }: { locale: string; section: string; userId: string | null; category?: string; q?: string; soon?: boolean; view?: string }) {
  if (section === "news") {
    const news = listArticles({ locale, category, pageSize: 12 });
    const wires = publishedNews({ limit: 12 });
    const source = wireDesk();
    const corrections = listCorrections();
    const breaking = breakingNews();
    const deskStories = listDepartmentStories("news", locale, 12);
    if (!news.items.length && !wires.length && !breaking.length && !deskStories.length) return <Empty locale={locale} />;
    return (
      <div className="space-y-4">
        <p className="text-sm">{source ? `${source.active || 1} active wire source${(source.active || 1) === 1 ? "" : "s"} (including “${source.name}”). Last SAnews check ${source.checked ? source.checked.slice(0, 16) : "not yet"}.${source.error ? ` Last error: ${source.error}` : ""}` : "No wire sources are installed yet."} SAnews is one contributor among several. <a className="font-semibold text-[#1d4e89]" href="/api/v1/briefing.xml">Briefing feed</a></p>
        {breaking.length ? <ul className="space-y-2">{breaking.map((item) => <li key={String(item.id)} className="text-sm"><span className="font-semibold uppercase text-[#1d4e89]">{t(locale, "ui.breaking")}</span> · <Link href={localePath(locale, `/news/${item.slug}`)}>{String(item.headline)}</Link> · {String(item.publisher)}</li>)}</ul> : <p className="text-sm">{t(locale, "ui.noBreaking")}</p>}
        {userId ? <div className="flex flex-wrap gap-2">{newsCategories().map((item) => <form key={item.slug} action={topicAction}><input type="hidden" name="locale" value={locale} /><input type="hidden" name="category" value={item.slug} /><input type="hidden" name="return" value={localePath(locale, "/news")} /><button className="rounded-full border px-3 py-1 text-xs">{t(locale, "follow")} {item.name}</button></form>)}</div> : null}
        {deskStories.length ? <div className="grid gap-4 md:grid-cols-3">{deskStories.map((story) => <StoryCard key={story.id} locale={locale} href={localePath(locale, `/news/${story.slug}`)} title={story.title} excerpt={story.excerpt} meta={`${story.author} · ${t(locale, "ui.deskUpdate")}`} image={story.image} video={story.video} demo={story.demo} />)}</div> : null}
        {wires.map((item) => <article key={String(item.id)} className="news-row"><p className="news-kicker">{String(item.region)}{item.sponsored ? ` · ${t(locale, "sponsored")}` : ""}</p><h2 className="font-serif text-2xl"><Link href={localePath(locale, `/news/${item.slug}`)}>{String(item.headline)}</Link></h2><p className="text-sm">{String(item.summary)}</p><p className="text-xs text-muted">{String(item.publisher)}{item.author_name ? ` · ${item.author_name}` : ""}{typeof item.canonical_url === "string" && item.canonical_url.startsWith("http") ? <> · <a href={item.canonical_url}>{t(locale, "ui.openOriginal")}</a></> : null}</p></article>)}
        <div className="grid gap-4 md:grid-cols-3">{news.items.filter((story) => !deskStories.some((desk) => desk.id === story.id)).map((story) => <StoryCard key={story.id} locale={locale} href={localePath(locale, `/news/${story.slug}`)} title={story.title} excerpt={story.excerpt} meta={`${story.category} · ${story.readingMinutes} ${t(locale, "ui.min")}`} image={story.image} video={story.video} demo={story.demo} />)}</div>
        <section>
          <h2 className="font-serif text-2xl">{t(locale, "ui.corrections")}</h2>
          {corrections.length ? <ul className="mt-2 space-y-2">{corrections.map((item) => <li key={`${item.slug}-${item.created_at}`} className="text-sm"><Link className="font-semibold" href={localePath(locale, `/news/${item.slug}`)}>{item.title}</Link> · {item.note}</li>)}</ul> : <p className="text-sm">{t(locale, "ui.noCorrections")}</p>}
        </section>
      </div>
    );
  }
  if (section === "community") {
    const mode = view === "following" ? "following" : "discover";
    const drafts = view === "drafts" && userId ? listDrafts(userId) : [];
    const feed = view === "drafts" ? { items: [], total: 0 } : listPosts(userId, 1, mode);
    const groups = listGroups();
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2 text-sm">
          <Link className="rounded-full border px-3 py-1" href={localePath(locale, "/community")}>Discover</Link>
          <Link className="rounded-full border px-3 py-1" href={localePath(locale, "/community?view=following")}>Following</Link>
          {userId ? <Link className="rounded-full border px-3 py-1" href={localePath(locale, "/community?view=drafts")}>Drafts</Link> : null}
          <Link className="rounded-full border px-3 py-1" href={localePath(locale, "/books")}>Books</Link>
          <Link className="rounded-full border px-3 py-1" href={localePath(locale, "/live")}>Live notices</Link>
        </div>
        <p className="text-sm">Public posts, comments and follows. There is no private chat and no endless video feed. A video, when someone adds one, is a single YouTube or Vimeo post.</p>
        {view === "following" && !userId ? <p className="text-sm"><Link className="font-semibold" href={localePath(locale, "/auth/sign-in?next=/community")}>Sign in</Link> to see posts from people you follow, or <Link className="font-semibold" href={localePath(locale, "/auth/sign-up")}>create an account</Link> and write one.</p> : null}
        {view === "drafts" ? (drafts.length ? drafts.map((draft) => (
          <article key={draft.id} className="rounded-3xl bg-white p-5 dark:bg-white/5">
            <p className="text-sm text-emerald">Draft · {draft.post_type}</p>
            <p className="mt-2 whitespace-pre-wrap">{draft.body}</p>
            <form action={postAction} className="mt-3"><input type="hidden" name="locale" value={locale} /><input type="hidden" name="intent" value="publish" /><input type="hidden" name="id" value={draft.id} /><button className="text-sm font-semibold">Publish</button></form>
          </article>
        )) : <p className="text-sm">No drafts.</p>) : null}
        {view !== "drafts" && feed.items.length ? feed.items.map((post) => {
          const media = (post.media as Array<{ media_url: string; media_type: string; alt_text: string | null }>) || [];
          const photo = media.find((item) => item.media_type === "image");
          const tags = (post.tags as string[]) || [];
          return (
            <article key={String(post.id)} className="rounded-3xl bg-white p-5 dark:bg-white/5">
              <p className="text-sm text-emerald"><Link href={localePath(locale, `/people/${post.username}`)}>{String(post.display_name)}</Link> · {String(post.post_type)}{post.location_name ? ` · ${String(post.location_name)}` : ""}</p>
              {photo ? <img className="mt-3 max-h-80 w-full rounded-2xl object-cover" src={photo.media_url} alt={photo.alt_text || ""} /> : null}
              <p className="mt-2 whitespace-pre-wrap">{String(post.body)}</p>
              {tags.length ? <p className="mt-2 text-sm">{tags.map((tag) => <Link key={tag} className="mr-2 font-semibold" href={localePath(locale, `/topics/${tag}`)}>#{tag}</Link>)}</p> : null}
              <p className="mt-2 text-sm text-muted">{String(post.reactions)} reactions · {String(post.comments)} comments</p>
              <Link className="mt-3 inline-block text-sm font-semibold" href={localePath(locale, `/community/${post.id}`)}>{t(locale, "open")}</Link>
            </article>
          );
        }) : view === "following" ? <p className="text-sm">No public post from someone you follow yet.</p> : view === "drafts" ? null : <Empty locale={locale} />}
        <form action={groupAction} className="glass-card space-y-2 p-4">
          <input type="hidden" name="locale" value={locale} />
          <h2 className="font-serif text-2xl">Groups</h2>
          <input name="name" placeholder="Group name" className="w-full rounded-full border px-3 py-2" />
          <textarea name="description" placeholder="What this group is for" className="w-full rounded-2xl border px-3 py-2" />
          <button className="rounded-full bg-forest px-3 py-2 text-sm text-cloud">Open group</button>
        </form>
        {groups.length ? <ul className="space-y-2">{groups.map((group) => <li key={String(group.id)} className="glass-card p-3"><strong>{String(group.name)}</strong><p className="text-sm">{String(group.description)}</p><form action={groupAction}><input type="hidden" name="locale" value={locale} /><input type="hidden" name="intent" value="join" /><input type="hidden" name="id" value={String(group.id)} /><button className="text-sm font-semibold">Join</button></form></li>)}</ul> : <p className="text-sm text-muted">No public groups yet.</p>}
      </div>
    );
  }
  if (section === "podcasts") return grid(locale, listPodcasts(), (item) => ({ href: `/podcasts/${item.slug}`, title: String(item.title), excerpt: String(item.description), demo: Boolean(item.is_demo) }));
  if (section === "tv") return grid(locale, listVideos(), (item) => ({ href: `/tv/${item.slug}`, title: String(item.title), excerpt: String(item.description) }));
  if (section === "radio" || section === "music") {
    const desk = radioDesk();
    const air = radioState();
    return (
      <div className="space-y-6">
        <RadioMini name={air.name} state={air.state} stream={air.stream} programme={air.programme} reason={air.reason} />
        <p className="text-sm text-muted">Suggested slots, not a published schedule: Morning Briefing, Community Connect, News and Updates, Business and Opportunities, Drive Time, Music and Entertainment, Evening Conversations. A slot appears below only after it is saved.</p>
        <ul className="space-y-2">{desk.programmes.map((item) => <li key={String(item.id)} className="rounded-2xl bg-white p-4 dark:bg-white/5">{String(["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][Number(item.weekday)] || item.weekday)} {String(item.start_time)}–{String(item.end_time)} · {String(item.title)}</li>)}</ul>
        {section === "music" ? <p className="text-sm">{t(locale, "disclaimer.radio")} Personal music subscriptions are not a broadcast licence.</p> : null}
      </div>
    );
  }
  if (section === "talent") return grid(locale, listTalent(category), (item) => ({ href: `/talent/${item.id}`, title: String(item.stage_name), excerpt: String(item.biography), meta: String(item.talent_category) }));
  if (section === "marketplace") return grid(locale, listProducts({ q, category }), (item) => ({ href: `/marketplace/${item.slug}`, title: String(item.title), excerpt: String(item.description), meta: formatRand(item.price_cents) }));
  if (section === "jobs") return <div className="space-y-4"><p className="glass-card p-4 text-sm">Do not pay an employment application fee through this platform. An employer identity check is not proof that every vacancy from that employer is genuine. Report a listing that asks for money, banking details or an off-platform payment.</p><p className="text-sm">{soon ? <Link className="font-semibold text-[#1d4e89]" href={localePath(locale, "/jobs")}>All open listings</Link> : <Link className="font-semibold text-[#1d4e89]" href={localePath(locale, "/jobs?soon=1")}>Closing within 14 days</Link>}</p>{grid(locale, listJobs(soon ? { withinDays: 14 } : {}), (item) => ({ href: `/jobs/${item.id}`, title: String(item.title), excerpt: String(item.description), meta: `${String(item.job_type)}${item.closing_date ? ` · Closes ${String(item.closing_date).slice(0, 10)}` : ""}` }))}</div>;
  if (section === "learn") return grid(locale, listCourses(), (item) => ({ href: `/learn/${item.slug}`, title: String(item.title), excerpt: String(item.description), meta: Number(item.price_cents) ? formatRand(item.price_cents) : t(locale, "free") }));
  if (section === "events") return grid(locale, listEvents(), (item) => ({ href: `/events/${item.slug}`, title: String(item.title), excerpt: String(item.description), meta: String(item.start_at).slice(0, 16) }));
  if (section === "business") return grid(locale, listBusinesses(category), (item) => ({ href: `/business/${item.slug}`, title: String(item.name), excerpt: String(item.description), meta: item.verification_status === "verified" ? "Verified" : t(locale, "unverified") }));
  if (section === "advertising") return grid(locale, adProducts(), (item) => ({ href: "/advertising/new", title: String(item.name), excerpt: String(item.description), meta: formatRand(item.price_cents) }));
  if (section === "map") return <MapView locale={locale} signedIn={Boolean(userId)} points={publicMap().map((point) => ({ id: String(point.id), title: String(point.title), summary: String(point.summary || ""), category: String(point.category || ""), latitude: Number(point.latitude), longitude: Number(point.longitude), source: String(point.source_name || ""), sourceType: String(point.source_type || ""), sourceId: String(point.source_id || ""), verified: point.verification_status === "verified" }))} />;
  if (section === "ask") {
    const answer = q ? askCity(q, locale) : null;
    return (
      <div className="max-w-2xl space-y-4">
        <form method="get" className="space-y-3">
          <label className="block font-semibold" htmlFor="question">{t(locale, "ask.prompt")}</label>
          <input id="question" name="q" defaultValue={q || ""} className="w-full rounded-2xl border px-3 py-3" />
          <button className="rounded-full bg-emerald px-4 py-2 font-semibold text-white">{t(locale, "search")}</button>
        </form>
        {answer?.items.map((item) => <article key={`${item.entityType}-${item.entityId}`} className="rounded-2xl bg-white p-4 dark:bg-white/5"><p className="text-xs uppercase text-emerald">{item.entityType}</p><Link href={localePath(locale, item.href)} className="font-serif text-2xl">{item.title}</Link><p className="text-sm">{item.body}</p></article>)}
        {answer && !answer.items.length ? <p>{t(locale, "ask.empty")}</p> : null}
      </div>
    );
  }
  if (section === "briefing") {
    if (!userId) return <p><Link href={localePath(locale, "/auth/sign-in")}>{t(locale, "signIn")}</Link></p>;
    const briefing = buildBriefing(userId);
    const blocks = [
      ["news", briefing.news.map((item) => String(item.title))],
      ["events", briefing.events.map((item) => String(item.title))],
      ["jobs", briefing.jobs.map((item) => String(item.title))],
      ["deals", briefing.deals.map((item) => String(item.title))],
      ["notices", briefing.notices.map((item) => String(item.title))],
    ] as const;
    return <div className="grid gap-4 md:grid-cols-2">{blocks.map(([name, items]) => <section key={name} className="rounded-3xl bg-white p-5 dark:bg-white/5"><h2 className="font-serif text-2xl">{name}</h2>{items.length ? <ul className="mt-2 list-disc pl-5">{items.map((item) => <li key={item}>{item}</li>)}</ul> : <p className="text-sm text-muted">{t(locale, "empty")}</p>}</section>)}</div>;
  }
  if (section === "sports") {
    const teams = listRecords("team");
    const table = standings();
    const fixtures = listFixtures();
    return (
      <div className="space-y-8">
        {teams.length ? grid(locale, teams, (item) => ({ href: `/sports/${item.id}`, title: String(item.name), excerpt: String(item.description), meta: String(item.sport) })) : <Empty locale={locale} />}
        <section>
          <h2 className="font-serif text-2xl">Standings</h2>
          {table.length ? <ul className="mt-2 space-y-1">{table.map((row) => <li key={String(row.id)}>{String(row.name)} · {String(row.sport)} · {String(row.wins)}-{String(row.draws)}-{String(row.losses)}</li>)}</ul> : <p className="text-sm text-muted">{t(locale, "empty")}</p>}
        </section>
        <section>
          <h2 className="font-serif text-2xl">Fixtures</h2>
          {fixtures.length ? <ul className="mt-2 space-y-1">{fixtures.map((item) => <li key={String(item.id)}>{String(item.home_name)} {item.home_score == null ? "–" : String(item.home_score)} {String(item.away_name)} {item.away_score == null ? "" : String(item.away_score)}</li>)}</ul> : <p className="text-sm text-muted">{t(locale, "empty")}</p>}
          {userId && teams.length > 1 ? (
            <form action={deskAction} className="mt-4 max-w-md space-y-2">
              <HiddenLocale locale={locale} />
              <input type="hidden" name="intent" value="fixture" />
              <input type="hidden" name="return" value={localePath(locale, "/sports")} />
              <select name="home" className={control}>{teams.map((team) => <option key={`h-${String(team.id)}`} value={String(team.id)}>{String(team.name)}</option>)}</select>
              <select name="away" className={control}>{teams.map((team) => <option key={`a-${String(team.id)}`} value={String(team.id)}>{String(team.name)}</option>)}</select>
              <input name="start" type="datetime-local" required className={control} />
              <button className={button}>{t(locale, "save")}</button>
            </form>
          ) : null}
        </section>
      </div>
    );
  }
  if (section === "creators") {
    const posts = listCreatorPosts();
    if (!posts.length) return <Empty locale={locale} />;
    return grid(locale, posts, (item) => ({ href: `/creators/${item.id}`, title: String(item.title), excerpt: String(item.body), meta: item.sponsored ? `Sponsored · ${String(item.sponsor_label)}` : String(item.display_name) }));
  }
  if (section === "productivity") {
    return (
      <div className="max-w-2xl space-y-3 text-sm">
        <p>{aiStatus().reason} Nothing on this page sends your text to an outside model.</p>
        <p><Link className="font-semibold" href={localePath(locale, "/tools")}>Document tools</Link> count words and download a file on this server.</p>
        <p><Link className="font-semibold" href={localePath(locale, "/study")}>Study timer</Link>, <Link className="font-semibold" href={localePath(locale, "/languages")}>language practice</Link> and <Link className="font-semibold" href={localePath(locale, "/k53")}>K53 notes</Link> stay free.</p>
      </div>
    );
  }
  if (section === "property") {
    const rows = listRecords("property");
    return (
      <div className="space-y-4">
        <p className="text-sm">Published listings are here. Open one to request a viewing or a stay. A new listing stays off this page until it is reviewed. The price is the one the owner entered.</p>
        {userId ? <p className="text-sm"><Link className="font-semibold" href={localePath(locale, "/property/new")}>List a property</Link>. It stays off this page until it is reviewed.</p> : <p className="text-sm"><Link className="font-semibold" href={localePath(locale, "/auth/sign-in?next=/property")}>Sign in</Link> to request a viewing, or <Link className="font-semibold" href={localePath(locale, "/auth/sign-up")}>create an account</Link>.</p>}
        {rows.length ? grid(locale, rows, (item) => ({ href: `/property/${item.id}`, title: String(item.title || item.name), excerpt: String(item.description || ""), meta: item.price_cents ? formatRand(item.price_cents) : undefined })) : <Empty locale={locale} />}
      </div>
    );
  }
  const key = moduleKeyForSection(section);
  if (!key) return <Empty locale={locale} />;
  const rows = listRecords(key);
  if (!rows.length) return <Empty locale={locale} />;
  return grid(locale, rows, (item) => ({ href: `/${section}/${item.id}`, title: String(item.title || item.name), excerpt: String(item.description || item.biography || ""), meta: section === "notices" ? (item.expires_at ? `Valid until ${String(item.expires_at).slice(0, 16)}` : "No expiry recorded") : item.price_cents ? formatRand(item.price_cents) : undefined }));
}

function grid(locale: string, rows: Array<Record<string, unknown>>, map: (item: Record<string, unknown>) => { href: string; title: string; excerpt?: string; meta?: string; demo?: boolean }) {
  if (!rows.length) return <Empty locale={locale} />;
  return <div className="grid gap-4 md:grid-cols-3">{rows.map((row) => { const card = map(row); return <StoryCard key={String(row.id || card.title)} locale={locale} href={localePath(locale, card.href)} title={card.title} excerpt={card.excerpt} meta={card.meta} demo={card.demo} />; })}</div>;
}

function formatRand(value: unknown): string {
  return typeof value === "number" ? `R${Math.floor(value / 100).toLocaleString("en-ZA")}.${String(value % 100).padStart(2, "0")}` : "";
}

void Money;
void When;
