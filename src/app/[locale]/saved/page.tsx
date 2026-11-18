import Link from "next/link";
import { localePath } from "@/lib/i18n";
import { namedBookmarks } from "@/server/engage";
import { currentUser } from "@/server/session";

export default async function SavedPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const user = await currentUser();
  if (!user) {
    return (
      <section className="max-w-2xl space-y-3">
        <h1 className="font-serif text-4xl">Saved</h1>
        <p className="text-sm">Sign in to keep articles, jobs, events and listings in one place.</p>
        <Link className="text-sm font-semibold text-[#1d4e89]" href={localePath(locale, "/auth/sign-in")}>Sign in</Link>
      </section>
    );
  }
  const items = namedBookmarks(user.id);
  return (
    <section className="max-w-2xl space-y-4">
      <h1 className="font-serif text-4xl">Saved</h1>
      {items.length ? (
        <ul className="divide-y divide-[#A9B7C9]/50">
          {items.map((item) => (
            <li key={item.id} className="py-3 text-sm">
              <span className="uppercase tracking-wide text-[#1d4e89]">{item.type}</span>
              {item.href ? <Link className="mt-1 block font-serif text-2xl" href={localePath(locale, item.href)}>{item.title}</Link> : <p className="mt-1">{item.title}</p>}
            </li>
          ))}
        </ul>
      ) : <p className="text-sm">Nothing is saved on this account yet.</p>}
    </section>
  );
}
