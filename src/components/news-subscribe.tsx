import Link from "next/link";
import { localePath, t } from "@/lib/i18n";
import { HiddenLocale, button } from "@/components/chrome";
import { newsSubscribeAction } from "@/server/actions";
import { officialNewsSubscribed } from "@/server/alerts";

export function NewsSubscribe({
  locale,
  userId,
  highlight = false,
}: {
  locale: string;
  userId?: string | null;
  highlight?: boolean;
}) {
  const state = userId ? officialNewsSubscribed(userId) : { inApp: false, email: false };
  return (
    <section className={`news-subscribe${highlight ? " is-highlight" : ""}`} aria-label={t(locale, "home.subscribeTitle")} id="subscribe-news">
      <h2>{t(locale, "home.subscribeTitle")}</h2>
      <p>{t(locale, "home.subscribeBody")}</p>
      {highlight && userId && !state.inApp ? (
        <p className="mt-3 text-sm font-semibold text-emerald">{t(locale, "home.subscribePrompt")}</p>
      ) : null}
      {!userId ? (
        <div className="news-subscribe-actions">
          <Link className={button} href={`${localePath(locale, "/auth/sign-up")}?next=${encodeURIComponent(`/${locale}?subscribe=1`)}`}>
            {t(locale, "home.subscribeCreate")}
          </Link>
          <Link className={button} href={`${localePath(locale, "/auth/sign-in")}?next=${encodeURIComponent(`/${locale}?subscribe=1`)}`}>
            {t(locale, "signIn")}
          </Link>
        </div>
      ) : state.inApp ? (
        <div className="news-subscribe-actions">
          <p className="text-sm font-semibold text-emerald">{t(locale, "home.subscribeActive")}</p>
          <form action={newsSubscribeAction}>
            <HiddenLocale locale={locale} />
            <input type="hidden" name="intent" value="unsubscribe" />
            <input type="hidden" name="return" value={localePath(locale)} />
            <button className={button}>{t(locale, "home.unsubscribe")}</button>
          </form>
          <Link className={button} href={localePath(locale, "/account/notifications")}>
            {t(locale, "home.manageAlerts")}
          </Link>
        </div>
      ) : (
        <form action={newsSubscribeAction} className="news-subscribe-actions items-end">
          <HiddenLocale locale={locale} />
          <input type="hidden" name="intent" value="subscribe" />
          <input type="hidden" name="return" value={localePath(locale)} />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="email" value="yes" />
            {t(locale, "home.subscribeEmail")}
          </label>
          <button className={button}>{t(locale, "home.subscribeNow")}</button>
        </form>
      )}
      {userId && state.email ? <p className="mt-3 text-xs text-muted">{t(locale, "home.subscribeEmailOn")}</p> : null}
      {!userId ? null : (
        <p className="mt-3 text-xs text-muted">
          {t(locale, "home.subscribeNote")} · <Link href={localePath(locale, "/account/notifications")}>{t(locale, "home.manageAlerts")}</Link>
        </p>
      )}
    </section>
  );
}
