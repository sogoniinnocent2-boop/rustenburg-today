import Link from "next/link";
import { notFound } from "next/navigation";
import { DeskIcon } from "@/components/desk-icon";
import { deskByKind } from "@/lib/desk-catalog";
import { formatMoney } from "@/lib/text";
import { localePath } from "@/lib/i18n";
import { boardAction } from "@/server/actions";
import { followingDesk, listDesk, pendingDesks } from "@/server/desks";
import { hasPermission } from "@/server/permissions";
import { currentUser } from "@/server/session";

const notices: Record<string, string> = {
  saved: "Saved.",
  held: "Saved for review. It is not on the public list.",
  preview: "Saved as a preview. Payments are not connected, so this is not a booking and not revenue.",
  unpaid: "Saved as unpaid. It goes live only after a signed payment webhook.",
  following: "You will get an in-app note when something new is published here.",
  unfollowed: "You will no longer get notes from this desk.",
  reviewed: "Review saved.",
};

export default async function DeskKindPage({ params, searchParams }: { params: Promise<{ locale: string; kind: string }>; searchParams: Promise<{ error?: string; notice?: string }> }) {
  const { locale, kind } = await params;
  const query = await searchParams;
  const spec = deskByKind(kind);
  if (!spec) notFound();
  const user = await currentUser();
  const rows = listDesk(kind, user?.id);
  const pending = user && hasPermission(user.id, "admin.access") && spec.mode === "hold" ? pendingDesks(kind) : [];
  const followed = user ? followingDesk(user.id, kind) : false;
  return (
    <div className="desk-page">
      <p className="text-sm"><Link href={localePath(locale, "/desks")}>City desks</Link></p>
      <header className="desk-hero">
        <DeskIcon group={spec.group} />
        <div>
          <h1 className="font-serif text-4xl text-[#101827]">{spec.title}</h1>
          <p className="mt-2 max-w-2xl text-[#343B46]">{spec.summary}</p>
        </div>
      </header>
      {query.error ? <p role="alert" className="desk-alert">{query.error}</p> : null}
      {query.notice && notices[query.notice] ? <p className="desk-ok">{notices[query.notice]}</p> : null}
      {user && spec.mode !== "personal" ? (
        <form action={boardAction}>
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="kind" value={kind} />
          <input type="hidden" name="intent" value="follow" />
          <button className="btn btn-line">{followed ? "Stop notes" : "Follow this desk"}</button>
        </form>
      ) : null}
      <section className="desk-list">
        {rows.length ? rows.map((row) => (
          <article key={row.id} className="desk-item">
            <p className="desk-kicker">{row.display_name}{row.status === "preview" ? " · Preview" : ""}{row.place ? ` · ${row.place}` : ""}</p>
            <h2 className="font-serif text-2xl">{row.title}</h2>
            <p className="mt-2 whitespace-pre-wrap text-sm">{row.body}</p>
            <p className="desk-meta">
              {row.starts_on ? `From ${row.starts_on}` : ""}
              {row.ends_on ? ` · Until ${row.ends_on}` : ""}
              {row.price_cents != null ? ` · ${formatMoney(row.price_cents)}` : ""}
              {row.source_url ? <> · <a href={row.source_url}>Source</a></> : null}
            </p>
            {row.status === "preview" ? <p className="desk-meta">Preview. Payments are not connected. This is not a booking and not revenue.</p> : null}
          </article>
        )) : <p className="desk-item">Nothing is published on this desk yet.</p>}
      </section>
      {pending.length ? (
        <section>
          <h2 className="font-serif text-2xl">Waiting for review</h2>
          <ul className="desk-list">
            {pending.map((row) => (
              <li key={row.id} className="desk-item">
                <p className="font-semibold">{row.title}</p>
                <p className="text-sm">{row.body}</p>
                <p className="desk-meta">{row.display_name}</p>
                <form action={boardAction} className="mt-3 flex gap-2">
                  <input type="hidden" name="locale" value={locale} />
                  <input type="hidden" name="kind" value={kind} />
                  <input type="hidden" name="intent" value="review" />
                  <input type="hidden" name="id" value={row.id} />
                  <button className="btn btn-dark" name="decision" value="publish">Publish</button>
                  <button className="btn btn-line" name="decision" value="close">Close</button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <form action={boardAction} className="desk-form">
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="kind" value={kind} />
        <h2 className="font-serif text-2xl">{user ? "Add to this desk" : "Sign in to add"}</h2>
        {user ? (
          <>
            <label>Title<input name="title" required minLength={3} maxLength={120} className="desk-field" /></label>
            <label>Details<textarea name="body" required minLength={2} maxLength={2000} className="desk-field" rows={4} /></label>
            <label>Place<input name="place" maxLength={120} className="desk-field" /></label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label>Starts<input type="date" name="starts" className="desk-field" /></label>
              <label>Ends<input type="date" name="ends" className="desk-field" /></label>
            </div>
            <label>Source link<input name="source" type="url" placeholder="https://" className="desk-field" /></label>
            {spec.mode === "income" ? <label>Amount in rands<input name="amount" inputMode="decimal" required placeholder="199.00" className="desk-field" /></label> : null}
            <button className="btn btn-dark">Save</button>
          </>
        ) : <Link className="btn btn-dark" href={localePath(locale, "/auth/sign-in")}>Sign in</Link>}
      </form>
    </div>
  );
}
