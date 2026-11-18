import { t } from "@/lib/i18n";
import { PageIntro, Prose } from "@/components/chrome";

export default async function AboutPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return (
    <div>
      <PageIntro locale={locale} kicker={t(locale, "positioning")} title={t(locale, "about")} />
      <Prose text={t(locale, "about.body")} />
      <p className="mt-6 max-w-3xl text-sm text-muted">{t(locale, "footer.notOfficial")}</p>
    </div>
  );
}
