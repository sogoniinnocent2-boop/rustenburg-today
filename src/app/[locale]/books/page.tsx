import Link from "next/link";
import { localePath } from "@/lib/i18n";
import { HiddenLocale, Money, Notice, button, control } from "@/components/chrome";
import { bookAction } from "@/server/actions";
import { listBooks } from "@/server/shelf";
import { currentUser } from "@/server/session";
import { setting } from "@/server/store";

export default async function BooksPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ error?: string; notice?: string }> }) {
  const { locale } = await params;
  const query = await searchParams;
  const user = await currentUser();
  const books = listBooks();
  return (
    <div className="desk-page space-y-6">
      <header>
        <h1 className="font-serif text-4xl">Books</h1>
        <p className="mt-2 max-w-2xl text-sm">Write a book here and keep the rights to it. A free book can be read in full. A priced book shows a sample. Payment mode is {setting("payment_mode", "disabled")}, so a price opens as a preview and is not a sale.</p>
      </header>
      <Notice error={query.error} notice={query.notice} />
      {books.length ? (
        <ul className="desk-grid">
          {books.map((book) => (
            <li key={book.slug}>
              <Link className="desk-card" href={localePath(locale, `/books/${book.slug}`)}>
                <strong>{book.title}</strong>
                <p>{book.display_name} · {book.language}</p>
                <p>{book.description}</p>
                <p>{book.price_cents ? <Money cents={book.price_cents} /> : "Free"} · {book.status}</p>
              </Link>
            </li>
          ))}
        </ul>
      ) : <p className="text-sm">No book is published yet.</p>}
      {user ? (
        <form action={bookAction} className="desk-form max-w-xl space-y-3">
          <h2 className="font-serif text-2xl">Write a book</h2>
          <HiddenLocale locale={locale} />
          <label className="desk-field">Title<input name="title" className={control} required /></label>
          <label className="desk-field">Description<textarea name="description" className={control} required rows={3} /></label>
          <label className="desk-field">Language<select name="language" className={control} defaultValue={locale}><option value="en">English</option><option value="tn">Setswana</option><option value="af">Afrikaans</option></select></label>
          <label className="desk-field">Sample readers can see<textarea name="sample" className={control} required rows={4} /></label>
          <label className="desk-field">Full text<textarea name="body" className={control} required rows={8} /></label>
          <label className="desk-field">Price in rand, or 0 for free<input name="price" className={control} placeholder="0" /></label>
          <label className="flex gap-2 text-sm"><input type="checkbox" name="rights" value="yes" required />I hold the rights to this text. This is not a claim of piracy protection.</label>
          <button className={button}>Publish the book</button>
        </form>
      ) : <p className="text-sm"><Link href={localePath(locale, "/auth/sign-in")}>Sign in</Link> to write a book.</p>}
    </div>
  );
}
