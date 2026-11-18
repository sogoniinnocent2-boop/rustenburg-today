import Link from "next/link";
import { localePath } from "@/lib/i18n";
import { HiddenLocale, Notice, button, control } from "@/components/chrome";
import { liveAction } from "@/server/actions";
import { listNotices } from "@/server/shelf";
import { currentUser } from "@/server/session";

export default async function LivePage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ error?: string; notice?: string }> }) {
  const { locale } = await params;
  const query = await searchParams;
  const user = await currentUser();
  const notices = listNotices();
  return (
    <div className="desk-page space-y-6">
      <header>
        <h1 className="font-serif text-4xl">Live notices</h1>
        <p className="mt-2 max-w-2xl text-sm">Schedule a public notice that you plan to broadcast. The camera is not connected, so this is not a live stream, there is no viewer count, and nothing here is a recording.</p>
      </header>
      <Notice error={query.error} notice={query.notice} />
      {notices.length ? notices.map((notice) => (
        <article key={notice.id} className="desk-card">
          <p className="text-sm uppercase">{notice.status} · {notice.category}</p>
          <h2 className="font-serif text-2xl">{notice.title}</h2>
          <p className="text-sm"><Link href={localePath(locale, `/people/${notice.username}`)}>{notice.display_name}</Link> · {notice.starts_at.replace("T", " ")}</p>
          <p className="mt-2">{notice.note}</p>
          {user?.username === notice.username && notice.status === "scheduled" ? (
            <form action={liveAction} className="mt-3"><HiddenLocale locale={locale} /><input type="hidden" name="intent" value="end" /><input type="hidden" name="id" value={notice.id} /><button className={button}>Mark the notice ended</button></form>
          ) : null}
        </article>
      )) : <p className="text-sm">No live notice is on the board.</p>}
      {user ? (
        <form action={liveAction} className="desk-form max-w-xl space-y-3">
          <h2 className="font-serif text-2xl">Schedule a notice</h2>
          <HiddenLocale locale={locale} />
          <label className="desk-field">Title<input name="title" className={control} required /></label>
          <label className="desk-field">Category
            <select name="category" className={control}>
              {["community", "school", "business", "sport", "music", "study"].map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label className="desk-field">Starts<input name="starts" type="datetime-local" className={control} required /></label>
          <label className="desk-field">What people should expect<textarea name="note" className={control} required rows={4} /></label>
          <button className={button}>Publish the notice</button>
        </form>
      ) : <p className="text-sm"><Link href={localePath(locale, "/auth/sign-in")}>Sign in</Link> to schedule a notice.</p>}
    </div>
  );
}
