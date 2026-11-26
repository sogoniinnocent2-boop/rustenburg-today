import Link from "next/link";
import { localePath } from "@/lib/i18n";
import { newsNavCategories } from "@/lib/editorial-categories";
import type { NewsStoryCard } from "@/server/newsedition";
import { editorialCategoryPage, newsroomHomepage } from "@/server/newsedition";

function hrefFor(locale: string, story: NewsStoryCard) {
  if (story.external) return story.href;
  return localePath(locale, story.href.startsWith("/") ? story.href : `/news/${story.href}`);
}

function Meta({ story }: { story: NewsStoryCard }) {
  const bits = [
    story.category,
    story.original ? "Original" : story.source,
    story.author,
    story.published ? story.published.slice(0, 16).replace("T", " ") : null,
  ].filter(Boolean);
  return <p className="news-kicker">{bits.join(" · ")}</p>;
}

function StoryLink({ locale, story, className }: { locale: string; story: NewsStoryCard; className?: string }) {
  const href = hrefFor(locale, story);
  if (story.external) {
    return (
      <a className={className} href={href} rel="noopener noreferrer">
        {story.headline}
      </a>
    );
  }
  return (
    <Link className={className} href={href}>
      {story.headline}
    </Link>
  );
}

function RailCard({ locale, story }: { locale: string; story: NewsStoryCard }) {
  return (
    <article className="news-row">
      <Meta story={story} />
      <h3 className="font-serif text-xl leading-snug">
        <StoryLink locale={locale} story={story} />
      </h3>
      {story.summary ? <p className="mt-1 text-sm text-muted">{story.summary}</p> : null}
    </article>
  );
}

function SectionBlock({
  locale,
  title,
  summary,
  href,
  items,
}: {
  locale: string;
  title: string;
  summary?: string;
  href?: string;
  items: NewsStoryCard[];
}) {
  if (!items.length) return null;
  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="font-serif text-3xl">{title}</h2>
          {summary ? <p className="mt-1 text-sm text-muted">{summary}</p> : null}
        </div>
        {href ? (
          <Link className="text-sm font-semibold text-[#1d4e89]" href={localePath(locale, href)}>
            Open
          </Link>
        ) : null}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {items.map((story) => (
          <RailCard key={story.key} locale={locale} story={story} />
        ))}
      </div>
    </section>
  );
}

export function NewsroomHome({ locale }: { locale: string }) {
  const edition = newsroomHomepage(locale);
  return (
    <div className="space-y-10" lang={locale}>
      <nav className="flex flex-wrap gap-2 text-sm" aria-label="Editorial categories">
        {newsNavCategories().map((item) => (
          <Link key={item.slug} className="rounded-full border px-3 py-1.5" href={localePath(locale, `/news/${item.slug}`)}>
            {item.name}
          </Link>
        ))}
        <Link className="rounded-full border px-3 py-1.5" href={localePath(locale, "/search?type=news")}>
          Search news
        </Link>
      </nav>

      {edition.breaking.length ? (
        <section className="glass-card space-y-2 p-4" aria-label="Breaking news">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#1d4e89]">Breaking</p>
          <ul className="space-y-2">
            {edition.breaking.map((story) => (
              <li key={story.key} className="text-sm">
                <span className="font-semibold uppercase text-[#1d4e89]">Breaking</span>
                {" · "}
                <StoryLink locale={locale} story={story} className="font-semibold" />
                {story.published ? ` · ${story.published.slice(0, 16).replace("T", " ")}` : ""}
                {story.original ? "" : ` · ${story.source}`}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {edition.featured ? (
        <section className="glass-card overflow-hidden p-0">
          {edition.featured.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={edition.featured.image} alt="" className="h-64 w-full object-cover md:h-80" />
          ) : null}
          <div className="space-y-3 p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald">Featured</p>
            <h1 className="font-serif text-4xl leading-tight md:text-5xl">
              <StoryLink locale={locale} story={edition.featured} />
            </h1>
            {edition.featured.summary ? <p className="max-w-3xl text-lg text-muted">{edition.featured.summary}</p> : null}
            <Meta story={edition.featured} />
          </div>
        </section>
      ) : (
        <p className="text-sm text-muted">No featured story is ready. Editors mark a published article as featured when one should lead.</p>
      )}

      <SectionBlock locale={locale} title="Top stories" items={edition.top} href="/news/latest" />
      <SectionBlock locale={locale} title="Latest news" items={edition.latest} href="/news/latest" />
      <SectionBlock locale={locale} title="Most read" items={edition.mostRead} />
      <SectionBlock locale={locale} title="Trending" items={edition.trending} />

      <div className="grid gap-10 lg:grid-cols-2">
        {edition.sections.map((section) => (
          <SectionBlock
            key={section.slug}
            locale={locale}
            title={section.name}
            summary={section.summary}
            href={`/news/${section.slug}`}
            items={section.items}
          />
        ))}
      </div>

      {!edition.featured && !edition.latest.length && !edition.sections.length ? (
        <p className="glass-card p-6 text-sm">
          The newsroom is waiting for published original stories or approved wire headlines. Nothing is invented to fill this page.
        </p>
      ) : null}
    </div>
  );
}

export function EditorialCategoryView({
  locale,
  slug,
  page = 1,
}: {
  locale: string;
  slug: string;
  page?: number;
}) {
  const data = editorialCategoryPage(slug, page);
  if (!data) return null;
  const { category, featured, items, total, pageSize } = data;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="space-y-8" lang={locale}>
      <header className="glass-card px-6 py-6">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald">Newsroom</p>
        <h1 className="mt-2 font-serif text-4xl">{category.name}</h1>
        <p className="mt-2 max-w-2xl text-muted">{category.summary}</p>
      </header>
      <nav className="flex flex-wrap gap-2 text-sm" aria-label="Editorial categories">
        {newsNavCategories().map((item) => (
          <Link
            key={item.slug}
            className={`rounded-full border px-3 py-1.5 ${item.slug === slug ? "bg-[#101827] text-white" : ""}`}
            href={localePath(locale, `/news/${item.slug}`)}
          >
            {item.name}
          </Link>
        ))}
      </nav>
      {featured ? (
        <section className="glass-card space-y-3 p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald">Featured in {category.name}</p>
          <h2 className="font-serif text-3xl">
            <StoryLink locale={locale} story={featured} />
          </h2>
          {featured.summary ? <p className="text-muted">{featured.summary}</p> : null}
          <Meta story={featured} />
        </section>
      ) : null}
      {items.length ? (
        <div className="space-y-4">
          {items.map((story) => (
            <RailCard key={story.key} locale={locale} story={story} />
          ))}
        </div>
      ) : (
        <p className="glass-card p-6 text-sm">
          No published story is filed under {category.name} yet. Suitable coverage will appear here when editors publish it or when an approved wire is assigned.
        </p>
      )}
      {pages > 1 ? (
        <div className="flex flex-wrap gap-2 text-sm">
          {Array.from({ length: pages }, (_, index) => index + 1).map((n) => (
            <Link
              key={n}
              className={`rounded-full border px-3 py-1 ${n === data.page ? "bg-[#101827] text-white" : ""}`}
              href={localePath(locale, `/news/${slug}?page=${n}`)}
            >
              {n}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
