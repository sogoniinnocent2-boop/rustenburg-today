import Link from "next/link";
import { localePath } from "@/lib/i18n";
import { HiddenLocale, Money, Notice, button, control } from "@/components/chrome";
import { studioAction } from "@/server/actions";
import { all } from "@/server/db";
import { listDocuments } from "@/server/studio";
import { currentUser } from "@/server/session";

export default async function InvoicesPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ error?: string; notice?: string }> }) {
  const { locale } = await params;
  const query = await searchParams;
  const user = await currentUser();
  const documents = user ? listDocuments(user.id) : [];
  const businesses = user ? all<{ id: string; name: string }>("SELECT id, name FROM businesses WHERE owner_id = ? AND deleted_at IS NULL", user.id) : [];
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-4xl">Quotations and invoices</h1>
        <p className="mt-2 max-w-2xl text-sm">A business can write a quotation, invoice, or statement. The total is calculated on the server. This is not a payment, and Rustenburg Today has not collected the money.</p>
      </div>
      <Notice error={query.error} notice={query.notice} />
      {user && businesses.length ? (
        <form action={studioAction} className="grid max-w-xl gap-2">
          <HiddenLocale locale={locale} />
          <input type="hidden" name="intent" value="document" />
          <input type="hidden" name="return" value="/invoices" />
          <select name="business" className={control}>{businesses.map((business) => <option key={business.id} value={business.id}>{business.name}</option>)}</select>
          <select name="kind" className={control}><option value="quotation">Quotation</option><option value="invoice">Invoice</option><option value="statement">Statement</option></select>
          <input name="client" required placeholder="Client name" className={control} />
          <input name="item1" required placeholder="Line 1" className={control} />
          <input name="qty1" type="number" min={1} defaultValue={1} className={control} />
          <input name="price1" required placeholder="Price in rands" className={control} />
          <input name="item2" placeholder="Line 2, optional" className={control} />
          <input name="qty2" type="number" min={1} placeholder="Quantity" className={control} />
          <input name="price2" placeholder="Price in rands" className={control} />
          <textarea name="note" placeholder="Note, optional" className={control} />
          <button className={button}>Save document</button>
        </form>
      ) : <p className="text-sm">Sign in with a business profile to write a document. No sample business is listed.</p>}
      <section>
        <h2 className="font-serif text-2xl">Your documents</h2>
        {documents.length ? documents.map((item) => <p key={String(item.id)} className="text-sm"><Link href={localePath(locale, `/invoices/${item.id}`)}>{String(item.kind)} for {String(item.client_name)}</Link> · <Money cents={Number(item.total_cents)} /></p>) : <p className="text-sm">No document is on your account.</p>}
      </section>
    </div>
  );
}
