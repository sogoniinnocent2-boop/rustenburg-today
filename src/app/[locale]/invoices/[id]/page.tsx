import { notFound } from "next/navigation";
import { Money, Notice } from "@/components/chrome";
import { readDocument } from "@/server/studio";
import { currentUser } from "@/server/session";

export default async function InvoicePage({ params, searchParams }: { params: Promise<{ locale: string; id: string }>; searchParams: Promise<{ notice?: string }> }) {
  const { id } = await params;
  const query = await searchParams;
  const user = await currentUser();
  const record = user ? readDocument(user.id, id) : null;
  if (!record) notFound();
  const total = Number(record.document.total_cents);
  return (
    <article className="space-y-4">
      <Notice notice={query.notice} />
      <h1 className="font-serif text-4xl capitalize">{String(record.document.kind)}</h1>
      <p className="text-sm">{String(record.document.business)} · {String(record.document.client_name)}</p>
      <p className="text-sm">This document was written by the business. It is not proof that Rustenburg Today received a payment.</p>
      <ul className="space-y-2">
        {record.lines.map((line, index) => <li key={index} className="text-sm">{String(line.description)} · {String(line.quantity)} × <Money cents={Number(line.unit_cents)} /></li>)}
      </ul>
      <p className="font-semibold">Total <Money cents={total} /></p>
      {record.document.note ? <p className="text-sm">{String(record.document.note)}</p> : null}
    </article>
  );
}
