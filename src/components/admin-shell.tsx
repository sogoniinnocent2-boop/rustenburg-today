import Link from "next/link";
import { localePath, type Locale } from "@/lib/i18n";
import { signOutAction } from "@/server/actions";
import type { SessionUser } from "@/server/auth";

export function AdminShell({ locale, user, children }: { locale: Locale; user: SessionUser | null; children: React.ReactNode }) {
  return (
    <div className="desk-shell">
      <a className="skip-link" href="#content">Skip to the desk</a>
      <header className="desk-bar">
        <div>
          <p className="desk-kicker">Content owners</p>
          <p className="desk-title">Rustenburg Today</p>
        </div>
        <div className="desk-tools">
          {user && (user.roles.includes("administrator") || user.roles.includes("editor") || user.roles.includes("moderator")) ? (
            <Link href={localePath(locale, "/admin")}>Admin</Link>
          ) : null}
          <Link href={localePath(locale, "/department")}>Content desks</Link>
          {user ? <span>{user.displayName}</span> : null}
          <Link href={localePath(locale)}>Preview public site</Link>
          {user ? (
            <form action={signOutAction}>
              <input type="hidden" name="locale" value={locale} />
              <button type="submit">Sign out</button>
            </form>
          ) : null}
        </div>
      </header>
      <main id="content" className="desk-main">{children}</main>
      <footer className="desk-foot">The Product Of The Elite Crew (Pty) Ltd.</footer>
    </div>
  );
}
