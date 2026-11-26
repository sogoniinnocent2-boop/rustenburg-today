import { redirect } from "next/navigation";
import { localePath, t } from "@/lib/i18n";
import { Field, HiddenLocale, Notice, PageIntro, button, control } from "@/components/chrome";
import { googleProfileAction } from "@/server/actions";
import { needsOAuthEmail } from "@/server/oauth";
import { currentUser } from "@/server/session";

export default async function GoogleProfilePage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ error?: string }> }) {
  const { locale } = await params;
  const query = await searchParams;
  const user = await currentUser();
  if (!user) redirect(localePath(locale, "/auth/sign-in"));
  if (user.status === "active") redirect(localePath(locale));
  const askEmail = needsOAuthEmail(user.email);
  return (
    <div className="mx-auto max-w-md">
      <PageIntro locale={locale} title={t(locale, "oauth.finish")} summary={askEmail ? t(locale, "oauth.emailNeeded") : t(locale, "oauth.profile")} />
      <Notice error={query.error} />
      <form action={googleProfileAction} className="space-y-3">
        <HiddenLocale locale={locale} />
        {askEmail ? (
          <Field label={t(locale, "email")}>
            <input name="email" type="email" required autoComplete="email" className={control} />
          </Field>
        ) : null}
        <Field label={t(locale, "dob")}>
          <input name="dateOfBirth" type="date" required className={control} />
        </Field>
        <label className="flex gap-2 text-sm">
          <input type="checkbox" name="terms" value="yes" required />
          {t(locale, "consent.terms")}
        </label>
        <label className="flex gap-2 text-sm">
          <input type="checkbox" name="guardian" value="yes" />
          {t(locale, "consent.guardian")}
        </label>
        <button className={button}>{t(locale, "save")}</button>
      </form>
    </div>
  );
}
