import Link from "next/link";
import { localePath } from "@/lib/i18n";
import { cityWatch } from "@/server/citydesk";

export default async function WatchPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const notices = cityWatch();
  return (
    <section className="max-w-3xl space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#1d4e89]">City Watch</p>
        <h1 className="mt-2 font-serif text-4xl">Published local notices</h1>
        <p className="mt-2 text-sm">This list shows notices that are published on Rustenburg Today. It is not an official municipal channel. A notice leaves the list when its expiry time passes. Nothing is added here to fill the page.</p>
      </div>
      {notices.length ? (
        <ul className="space-y-4">
          {notices.map((notice) => (
            <li key={String(notice.id)} className="glass-card p-4">
              <p className="text-xs uppercase text-[#1d4e89]">{String(notice.notice_type)} · Filed by {String(notice.display_name)}</p>
              <h2 className="font-serif text-2xl"><Link href={localePath(locale, `/notices/${notice.id}`)}>{String(notice.title)}</Link></h2>
              <p className="mt-2 text-sm">{String(notice.description)}</p>
              <p className="mt-2 text-xs">Published {String(notice.created_at).slice(0, 16)} · Updated {String(notice.updated_at).slice(0, 16)} · {notice.expires_at ? `Valid until ${String(notice.expires_at).slice(0, 16)}` : "No expiry recorded"}</p>
            </li>
          ))}
        </ul>
      ) : <p className="text-sm">No published notice is current.</p>}
    </section>
  );
}
