import Link from "next/link";
import { localePath, t } from "@/lib/i18n";
import { PageIntro } from "@/components/chrome";

const desks = [
  ["podcasts", "dept.podcasts", "sum.podcasts"],
  ["tv", "dept.tv", "sum.tv"],
  ["radio", "dept.radio", "sum.radio"],
  ["music", "dept.music", "sum.music"],
  ["creators", "dept.creators", "sum.creators"],
] as const;

export default async function MediaPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return (
    <div>
      <PageIntro locale={locale} kicker={t(locale, "nav.media")} title={t(locale, "nav.media")} summary="Podcasts, television, radio, music and creator desks." />
      <div className="grid gap-4 md:grid-cols-2">
        {desks.map(([slug, title, summary]) => (
          <Link key={slug} href={localePath(locale, `/${slug}`)} className="glass-card lift block p-5">
            <span className="font-serif text-3xl text-forest">{t(locale, title)}</span>
            <span className="mt-2 block text-sm">{t(locale, summary)}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
