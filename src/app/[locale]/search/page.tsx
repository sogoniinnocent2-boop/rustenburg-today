import Link from "next/link";
import { localePath, t } from "@/lib/i18n";
import { Empty, Notice, PageIntro } from "@/components/chrome";
import { SearchBox } from "@/components/search-box";
import { liveCampaigns } from "@/server/commerce";
import { searchLibraryAction } from "@/server/actions";
import { searchPath, searchPlatform, rememberSearch, listSavedSearches } from "@/server/search";
import { currentUser } from "@/server/session";

export default async function SearchPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ q?: string; type?: string; error?: string; notice?: string }> }) {
  const { locale } = await params;
  const query = await searchParams;
  const q = query.q || "";
  const user = await currentUser();
  if (q) rememberSearch(user?.id || null, q);
  const found = q ? searchPlatform(q, { locale, types: query.type ? [query.type] : undefined }) : { items: [], total: 0 };
  const sponsored = q ? liveCampaigns("homepage-banner").filter((ad) => String(ad.title).toLowerCase().includes(q.toLowerCase())) : [];
  const saved = user ? listSavedSearches(user.id) : [];
  return (
    <div>
      <PageIntro locale={locale} title={t(locale, "search")} summary={t(locale, "disclaimer.ask")} />
      <Notice error={query.error} notice={query.notice} />
      <SearchBox locale={locale} initial={q} />
      {user && q ? <form action={searchLibraryAction} className="mb-4 flex gap-2"><input type="hidden" name="locale" value={locale} /><input type="hidden" name="q" value={q} /><button className="rounded-full border px-3 py-1 text-sm" name="intent" value="save">Save search</button><button className="rounded-full border px-3 py-1 text-sm" name="intent" value="clear">Clear history</button></form> : null}
      {saved.length ? <ul className="mb-4 text-sm">{saved.map((item) => <li key={String(item.id)}><Link href={localePath(locale, `/search?q=${encodeURIComponent(String(item.query))}`)}>{String(item.query)}</Link></li>)}</ul> : null}
      {sponsored.length ? <section aria-label={t(locale, "sponsored")} className="mb-6 space-y-2">{sponsored.map((ad) => <a key={String(ad.id)} className="glass-card block p-4" href={`/api/v1/ads/${ad.id}/click`}><span className="text-xs font-bold uppercase">{t(locale, "sponsored")}</span><span className="mt-1 block font-serif text-2xl">{String(ad.title)}</span></a>)}</section> : null}
      {!q ? <Empty locale={locale} /> : null}
      {q && !found.items.length ? <p>{t(locale, "ask.empty")}</p> : null}
      <ul className="space-y-3">
        {found.items.map((item) => (
          <li key={`${item.entityType}-${item.entityId}-${item.language}`} className="glass-card p-4">
            <p className="text-xs uppercase text-emerald">{item.entityType === "wire" ? "News" : item.entityType} · {item.language}</p>
            <Link className="font-serif text-2xl" href={localePath(locale, searchPath(item))}>{item.title}</Link>
            <p className="text-sm text-muted">{item.body}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
