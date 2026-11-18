import Link from "next/link";
import { localePath } from "@/lib/i18n";
import { listByTag } from "@/server/community";

export default async function TopicPage({ params }: { params: Promise<{ locale: string; tag: string }> }) {
  const { locale, tag } = await params;
  const clean = decodeURIComponent(tag).toLowerCase().replace(/[^a-z0-9_]/g, "");
  const posts = listByTag(clean);
  return (
    <div className="desk-page space-y-4">
      <h1 className="font-serif text-4xl">#{clean || "topic"}</h1>
      <p className="text-sm">Public posts that include this hashtag. A topic appears when someone publishes it.</p>
      {posts.length ? posts.map((post) => (
        <article key={String(post.id)} className="rounded-3xl bg-white p-5 dark:bg-white/5">
          <p className="text-sm text-emerald"><Link href={localePath(locale, `/people/${post.username}`)}>{String(post.display_name)}</Link> · {String(post.post_type)}</p>
          <p className="mt-2 whitespace-pre-wrap">{String(post.body)}</p>
          <Link className="mt-3 inline-block text-sm font-semibold" href={localePath(locale, `/community/${post.id}`)}>Open</Link>
        </article>
      )) : <p className="text-sm">Nothing is published with this hashtag yet.</p>}
    </div>
  );
}
