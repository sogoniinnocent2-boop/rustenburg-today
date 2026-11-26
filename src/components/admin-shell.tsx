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
          <p className="desk-kicker">Monitoring desk</p>
          <p className="desk-title">Rustenburg Today</p>
        </div>
        <div className="desk-tools">
          <Link href={localePath(locale, "/admin")}>Overview</Link>
          <Link href={localePath(locale, "/department")}>Departments</Link>
          {user ? <span>{user.displayName}</span> : null}
          <Link href={localePath(locale)}>Open the public site</Link>
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
