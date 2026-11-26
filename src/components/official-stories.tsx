import Link from "next/link";
import { localePath, t } from "@/lib/i18n";
import type { NewsStoryCard } from "@/server/newsedition";

export function OfficialStories({
  locale,
  stories,
  total,
  variant = "official",
}: {
  locale: string;
  stories: NewsStoryCard[];
  total: number;
  variant?: "official" | "headline";
}) {
  const title = variant === "headline" ? t(locale, "home.headlineNews") : t(locale, "home.latestOfficial");
  const kicker = variant === "headline" ? t(locale, "home.headlineKicker") : t(locale, "home.officialKicker");
  const href = variant === "headline" ? localePath(locale, "/news/official?display=headline") : localePath(locale, "/news/official");
  return (
    <section className="official-stories" aria-label={title}>
      <div className="home-section-head">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald">{kicker}</p>
          <h2 className="mt-2 font-serif text-4xl">{title}</h2>
        </div>
        <Link className="text-sm font-semibold text-[#1d4e89]" href={href}>
          {t(locale, "home.viewAllOfficial")}
        </Link>
      </div>
      {!stories.length ? (
        <p className="text-sm text-muted">{t(locale, "home.officialEmpty")}</p>
      ) : (
        <div className="official-grid">
          {stories.map((story) => {
            const href = localePath(locale, story.href);
            return (
              <article key={story.key} className="official-card">
                {story.image ? (
                  <Link href={href}>
                    <img src={story.image} alt="" />
                  </Link>
                ) : null}
                <div className="official-card-body">
                  <div className="flex flex-wrap gap-2">
                    <span className="official-badge">{t(locale, "home.originalBadge")}</span>
                    {story.displayType === "headline" ? <span className="official-badge official-badge-headline">Headline</span> : null}
                  </div>
                  <p className="text-xs uppercase tracking-[0.12em] text-muted">
                    {[story.category, story.author, story.published?.slice(0, 16).replace("T", " ")].filter(Boolean).join(" · ")}
                  </p>
                  <h3>
                    <Link href={href}>{story.headline}</Link>
                  </h3>
                  {story.summary ? <p className="text-sm text-[#405062] dark:text-[#DCE2EA]">{story.summary}</p> : null}
                  <Link className="mt-auto pt-2 text-sm font-semibold text-[#1d4e89]" href={href}>
                    {t(locale, "home.readFullStory")}
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      )}
      {total > stories.length ? (
        <p className="text-sm text-muted">
          {stories.length} of {total} ·{" "}
          <Link className="font-semibold text-[#1d4e89]" href={localePath(locale, "/news/official")}>
            {t(locale, "home.viewAllOfficial")}
          </Link>
        </p>
      ) : null}
    </section>
  );
}
