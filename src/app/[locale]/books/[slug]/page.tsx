import Link from "next/link";
import { notFound } from "next/navigation";
import { localePath } from "@/lib/i18n";
import { Money, Notice, Prose } from "@/components/chrome";
import { readBook } from "@/server/shelf";
import { currentUser } from "@/server/session";

export default async function BookPage({ params, searchParams }: { params: Promise<{ locale: string; slug: string }>; searchParams: Promise<{ notice?: string }> }) {
  const { locale, slug } = await params;
  const query = await searchParams;
  const user = await currentUser();
  const book = readBook(slug, user?.id);
  if (!book) notFound();
  return (
    <article className="desk-page max-w-2xl space-y-4">
      <p className="text-sm"><Link href={localePath(locale, "/books")}>Books</Link></p>
      <h1 className="font-serif text-4xl">{book.title}</h1>
      <p className="text-sm">{book.display_name} · <Link href={localePath(locale, `/people/${book.username}`)}>@{book.username}</Link> · {book.language} · {book.price_cents ? <Money cents={book.price_cents} /> : "Free"} · {book.status}</p>
      <Notice notice={query.notice} />
      <p>{book.description}</p>
      <h2 className="font-serif text-2xl">Sample</h2>
      <Prose text={book.sample} />
      {book.readable ? (
        <>
          <h2 className="font-serif text-2xl">Full text</h2>
          <Prose text={book.body} />
        </>
      ) : <p className="text-sm">The rest of this book stays with the author. A preview is not a purchase, and this page cannot mark it paid.</p>}
    </article>
  );
}
