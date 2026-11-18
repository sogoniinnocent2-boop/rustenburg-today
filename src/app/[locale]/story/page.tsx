import Link from "next/link";
import { localePath } from "@/lib/i18n";
import { FactRibbon } from "@/components/fact-ribbon";
import { HiddenLocale, Notice, button, control } from "@/components/chrome";
import { studioAction } from "@/server/actions";
import { pendingHistoryNotes } from "@/server/heritage";
import { hasPermission } from "@/server/permissions";
import { currentUser } from "@/server/session";

const source = "https://www.sahistory.org.za/article/rustenburg-timeline-1850-2001";

const chapters: Array<{ id: string; kind: string; title: string; body: string }> = [
  { id: "before-the-name", kind: "Source, not a date", title: "Before Rustenburg had its name", body: "The name on this page starts with the recorded town. People lived in this landscape before that. South African History Online keeps a separate article on the prehistory of the Rustenburg area. This chapter does not assign a year to that period and does not copy the article." },
  { id: "earlier-settlement", kind: "Source, not a date", title: "Earlier settlement and Iron Age history", body: "The same prehistory article is the place SAHO discusses earlier settlement and metalworking. An Iron Age date is not stated here, because this desk has not verified one from that page. Treat any early century as unsettled until you read the source." },
  { id: "sotho-tswana", kind: "Interpretation needs the source", title: "Sotho-Tswana history", body: "Sotho-Tswana communities are part of the region’s history. This page does not summarise their political history from memory and does not invent a migration date. SAHO’s community-histories article is the linked starting point." },
  { id: "bakwena", kind: "Named, not dated here", title: "BaKwena history", body: "BaKwena history belongs with the community histories, not with a date invented for this page. No founding year for a BaKwena settlement is stated here." },
  { id: "bafokeng", kind: "Fact and limit", title: "BaFokeng history and Phokeng", body: "Phokeng is named in the SAHO timeline for a later political event: an ANC branch there in 1990, and arrests of that branch’s executive on 15 March 1991. This page does not date the earlier arrival of the BaFokeng. That earlier history has to come from the community sources, not from a guess." },
  { id: "founding", kind: "Dated fact", title: "The arrival and founding of Rustenburg", body: "The SAHO timeline records a Hervormde congregation on 16 November 1850, 10 December 1850 as the birth of Rustenburg, and 1851 as the year it was officially founded as an administrative centre. It records a Volksraad meeting in the town on 17–19 March 1852." },
  { id: "nineteenth", kind: "Dated fact", title: "Nineteenth-century political conflicts", body: "The timeline records a British annexation proclamation on 12 April 1877. It also records Paul Kruger, a Rustenburg resident, elected president in 1883. Those are entries on a timeline, not a full political history of the century." },
  { id: "siege", kind: "Dated fact", title: "The First Anglo-Boer War and the siege", body: "The siege of Rustenburg is recorded as beginning on 27 December 1880 at a fort at the foot of the Magaliesberg, and ending on 30 March 1881. The page does not add a troop count or a quotation." },
  { id: "south-african-war", kind: "Dated fact", title: "The South African War", body: "The war is recorded as declared on 11 October 1899. The timeline records occupation of the town in 1900 and the Treaty of Vereeniging on 31 May 1902. No battle narrative is added beyond those entries." },
  { id: "communities", kind: "Dated fact, incomplete", title: "The development of local communities", body: "The timeline records Ali Ismail opening a store in 1883 as Indian settlement continued despite later restrictions. Afrikaans, African, Indian and worker histories are larger than that one entry. The community-histories article is the next source, and it is not copied here." },
  { id: "colonialism", kind: "Source, not a land audit", title: "Colonialism, land and segregation", body: "Annexation in 1877 is the dated colonial entry used above. SAHO’s article on Rustenburg as a segregated city is the source for how separation was built into the town. This page does not invent farm names, title-deed dates or a map of who held which land." },
  { id: "apartheid", kind: "Dated fact", title: "Apartheid, forced removals and resistance", body: "The timeline records the National Party coming to power in 1948 and a nightly curfew siren after which Black people were not allowed in the streets. It records Tlhabane’s extensions and removals, and the moving of Indian residents from the town centre to Zinniaville. It records township protests in June 1976. Those entries describe forced separation and resistance. They are not a complete account." },
  { id: "mining", kind: "Dated fact", title: "The development of mining", body: "The timeline records commercial chrome attempts in 1921 and Rustenburg Chrome Mines in 1938. This chapter stops at those dated entries. It is not a production history." },
  { id: "platinum", kind: "Dated fact", title: "The rise of platinum", body: "The timeline records De Kroon Platinums in 1925 and Rustenburg Platinum Mines in 1940. Later company history, ownership and output are not reconstructed here." },
  { id: "mining-communities", kind: "Dated fact, no statistic", title: "Mining, communities and economic development", body: "The timeline records a memorandum handed to Implats in December 2001. Employment, land and environmental consequences need the mining and municipal sources themselves. No jobs figure, wage or export number is stated on this page." },
  { id: "democracy", kind: "Dated fact", title: "The democratic transition", body: "The timeline records an ANC branch in Phokeng in 1990, arrests of that branch’s executive in 1991, and the ANC’s win in the 1994 election, with Popo Molefe recorded as premier of the new North West." },
  { id: "modern", kind: "Description, no census", title: "Modern Rustenburg", body: "Rustenburg is a mining and commercial centre in North West, beside the Magaliesberg. This page does not invent a population, a growth rate or a live project status. A number belongs to a named Statistics South Africa release or a municipal document, with its date." },
  { id: "city-life", kind: "Platform rule", title: "Economy, education, sport, tourism and culture", body: "Schools, sport, tourism, culture and trade are sections of this platform. A school, club, route or business appears there only when a real record is published. This chapter does not fill those sections with examples." },
  { id: "challenges", kind: "No live status", title: "Current development challenges", body: "Water, work, housing, mining impacts and municipal services are argued in public documents. This page does not declare which project is on track. Read the municipality’s own publications and a dated official release before repeating a status." },
  { id: "future", kind: "Not a forecast", title: "The future of Rustenburg", body: "The next chapter is not a prediction. Work, learning, events and businesses show a record only when someone publishes a real one. A memory or a correction can be sent below. It stays unpublished until an editor checks the source and the permission." },
];

const timeline: Array<{ when: string; title: string; note: string }> = [
  { when: "10 December 1850", title: "Birth of the town", note: "Recorded by SAHO as the birth of Rustenburg." },
  { when: "1851", title: "Official founding", note: "Recorded as founded for the surrounding region’s administration." },
  { when: "17–19 March 1852", title: "Volksraad meeting", note: "A full council meeting is recorded in the town." },
  { when: "27 December 1880", title: "Siege begins", note: "Recorded at a fort at the foot of the Magaliesberg. It ends on 30 March 1881." },
  { when: "11 October 1899", title: "South African War", note: "War is recorded as declared. The Treaty of Vereeniging is dated 31 May 1902." },
  { when: "1925 and 1940", title: "Platinum companies", note: "De Kroon Platinums, then Rustenburg Platinum Mines, as dated on the SAHO timeline." },
  { when: "1948 onwards", title: "Apartheid policy", note: "National Party rule and the Rustenburg curfew are recorded. Removals and Zinniaville follow in later entries." },
  { when: "1994", title: "Democratic election", note: "The ANC win and Popo Molefe’s premiership of North West are recorded." },
];

const facts = timeline.map((item) => `${item.when}: ${item.title}. Source: South African History Online timeline.`);

export default async function StoryPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ error?: string; notice?: string }> }) {
  const { locale } = await params;
  const query = await searchParams;
  const user = await currentUser();
  const desk = user && hasPermission(user.id, "admin.access") ? pendingHistoryNotes() : [];
  return (
    <article className="mx-auto max-w-3xl space-y-8">
      <header>
        <img className="mb-3 h-80 w-full rounded-3xl object-cover object-[center_40%]" src="/photos/magaliesberg-dawn.jpg" alt="Mist over the Magaliesberg at dawn, photographed by JMK at Skeerpoort on 1 January 2022" />
        <p className="text-xs text-[#5e6b7c]">JMK · Mist over the Magaliesberg at dawn, Skeerpoort, North West · 1 January 2022 · <a href="https://creativecommons.org/licenses/by-sa/4.0">CC BY-SA 4.0</a> · <a href="https://commons.wikimedia.org/wiki/File:Daeraad-miswolke_oor_Magaliesberg,_a.jpg">File page</a>. The range, not the city centre.</p>
        <p className="mt-4 text-xs font-semibold uppercase tracking-[0.18em] text-[#1d4e89]">Rustenburg</p>
        <h1 className="mt-2 font-serif text-5xl leading-tight">The story of Rustenburg</h1>
        <p className="mt-3 text-lg">A dated fact is marked as one. A chapter that only points at a source does not invent a year, a quotation or a population figure.</p>
        <p className="mt-2 text-sm">Last updated 17 November 2026. This is an editorial introduction with links. It is not a copy of the source articles, and it has not had a separate historian’s sign-off. Oral history sent through the form below stays pending until it is checked.</p>
      </header>
      <nav aria-label="Chapters" className="flex flex-wrap gap-2">
        {chapters.map((chapter, index) => (
          <a key={chapter.id} className="rounded-full border border-[#DCE2EA] px-3 py-1 text-sm" href={`#${chapter.id}`}>{index + 1}. {chapter.title}</a>
        ))}
      </nav>
      <Notice error={query.error} notice={query.notice === "held" ? "Your note is held for review. It is not published history." : query.notice} />
      {chapters.map((chapter) => (
        <section key={chapter.id} id={chapter.id}>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#1d4e89]">{chapter.kind}</p>
          <h2 className="mt-1 font-serif text-3xl">{chapter.title}</h2>
          <p className="mt-2 text-sm leading-7">{chapter.body}</p>
        </section>
      ))}
      <section>
        <h2 className="font-serif text-3xl">Timeline</h2>
        <ol className="mt-4 space-y-4 border-l border-[#AEBBCD] pl-4">
          {timeline.map((item) => (
            <li key={item.when}>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#1d4e89]">{item.when}</p>
              <p className="font-serif text-2xl">{item.title}</p>
              <p className="text-sm">{item.note}</p>
            </li>
          ))}
        </ol>
      </section>
      <section>
        <h2 className="font-serif text-3xl">Places named in the sources</h2>
        <p className="mt-2 text-sm leading-7">One pin is shown: the Rustenburg city coordinate already stored on this platform, -25.6544, 27.2429. It marks the city record, not the 1850 founding spot and not the fort. Phokeng, Tlhabane, Zinniaville and the Magaliesberg fort are named by the timeline. They are not given a pin here, because this desk has not verified a coordinate for them.</p>
        <p className="mt-3"><a className="text-sm font-semibold text-[#1d4e89]" href="https://www.openstreetmap.org/?mlat=-25.6544&mlon=27.2429#map=12/-25.6544/27.2429">Open the city record on OpenStreetMap</a></p>
        <figure className="mt-4">
          <img className="h-64 w-full rounded-3xl object-cover object-top" src="/photos/magaliesberg.jpg" alt="Farmland in front of the Magaliesberg, photographed by Olga Ernst on 29 September 2019 in Madibeng, North West" />
          <figcaption className="mt-2 text-xs text-[#5e6b7c]">Olga Ernst · Farmland and the Magaliesberg, Madibeng, North West · 29 September 2019 · GPS -25.808422, 27.762874 · <a href="https://creativecommons.org/licenses/by-sa/4.0">CC BY-SA 4.0</a> · <a href="https://commons.wikimedia.org/wiki/File:Magaliesberg_mountain_range,_South_Africa.jpg">File page</a>. This photograph is of the range and the fields, not a heritage pin.</figcaption>
        </figure>
      </section>
      <FactRibbon facts={facts} />
      <section className="text-sm leading-7">
        <h2 className="font-serif text-3xl">Sources</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5">
          <li><a href={source}>South African History Online, Rustenburg timeline 1850–2001.</a> Accessed 17 November 2026. Published 1 April 2011.</li>
          <li><a href="https://www.sahistory.org.za/place/rustenburg">South African History Online, Rustenburg place history.</a></li>
          <li><a href="https://www.sahistory.org.za/article/community-histories-rustenburg">Community histories of Rustenburg.</a></li>
          <li><a href="https://www.sahistory.org.za/article/prehistory-rustenburg-area">Prehistory of the Rustenburg area.</a></li>
          <li><a href="https://www.sahistory.org.za/article/rustenburg-segregated-city">Rustenburg the segregated city.</a></li>
          <li><a href="https://www.rustenburg.gov.za/">Rustenburg Local Municipality.</a> Use the municipality’s own documents for current plans.</li>
          <li><a href="https://www.statssa.gov.za/">Statistics South Africa.</a> Use a named release before quoting a population figure.</li>
        </ul>
      </section>
      <section className="space-y-3">
        <h2 className="font-serif text-3xl">Send a memory or a correction</h2>
        <p className="text-sm">A note stays pending until an editor reviews the source and the permission. It does not appear in the story by itself.</p>
        {user ? (
          <form action={studioAction} className="grid gap-2">
            <HiddenLocale locale={locale} />
            <input type="hidden" name="intent" value="history" />
            <input type="hidden" name="return" value="/story" />
            <select name="kind" className={control}><option value="memory">Memory</option><option value="correction">Correction</option><option value="oral">Oral history</option><option value="photograph">Photograph note</option><option value="culture">Culture</option></select>
            <textarea name="body" required placeholder="What should the editor read?" className={control} />
            <input name="source" required placeholder="Where it comes from, and who owns it" className={control} />
            <label className="text-sm"><input type="checkbox" name="consent" value="yes" /> I have the right to submit this and I agree it can be reviewed.</label>
            <button className={button}>Send for review</button>
          </form>
        ) : <Link className="text-sm font-semibold" href={localePath(locale, "/auth/sign-in")}>Sign in to send a note</Link>}
        {desk.length ? <ul className="space-y-2">{desk.map((note) => <li key={String(note.id)} className="text-sm">Pending · {String(note.kind)} · {String(note.body)}</li>)}</ul> : null}
      </section>
    </article>
  );
}
