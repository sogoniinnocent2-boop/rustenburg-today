import Link from "next/link";
import { localePath, t } from "@/lib/i18n";
import type { NewsStoryCard } from "@/server/newsedition";

export function MainEditorialStory({ locale, story }: { locale: string; story: NewsStoryCard | null }) {
  if (!story || !story.original || story.external) {
    return (
      <section className="main-editorial is-empty" aria-label={t(locale, "home.mainEditorial")}>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald">{t(locale, "home.mainEditorialKicker")}</p>
        <h2 className="mt-2 font-serif text-3xl md:text-4xl">{t(locale, "home.mainEditorial")}</h2>
        <p className="mt-3 max-w-2xl text-sm text-muted">{t(locale, "home.mainEditorialEmpty")}</p>
      </section>
    );
  }

  const href = localePath(locale, story.href.startsWith("/") ? story.href : `/news/${story.href}`);
  const meta = [
    story.category,
    story.author,
    story.region,
    story.published ? story.published.slice(0, 16).replace("T", " ") : null,
  ].filter(Boolean);

  return (
    <section className="main-editorial" aria-label={t(locale, "home.mainEditorial")}>
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald">{t(locale, "home.mainEditorialKicker")}</p>
      <div className={`main-editorial-grid${story.image ? "" : " no-image"}`}>
        {story.image ? (
          <Link href={href} className="main-editorial-media">
            <img src={story.image} alt="" />
          </Link>
        ) : null}
        <div className="main-editorial-copy">
          <p className="news-kicker">{meta.join(" · ")}</p>
          <h2 className="mt-2 font-serif text-4xl leading-tight md:text-5xl">
            <Link href={href}>{story.headline}</Link>
          </h2>
          {story.summary ? <p className="story-summary max-w-2xl text-base text-[#334155] dark:text-[#DCE2EA]">{story.summary}</p> : null}
          <p className="mt-3 text-sm text-muted">Rustenburg Today · {story.source}</p>
          <Link className="mt-5 inline-flex rounded-full bg-emerald px-4 py-2 text-sm font-semibold text-white" href={href}>
            {t(locale, "home.readFullStory")}
          </Link>
        </div>
      </div>
    </section>
  );
}
