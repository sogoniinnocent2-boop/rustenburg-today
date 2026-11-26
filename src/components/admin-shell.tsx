import Link from "next/link";
import { headers } from "next/headers";
import { localePath, t, type Locale, LOCALES, type MessageKey } from "@/lib/i18n";
import { signOutAction } from "@/server/actions";
import type { SessionUser } from "@/server/auth";
import { BrandLogo } from "@/components/brand-logo";

export async function AdminShell({ locale, user, children }: { locale: Locale; user: SessionUser | null; children: React.ReactNode }) {
  const path = (await headers()).get("x-rt-path") || `/${locale}`;
  const rest = path.replace(/^\/(en|tn|af)/, "") || "/";
  return (
    <div className="desk-shell" lang={locale}>
      <a className="skip-link" href="#content">{t(locale, "desk.skip")}</a>
      <header className="desk-bar">
        <Link href={localePath(locale)} className="desk-brand" aria-label={t(locale, "brand")}>
          <BrandLogo size="sm" />
          <span>
            <p className="desk-kicker">{t(locale, "desk.owners")}</p>
            <p className="desk-title">{t(locale, "brand")}</p>
          </span>
        </Link>
        <div className="desk-tools">
          {user && (user.roles.includes("administrator") || user.roles.includes("editor") || user.roles.includes("moderator")) ? (
            <Link href={localePath(locale, "/admin")}>{t(locale, "desk.admin")}</Link>
          ) : null}
          <Link href={localePath(locale, "/department")}>{t(locale, "desk.content")}</Link>
          {user ? <span>{user.displayName}</span> : null}
          <Link href={localePath(locale)}>{t(locale, "desk.preview")}</Link>
          {LOCALES.map((item) => (
            <Link key={item} href={`/${item}${rest}`} hrefLang={item} lang={item} aria-current={item === locale ? "page" : undefined}>
              {t(locale, `lang.${item}` as MessageKey)}
            </Link>
          ))}
          {user ? (
            <form action={signOutAction}>
              <input type="hidden" name="locale" value={locale} />
              <button type="submit">{t(locale, "signOut")}</button>
            </form>
          ) : null}
        </div>
      </header>
      <main id="content" className="desk-main">{children}</main>
      <footer className="desk-foot">{t(locale, "footer.credit")}</footer>
    </div>
  );
}
