import { redirect } from "next/navigation";
import { safeTrackAction } from "@/server/actions";
import { currentUser } from "@/server/session";
import { desk, openConcerns } from "@/server/safetrack";

export const metadata = { robots: { index: false, follow: false } };

export default async function SafeTrackDeskPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ error?: string; notice?: string }> }) {
  const { locale } = await params;
  const query = await searchParams;
  const user = await currentUser();
  if (!user) redirect(`/${locale}/auth/sign-in?next=/safetrack/desk`);
  let board: ReturnType<typeof desk>;
  try {
    board = desk(user);
  } catch (error) {
    const message = error instanceof Error ? error.message : "This desk is closed";
    return <p className="mx-auto max-w-3xl px-4 py-8">{message}</p>;
  }
  return (
    <div className="mx-auto grid max-w-5xl gap-6 px-4 py-8">
      <header className="glass-card grid gap-2 p-6">
        <h1 className="text-3xl font-semibold">Safety desk</h1>
        <p>This desk shows verification, incident status and access requests. It does not show live locations, coordinates or identity documents.</p>
        {query.error ? <p role="alert">{query.error}</p> : null}
        {query.notice ? <p role="status">Saved.</p> : null}
      </header>
      <section className="glass-card grid gap-3 p-6">
        <h2 className="text-xl font-semibold">Guardian claims</h2>
        {board.claims.length === 0 ? <p>No claims in this queue.</p> : board.claims.map((item) => (
          <form key={String(item.id)} action={safeTrackAction} className="grid gap-2 border-t border-white/40 py-3">
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="intent" value="review" />
            <input type="hidden" name="return" value="/safetrack/desk" />
            <input type="hidden" name="id" value={String(item.id)} />
            <p>{String(item.preferred_name)} · {String(item.relationship_type)} · {String(item.verification_status)}</p>
            <textarea name="note" required minLength={8} placeholder="What evidence was reviewed" className="rounded-xl border border-white/50 bg-white/70 px-3 py-2" />
            <span className="flex gap-2">
              <button name="decision" value="approve" className="rounded-full bg-[#101827] px-4 py-2 text-white" type="submit">Verify</button>
              <button name="decision" value="reject" className="rounded-full border px-4 py-2" type="submit">Reject</button>
            </span>
          </form>
        ))}
      </section>
      <section className="glass-card grid gap-2 p-6">
        <h2 className="text-xl font-semibold">Incidents</h2>
        {board.incidents.length === 0 ? <p>No incidents.</p> : (
          <ul>{board.incidents.map((item) => <li key={String(item.id)}>{String(item.reference_code)} · {String(item.incident_type)} · {String(item.status)}</li>)}</ul>
        )}
      </section>
      <section className="glass-card grid gap-3 p-6">
        <h2 className="text-xl font-semibold">Emergency access</h2>
        <p>An unverified organisation is denied. A life-threatening request needs two different reviewers. Disclosure expires after 24 hours and never opens a search of every household.</p>
        {board.requests.length === 0 ? <p>No requests.</p> : board.requests.map((item) => (
          <article key={String(item.id)} className="grid gap-2 border-t border-white/40 py-3">
            <p>{String(item.organisation_name)} · {String(item.scope)} · {String(item.status)}</p>
            <p>{String(item.legal_basis)}</p>
            {item.denial_reason ? <p>{String(item.denial_reason)}</p> : null}
            {item.status === "submitted" || item.status === "first_approval" ? (
              <form action={safeTrackAction} className="grid gap-2">
                <input type="hidden" name="locale" value={locale} />
                <input type="hidden" name="intent" value="decide" />
                <input type="hidden" name="return" value="/safetrack/desk" />
                <input type="hidden" name="id" value={String(item.id)} />
                <textarea name="note" required minLength={8} className="rounded-xl border border-white/50 bg-white/70 px-3 py-2" />
                <span className="flex gap-2">
                  <button name="decision" value="approve" className="rounded-full bg-[#101827] px-4 py-2 text-white" type="submit">Approve</button>
                  <button name="decision" value="deny" className="rounded-full border px-4 py-2" type="submit">Deny</button>
                </span>
              </form>
            ) : null}
            {item.status === "approved" ? (
              <form action={safeTrackAction}>
                <input type="hidden" name="locale" value={locale} />
                <input type="hidden" name="intent" value="disclose" />
                <input type="hidden" name="return" value="/safetrack/desk" />
                <input type="hidden" name="id" value={String(item.id)} />
                <button className="text-[#1d4e89]" type="submit">Disclose the approved scope for 24 hours</button>
              </form>
            ) : null}
          </article>
        ))}
      </section>
      <section className="glass-card grid gap-3 p-6">
        <h2 className="text-xl font-semibold">Confidential concerns</h2>
        {user.roles.includes("privacy_officer") ? (
          <ul>{openConcerns(user).map((item) => <li key={item.id}>{item.body}</li>)}</ul>
        ) : <p>Concern text is visible to a privacy officer. This desk does not show it to other staff.</p>}
      </section>
    </div>
  );
}
