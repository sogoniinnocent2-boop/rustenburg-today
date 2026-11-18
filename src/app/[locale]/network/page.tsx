import { HiddenLocale, Notice, button, control } from "@/components/chrome";
import { quoteBoardAction } from "@/server/actions";
import { QUOTE_CATEGORIES, listOpenQuotes, myQuotes } from "@/server/commercial";
import { all } from "@/server/db";
import { AppError } from "@/server/errors";
import { currentUser } from "@/server/session";

export default async function NetworkPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ error?: string; notice?: string }> }) {
  const { locale } = await params;
  const query = await searchParams;
  const user = await currentUser();
  const mine = user ? myQuotes(user.id) : [];
  let board: Array<Record<string, unknown>> | null = null;
  if (user) {
    try { board = listOpenQuotes(user); }
    catch (error) { if (!(error instanceof AppError) || error.status !== 403) throw error; }
  }
  const businesses = user ? all<{ id: string; name: string }>("SELECT id, name FROM businesses WHERE owner_id = ? AND deleted_at IS NULL", user.id) : [];
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-4xl">Request a quote</h1>
        <p className="mt-2 max-w-2xl text-sm">Asking for a quotation is free. A request is visible to every business on an active Starter plan or above. It is not sold as an exclusive lead.</p>
      </div>
      <Notice error={query.error} notice={query.notice} />
      {user ? (
        <form action={quoteBoardAction} className="grid max-w-xl gap-2">
          <HiddenLocale locale={locale} />
          <select name="category" className={control}>{QUOTE_CATEGORIES.map((item) => <option key={item} value={item}>{item}</option>)}</select>
          <textarea name="message" required placeholder="What you need, and when" className={control} />
          <button className={button}>Send request</button>
        </form>
      ) : <p className="text-sm">Sign in to send a request. You do not need a paid plan.</p>}
      <section>
        <h2 className="font-serif text-2xl">Your requests</h2>
        {mine.length ? mine.map((item, index) => <p key={`${item.id}-${index}`} className="mt-2 text-sm">{String(item.category)} · {String(item.message)}{item.business ? ` · reply from ${item.business}: ${item.offer}` : " · no reply yet"}</p>) : <p className="text-sm">No request is on your account.</p>}
      </section>
      {board ? (
        <section className="space-y-3">
          <h2 className="font-serif text-2xl">Open requests</h2>
          {board.length ? board.map((item) => (
            <form key={String(item.id)} action={quoteBoardAction} className="glass-card grid gap-2 p-4">
              <HiddenLocale locale={locale} />
              <input type="hidden" name="intent" value="respond" />
              <input type="hidden" name="quote" value={String(item.id)} />
              <p className="text-sm">{String(item.category)} · {String(item.message)}</p>
              <select name="business" className={control}>{businesses.map((business) => <option key={business.id} value={business.id}>{business.name}</option>)}</select>
              <textarea name="message" required placeholder="Your quotation" className={control} />
              <button className={button}>Send quotation</button>
            </form>
          )) : <p className="text-sm">No open request is waiting.</p>}
        </section>
      ) : user ? <p className="text-sm">Reading requests needs an active Starter plan or above. The plan stays unpaid until payment is confirmed.</p> : null}
    </div>
  );
}
