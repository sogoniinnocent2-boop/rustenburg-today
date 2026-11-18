import Link from "next/link";
import { DESK_GROUPS, desksIn } from "@/lib/desk-catalog";
import { localePath } from "@/lib/i18n";
import { deskCounts } from "@/server/desks";
import { DeskIcon } from "@/components/desk-icon";

export default async function DesksPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const counts = deskCounts();
  return (
    <div className="desk-page">
      <header className="desk-hero">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#1d4e89]">City desks</p>
        <h1 className="mt-2 font-serif text-4xl text-[#101827] md:text-5xl">Eighty desks. Empty until someone publishes.</h1>
        <p className="mt-3 max-w-2xl text-[#343B46]">Schools, stories, talent, business and neighbourhood notes live here. A priced desk is a preview until payments are connected. News, jobs, notices and core lessons stay free.</p>
      </header>
      {DESK_GROUPS.map((group) => (
        <section key={group.id} className="desk-band" id={group.id}>
          <h2 className="font-serif text-2xl">{group.title}</h2>
          <div className="desk-grid">
            {desksIn(group.id).map((desk) => (
              <Link key={desk.kind} className="desk-card" href={localePath(locale, `/desks/${desk.kind}`)}>
                <DeskIcon group={desk.group} />
                <span>
                  <span className="desk-title">{desk.title}</span>
                  <span className="desk-note">{desk.summary}</span>
                  <span className="desk-meta">{counts[desk.kind] ? `${counts[desk.kind]} published` : "Nothing published yet"}{desk.mode === "income" ? " · Preview only" : ""}{desk.mode === "personal" ? " · Private" : ""}{desk.mode === "hold" ? " · Reviewed first" : ""}</span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
