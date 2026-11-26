import Link from "next/link";
import { localePath, t } from "@/lib/i18n";
import { Empty, HiddenLocale, Money, Notice, PageIntro, When, button, control } from "@/components/chrome";
import { publishedTickets } from "@/server/discover";
import { listMyTickets } from "@/server/platform";
import { ticketOrderAction, ticketScanAction, ticketTypeAction, complimentaryAction } from "@/server/actions";
import { currentUser } from "@/server/session";
import { hasPermission } from "@/server/permissions";
import { setting } from "@/server/store";
import { all } from "@/server/db";

export default async function TicketsPage({ params, searchParams }: { params: Promise<{ locale: string }> ; searchParams: Promise<{ error?: string; notice?: string }> }) {
  const { locale } = await params;
  const query = await searchParams;
  const user = await currentUser();
  const mine = user ? listMyTickets(user.id) : [];
  const canScan = user ? hasPermission(user.id, "tickets.scan") : false;
  const canManage = user ? hasPermission(user.id, "tickets.manage") : false;
  const payments = setting("payment_mode", "disabled");
  const owned = canManage && user ? all<{ id: string; title: string }>("SELECT id, title FROM events WHERE organiser_id = ? AND deleted_at IS NULL ORDER BY start_at DESC", user.id) : [];
  const rows = publishedTickets();
  const events = new Map<string, { title: string; slug: string; venue: string; start: string; ticketUrl: string; tickets: Array<Record<string, unknown>> }>();
  for (const row of rows) {
    const id = String(row.id);
    const current = events.get(id) || { title: String(row.title), slug: String(row.slug), venue: String(row.venue || ""), start: String(row.start_at || ""), ticketUrl: String(row.ticket_url || ""), tickets: [] };
    if (row.ticket_id) current.tickets.push(row);
    events.set(id, current);
  }
  const list = [...events.values()];
  return (
    <div>
      <PageIntro locale={locale} kicker={t(locale, "nav.tickets")} title="Find your experience. Book your place." summary="Published events and the ticket types their organisers have listed. The server calculates the total from the listed price. No platform fee is configured. A free ticket is issued straight away. A priced ticket stays unpaid until a signed payment arrives. Unpaid holds release after 15 minutes." />
      <Notice error={query.error} notice={query.notice === "issued" ? "Your free ticket is issued. The code is listed below." : query.notice === "unpaid" ? "This reservation is unpaid. A priced ticket is issued only after a signed payment." : query.notice} />
      <p className="mb-4 text-sm">Payment mode: {payments}. A free ticket is issued now. A priced ticket stays unpaid until a signed payment arrives.</p>
      {user ? null : <p className="mb-4 text-sm"><Link className="font-semibold" href={localePath(locale, "/auth/sign-in?next=/tickets")}>Sign in</Link> to reserve a ticket, or <Link className="font-semibold" href={localePath(locale, "/auth/sign-up")}>create an account</Link>.</p>}
      {user ? (
        <section className="mb-6 glass-card space-y-3 p-4">
          <h2 className="font-serif text-2xl">Your tickets</h2>
          {mine.length ? mine.map((ticket) => (
            <div key={String(ticket.code)} className="text-sm">
              <p>{String(ticket.title)}{ticket.venue ? ` · ${ticket.venue}` : ""} · {String(ticket.status)} · {String(ticket.payment_status)}</p>
              <p className="font-mono">{String(ticket.code)}</p>
              {ticket.status === "issued" ? (
                <form action={ticketScanAction} className="mt-1 flex flex-wrap gap-2">
                  <HiddenLocale locale={locale} />
                  <input type="hidden" name="intent" value="refund" />
                  <input type="hidden" name="code" value={String(ticket.code)} />
                  <input name="reason" required placeholder="Why you are asking for a refund" className={control} />
                  <button className={button}>Request refund</button>
                </form>
              ) : null}
            </div>
          )) : <p className="text-sm text-muted">No issued tickets yet. An unpaid reservation is not a ticket.</p>}
          {canScan ? (
            <form action={ticketScanAction} className="flex flex-wrap gap-2">
              <HiddenLocale locale={locale} />
              <input name="code" placeholder="Ticket code" className={control} />
              <input name="event" placeholder="Event id, optional" className={control} />
              <button className={button}>Check in</button>
            </form>
          ) : null}
        </section>
      ) : null}
      {list.length ? (
        <div className="space-y-4">
          {list.map((event) => (
            <article key={event.slug} className="glass-card p-5">
              <p className="text-sm text-emerald"><When locale={locale} value={event.start} />{event.venue ? ` · ${event.venue}` : ""}</p>
              <h2 className="mt-1 font-serif text-3xl text-forest"><Link href={localePath(locale, `/events/${event.slug}`)}>{event.title}</Link></h2>
              {event.tickets.length ? (
                <ul className="mt-3 space-y-2">
                  {event.tickets.map((ticket) => {
                    const capacity = Number(ticket.capacity || 0);
                    const reserved = Number(ticket.reserved_count || 0);
                    return (
                      <li key={String(ticket.ticket_id)} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-white/60 px-3 py-2 text-sm">
                        <span>{String(ticket.ticket_type)}</span>
                        <span><Money cents={Number(ticket.price_cents || 0)} />{capacity ? ` · ${Math.max(capacity - reserved, 0)} listed as available` : ""}</span>
                      </li>
                    );
                  })}
                </ul>
              ) : <p className="mt-3 text-sm text-muted">No ticket types have been listed for this event yet.</p>}
              <Link className="mt-3 inline-block text-sm font-semibold" href={localePath(locale, `/events/${event.slug}`)}>Open event</Link>
              {user && event.tickets.length ? (
                <form action={ticketOrderAction} className="mt-3 flex flex-wrap items-center gap-2">
                  <input type="hidden" name="locale" value={locale} />
                  <select name="ticket" className="rounded-full border px-3 py-2">{event.tickets.map((ticket) => <option key={String(ticket.ticket_id)} value={String(ticket.ticket_id)}>{String(ticket.ticket_type)}</option>)}</select>
                  <input name="quantity" type="number" min={1} max={8} defaultValue={1} className="w-20 rounded-full border px-3 py-2" />
                  <button className="rounded-full bg-forest px-3 py-2 text-sm text-cloud">{event.tickets.every((ticket) => Number(ticket.price_cents || 0) === 0) ? "Get free ticket" : "Reserve"}</button>
                </form>
              ) : null}
            </article>
          ))}
        </div>
      ) : <Empty locale={locale} />}
      {canManage && owned.length ? (
        <section className="glass-card mt-6 space-y-3 p-4">
          <h2 className="font-serif text-2xl">Organiser</h2>
          <form action={ticketTypeAction} className="grid gap-2">
            <HiddenLocale locale={locale} />
            <select name="event" className={control}>{owned.map((event) => <option key={event.id} value={event.id}>{event.title}</option>)}</select>
            <input name="name" required placeholder="Ticket type" className={control} />
            <input name="price" placeholder="Price in rands, such as 150.00" className={control} />
            <input name="capacity" type="number" min={0} placeholder="Capacity" className={control} />
            <button className={button}>Add ticket type</button>
          </form>
          <form action={complimentaryAction} className="grid gap-2">
            <HiddenLocale locale={locale} />
            <input name="ticket" required placeholder="Ticket type id" className={control} />
            <input name="email" type="email" required placeholder="Recipient account email" className={control} />
            <input name="quantity" type="number" min={1} max={8} defaultValue={1} className={control} />
            <input name="reason" required placeholder="Why this ticket is complimentary" className={control} />
            <button className={button}>Issue complimentary</button>
          </form>
        </section>
      ) : null}
    </div>
  );
}
