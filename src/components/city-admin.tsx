import { HiddenLocale, button, control } from "@/components/chrome";
import { cityDeskAction, departmentAction, mediaLibraryAction, moderateAction } from "@/server/actions";
import { listPendingPosts } from "@/server/community";
import { homepageBlocks, licencesDue, listSources, reviewQueue } from "@/server/citydesk";
import { listAssets } from "@/server/media-library";
import { coverageBySection, listAssignments, manageableSections } from "@/server/departments";
import { sourceDiversityReport } from "@/server/multisource";
import { getMainEditorialStory, listEligibleMainEditorialArticles, listMainEditorialSlots, previewMainEditorial } from "@/server/newsedition";
import { ContentCms } from "@/components/content-cms";
import { localePath } from "@/lib/i18n";
import { sectionBySlug } from "@/lib/sections";
import { all } from "@/server/db";

export const adminTabs = ["dashboard", "cms", "news", "ingest", "coverage", "editorial", "hero", "topfive", "media", "reports", "complaints", "jobs", "ads", "radio", "homepage", "weather", "departments"];

export const adminDeskLinks = [
  ["cms", "Content"],
  ["news", "News sources"],
  ["ingest", "Ingestion"],
  ["coverage", "Source coverage"],
  ["editorial", "Wire review"],
  ["hero", "Main story"],
  ["topfive", "Top five"],
  ["media", "Photographs"],
  ["reports", "Community reports"],
  ["complaints", "Complaints"],
  ["jobs", "Vacancies"],
  ["ads", "Advertising rules"],
  ["radio", "Radio"],
  ["homepage", "Homepage"],
  ["weather", "Weather note"],
  ["departments", "Departments"],
];

export function CityAdmin({
  locale,
  active,
  query,
  previewId,
  status,
  department,
  page,
  editId,
}: {
  locale: string;
  active: string;
  query?: string;
  previewId?: string;
  status?: string;
  department?: string;
  page?: number;
  editId?: string;
}) {
  return (
    <div className="space-y-6">
      <nav className="flex flex-wrap gap-2 text-sm" aria-label="City desks">
        {adminDeskLinks.map(([key, label]) => <a key={key} className={`rounded-full px-3 py-1 ${active === key ? "bg-[#101827] text-[#F5F7FA]" : "bg-white"}`} href={`/${locale}/admin/${key}`}>{label}</a>)}
      </nav>
      {active === "cms" ? <ContentCms locale={locale} status={status} q={query} department={department} page={page} editId={editId} /> : null}
      {active === "news" ? <SourceForm locale={locale} /> : null}
      {active === "ingest" ? <IngestList locale={locale} /> : null}
      {active === "coverage" ? <CoverageDesk /> : null}
      {active === "editorial" ? <EditorialQueue locale={locale} /> : null}
      {active === "hero" ? <MainEditorialDesk locale={locale} query={query} previewId={previewId} /> : null}
      {active === "topfive" ? <TopForm locale={locale} /> : null}
      {active === "media" ? <MediaDesk locale={locale} /> : null}
      {active === "reports" ? <ReporterQueue locale={locale} /> : null}
      {active === "complaints" ? <ComplaintList /> : null}
      {active === "jobs" ? <VacancyForm locale={locale} /> : null}
      {active === "ads" ? <AdRules /> : null}
      {active === "radio" ? <RadioForm locale={locale} /> : null}
      {active === "homepage" ? <HomeBlocks locale={locale} /> : null}
      {active === "weather" ? <WeatherForm locale={locale} /> : null}
      {active === "departments" ? <DepartmentsDesk locale={locale} /> : null}
    </div>
  );
}

function DepartmentsDesk({ locale }: { locale: string }) {
  const rows = listAssignments();
  const choices = manageableSections();
  const coverage = coverageBySection();
  const missing = coverage.filter((row) => row.editors === 0).map((row) => row.section_slug);
  const people = new Map<string, { user_id: string; email: string; display_name: string; sections: typeof rows }>();
  for (const row of rows) {
    const existing = people.get(row.user_id);
    if (existing) existing.sections.push(row);
    else people.set(row.user_id, { user_id: row.user_id, email: row.email, display_name: row.display_name, sections: [row] });
  }
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {missing.length ? (
        <div className="rounded-2xl border border-amber-500/40 bg-amber-50 p-4 text-sm dark:bg-amber-950/30 lg:col-span-2">
          <p className="font-semibold">{missing.length} department{missing.length === 1 ? "" : "s"} still need a staff assignment</p>
          <p className="mt-1 text-muted">Assign an existing editor to each desk below, or use “Assign all desks” for a central team account. Dedicated staff accounts can still be created later.</p>
          <p className="mt-2 font-mono text-xs leading-relaxed">{missing.join(", ")}</p>
        </div>
      ) : (
        <div className="rounded-2xl bg-emerald-50 p-4 text-sm dark:bg-emerald-950/30 lg:col-span-2">
          <p className="font-semibold">All {choices.length} manageable desks have at least one assigned editor.</p>
          <p className="mt-1 text-muted">Coverage is many-to-many: one login can hold every desk, and each desk can have several editors.</p>
        </div>
      )}
      <form action={departmentAction} className="space-y-3 rounded-2xl bg-white p-4 dark:bg-white/5">
        <h2 className="font-serif text-2xl">Create department staff</h2>
        <p className="text-sm">Creates an individual account, assigns one starting department, and writes a one-time password under data/. Add more departments afterwards with the assign form.</p>
        <HiddenLocale locale={locale} />
        <input type="hidden" name="intent" value="create" />
        <input name="displayName" required placeholder="Full name" className={control} />
        <input name="email" type="email" required placeholder="work@example.com" className={control} />
        <select name="section" required className={control}>
          {choices.map((slug) => {
            const section = sectionBySlug(slug);
            return <option key={slug} value={slug}>{section ? section.slug : slug}</option>;
          })}
        </select>
        <button className={button}>Create and assign</button>
      </form>
      <form action={departmentAction} className="space-y-3 rounded-2xl bg-white p-4 dark:bg-white/5">
        <h2 className="font-serif text-2xl">Assign another department</h2>
        <p className="text-sm">One person can hold several departments. Use their existing email to add another section without creating a second login.</p>
        <HiddenLocale locale={locale} />
        <input type="hidden" name="intent" value="assign" />
        <input name="email" type="email" required placeholder="Existing account email" className={control} />
        <select name="section" required className={control}>
          {choices.map((slug) => <option key={slug} value={slug}>{slug}</option>)}
        </select>
        <button className={button}>Assign department</button>
      </form>
      <form action={departmentAction} className="space-y-3 rounded-2xl bg-white p-4 dark:bg-white/5 lg:col-span-2">
        <h2 className="font-serif text-2xl">Assign all desks to one account</h2>
        <p className="text-sm">Gives an existing login access to every manageable department workspace ({choices.length} desks). Does not create a new password or account. Audit log records the bulk assignment.</p>
        <HiddenLocale locale={locale} />
        <input type="hidden" name="intent" value="assign-all" />
        <input name="email" type="email" required placeholder="Existing account email" className={control} />
        <button className={button}>Assign all {choices.length} desks</button>
      </form>
      <div className="rounded-2xl bg-white p-4 text-sm dark:bg-white/5 lg:col-span-2">
        <h3 className="font-serif text-xl">Desk coverage</h3>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {coverage.map((row) => (
            <li key={row.section_slug} className="rounded-xl border border-black/5 px-3 py-2 dark:border-white/10">
              <strong>{row.section_slug}</strong>
              <p className="text-muted">{row.editors} editor{row.editors === 1 ? "" : "s"}</p>
            </li>
          ))}
        </ul>
      </div>
      <ul className="space-y-3 lg:col-span-2">
        {people.size ? [...people.values()].map((person) => (
          <li key={person.user_id} className="rounded-2xl bg-white px-4 py-3 text-sm dark:bg-white/5">
            <p className="font-semibold">{person.display_name} · {person.email} · {person.sections.length} desk{person.sections.length === 1 ? "" : "s"}</p>
            <ul className="mt-2 space-y-2">
              {person.sections.map((row) => (
                <li key={`${row.user_id}-${row.section_slug}`} className="flex flex-wrap items-center justify-between gap-3">
                  <span><strong>{row.section_slug}</strong> · assigned {row.created_at.slice(0, 10)}</span>
                  <form action={departmentAction}>
                    <HiddenLocale locale={locale} />
                    <input type="hidden" name="intent" value="revoke" />
                    <input type="hidden" name="userId" value={row.user_id} />
                    <input type="hidden" name="section" value={row.section_slug} />
                    <button className={button}>Revoke</button>
                  </form>
                </li>
              ))}
            </ul>
          </li>
        )) : <li className="text-sm">No department assignments yet.</li>}
      </ul>
    </div>
  );
}

function MediaDesk({ locale }: { locale: string }) {
  const assets = listAssets();
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <form action={mediaLibraryAction} className="space-y-3 rounded-2xl bg-white p-4 dark:bg-white/5">
        <h2 className="font-serif text-2xl">Record a photograph</h2>
        <p className="text-sm">A file is stored as pending until the owner, the permission and a description are approved. Nothing is scraped.</p>
        <HiddenLocale locale={locale} />
        <input type="hidden" name="intent" value="register" />
        <input name="file" type="file" accept="image/jpeg,image/png,image/webp" required className={control} />
        <input name="owner" required placeholder="Copyright owner" className={control} />
        <input name="credit" required placeholder="Credit line" className={control} />
        <input name="alt" required placeholder="What the photograph shows" className={control} />
        <input name="source" placeholder="Source URL, if there is one" className={control} />
        <select name="licence" className={control} defaultValue="commissioned">
          <option value="commissioned">Commissioned by Rustenburg Today</option>
          <option value="licensed_stock">Licensed stock</option>
          <option value="official_reuse">Official reuse permitted</option>
          <option value="owner_upload">Uploaded by the owner</option>
          <option value="partner_feed">Licensed partner feed</option>
        </select>
        <input name="acquired" type="date" required className={control} />
        <input name="expires" type="date" className={control} />
        <button className={button}>Save for review</button>
      </form>
      <ul className="space-y-3">
        {assets.length ? assets.map((asset) => (
          <li key={String(asset.id)} className="rounded-2xl bg-white p-4 text-sm dark:bg-white/5">
            <p className="font-semibold">{String(asset.credit)}</p>
            <p>{String(asset.owner_name)} · {String(asset.licence_basis)} · {String(asset.status)}</p>
            <p>{String(asset.alt_text)}</p>
            <p>{asset.placement ? `Placed: ${String(asset.placement)}` : "Not placed on a page."}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {asset.status === "pending" ? (
                <>
                  <form action={mediaLibraryAction}><HiddenLocale locale={locale} /><input type="hidden" name="intent" value="decide" /><input type="hidden" name="id" value={String(asset.id)} /><input type="hidden" name="decision" value="approve" /><button className={button}>Approve</button></form>
                  <form action={mediaLibraryAction}><HiddenLocale locale={locale} /><input type="hidden" name="intent" value="decide" /><input type="hidden" name="id" value={String(asset.id)} /><input type="hidden" name="decision" value="reject" /><button className={button}>Reject</button></form>
                </>
              ) : null}
              {asset.status === "approved" ? (
                <>
                  <form action={mediaLibraryAction}><HiddenLocale locale={locale} /><input type="hidden" name="intent" value="place" /><input type="hidden" name="id" value={String(asset.id)} /><button className={button}>Use on the homepage</button></form>
                  <form action={mediaLibraryAction}><HiddenLocale locale={locale} /><input type="hidden" name="intent" value="decide" /><input type="hidden" name="id" value={String(asset.id)} /><input type="hidden" name="decision" value="withdraw" /><button className={button}>Withdraw</button></form>
                </>
              ) : null}
            </div>
          </li>
        )) : <li className="text-sm">No photograph is on file.</li>}
      </ul>
    </div>
  );
}

function ReporterQueue({ locale }: { locale: string }) {
  const posts = listPendingPosts();
  if (!posts.length) return <p className="text-sm">No community report is waiting.</p>;
  return (
    <ul className="space-y-3">
      {posts.map((post) => (
        <li key={post.id} className="rounded-2xl bg-white p-4 text-sm dark:bg-white/5">
          <p className="uppercase text-[#1d4e89]">{post.post_type} · {post.display_name}</p>
          <p className="mt-2 whitespace-pre-wrap">{post.body}</p>
          <div className="mt-3 flex gap-2">
            <form action={moderateAction}><HiddenLocale locale={locale} /><input type="hidden" name="kind" value="post" /><input type="hidden" name="id" value={post.id} /><input type="hidden" name="approve" value="yes" /><button className={button}>Publish</button></form>
            <form action={moderateAction}><HiddenLocale locale={locale} /><input type="hidden" name="kind" value="post" /><input type="hidden" name="id" value={post.id} /><input type="hidden" name="approve" value="no" /><button className={button}>Remove</button></form>
          </div>
        </li>
      ))}
    </ul>
  );
}

function SourceForm({ locale }: { locale: string }) {
  return (
    <form action={cityDeskAction} className="glass-card grid gap-2 p-4 md:grid-cols-2">
      <HiddenLocale locale={locale} />
      <input type="hidden" name="intent" value="source" />
      <input type="hidden" name="return" value="/admin/news" />
      <input name="name" required placeholder="Source name" className={control} />
      <input name="publisher" required placeholder="Publisher" className={control} />
      <input name="feedUrl" placeholder="https:// feed address" className={control} />
      <select name="kind" className={control}><option value="rss">RSS</option><option value="atom">Atom</option><option value="official">Official site</option><option value="official_emergency">Official emergency feed</option><option value="partner">Licensed partner</option><option value="submission">Submission desk</option></select>
      <select name="region" className={control}>
        <option value="rustenburg">Rustenburg</option>
        <option value="north-west">North West</option>
        <option value="national">National</option>
        <option value="africa">Africa</option>
        <option value="international">International</option>
        <option value="business">Business</option>
        <option value="education">Education</option>
        <option value="sport">Sport</option>
        <option value="health">Health</option>
        <option value="technology">Technology</option>
        <option value="agriculture">Agriculture</option>
        <option value="tourism">Tourism</option>
        <option value="notices">Notices</option>
        <option value="community">Community</option>
        <option value="traffic">Traffic</option>
      </select>
      <select name="permitted" className={control}><option value="headline_link">Headline and link only</option><option value="licensed_summary">Licensed short summary</option><option value="none">No reuse</option></select>
      <input name="category" placeholder="Category slug" className={control} defaultValue="local-news" />
      <textarea name="rights" required placeholder="What this publisher permits us to store" className={control} />
      <fieldset className="md:col-span-2 space-y-2 text-sm">
        <legend className="font-semibold">Map to departments</legend>
        <p className="text-muted">Choose sections this source may feed. Leave empty to keep it unmapped until an editor assigns it.</p>
        <div className="flex flex-wrap gap-3">
          {["news", "business", "sports", "health", "technology", "agriculture", "notices", "voice", "support"].map((slug) => (
            <label key={slug} className="inline-flex items-center gap-2">
              <input type="checkbox" name="departments" value={slug} />
              /{slug}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="text-sm"><input type="checkbox" name="breaking" value="yes" /> Official emergency feed may publish non-sensitive items</label>
      <button className={button}>Save paused source</button>
    </form>
  );
}

function IngestList({ locale }: { locale: string }) {
  const sources = listSources();
  if (!sources.length) return <p>No sources saved. A feed is not fetched until an editor activates it.</p>;
  return (
    <ul className="space-y-2">
      {sources.map((source) => (
        <li key={String(source.id)} className="glass-card p-4 text-sm">
          <strong>{String(source.name)}</strong> · {String(source.status)} · {String(source.permitted_use)} · {String(source.publisher)}
          {source.last_error ? <p>Last check: {String(source.last_error)}</p> : null}
          <form action={cityDeskAction} className="mt-2 flex flex-wrap gap-2">
            <HiddenLocale locale={locale} />
            <input type="hidden" name="id" value={String(source.id)} />
            <input type="hidden" name="return" value="/admin/ingest" />
            <button name="intent" value="ingest" className={button}>Fetch feed</button>
          </form>
          <form action={cityDeskAction} className="mt-2 flex gap-2">
            <HiddenLocale locale={locale} />
            <input type="hidden" name="intent" value="source-status" />
            <input type="hidden" name="id" value={String(source.id)} />
            <input type="hidden" name="return" value="/admin/ingest" />
            <button name="status" value="active" className={button}>Activate</button>
            <button name="status" value="paused" className={button}>Pause</button>
          </form>
        </li>
      ))}
    </ul>
  );
}

function CoverageDesk() {
  const report = sourceDiversityReport();
  return (
    <div className="space-y-6">
      <section className="glass-card space-y-2 p-4 text-sm">
        <h2 className="font-serif text-2xl">Source coverage</h2>
        <p>
          {report.totals.active} active sources · {report.totals.items} discovered items · {report.totals.failed} with errors · {report.totals.stale} stale (no success in 24h).
          SAnews is one source among several. Feeds store headline, permitted summary and original link only.
        </p>
      </section>
      <section className="glass-card p-4">
        <h3 className="font-serif text-xl">Departments</h3>
        <ul className="mt-3 space-y-2 text-sm">
          {report.departments.map((row) => (
            <li key={String(row.section)} className="flex flex-wrap justify-between gap-2 border-b border-black/5 py-2 dark:border-white/10">
              <span><strong>/{String(row.section)}</strong></span>
              <span>
                {Number(row.activeSources)} active source{Number(row.activeSources) === 1 ? "" : "s"} · {Number(row.published)} published
                {row.empty ? " · needs coverage" : ""}
                {row.singleSource ? " · only one source" : ""}
              </span>
            </li>
          ))}
        </ul>
      </section>
      <section className="glass-card p-4">
        <h3 className="font-serif text-xl">Sources</h3>
        <ul className="mt-3 space-y-2 text-sm">
          {report.sources.map((source) => (
            <li key={String(source.id)}>
              <strong>{String(source.name)}</strong> · {String(source.publisher)} · {String(source.status)} · discovered {String(source.discovered)} · published {String(source.published)}
              <p className="text-muted">Departments: {String(source.departments || "none")}{source.last_error ? ` · error: ${String(source.last_error)}` : ""}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function EditorialQueue({ locale }: { locale: string }) {
  const rows = reviewQueue();
  if (!rows.length) return <p>No stories are waiting. Discovered items stay here until an editor publishes them.</p>;
  return (
    <ul className="space-y-2">
      {rows.map((row) => (
        <li key={String(row.id)} className="glass-card flex flex-wrap items-center justify-between gap-2 p-4">
          <span>{String(row.headline)} · {String(row.publisher)}{row.sensitive ? " · needs care" : ""}</span>
          <form action={cityDeskAction} className="flex gap-2">
            <HiddenLocale locale={locale} />
            <input type="hidden" name="intent" value="review-item" />
            <input type="hidden" name="id" value={String(row.id)} />
            <input type="hidden" name="return" value="/admin/editorial" />
            <button name="decision" value="publish" className={button}>Publish link</button>
            <button name="decision" value="breaking" className={button}>Mark breaking</button>
            <button name="decision" value="reject" className={button}>Reject</button>
          </form>
        </li>
      ))}
    </ul>
  );
}

function TopForm({ locale }: { locale: string }) {
  return (
    <form action={cityDeskAction} className="glass-card grid gap-2 p-4">
      <HiddenLocale locale={locale} />
      <input type="hidden" name="intent" value="top-five" />
      <input type="hidden" name="return" value="/admin/topfive" />
      <p className="text-sm">Choose a published story id. Empty positions stay empty.</p>
      <input name="date" type="date" required className={control} />
      <input name="position" type="number" min={1} max={5} required className={control} placeholder="1" />
      <input name="newsItem" className={control} placeholder="News item id" />
      <input name="article" className={control} placeholder="Original article id" />
      <button className={button}>Schedule</button>
    </form>
  );
}

function MainEditorialDesk({ locale, query, previewId }: { locale: string; query?: string; previewId?: string }) {
  const slots = listMainEditorialSlots();
  const live = getMainEditorialStory(null);
  const originals = listEligibleMainEditorialArticles(query || "");
  const preview = previewId ? previewMainEditorial(previewId) : null;
  const liveSlot = slots.find((slot) => String(slot.display_status) === "live");
  return (
    <div className="space-y-6">
      <p className="text-sm">Homepage Main Story Manager. Only published original Rustenburg Today articles are eligible. Removing a placement never deletes the article. External wires cannot be used here.</p>

      <section className="glass-card space-y-3 p-4">
        <h2 className="font-serif text-2xl">Current homepage main story</h2>
        {live ? (
          <div className="flex flex-wrap gap-4">
            {live.image ? <img src={live.image} alt="" className="h-28 w-40 rounded-xl object-cover" /> : null}
            <div className="min-w-0 flex-1">
              <p className="text-xs uppercase tracking-[0.14em] text-emerald">Rustenburg Today original · {live.category}</p>
              <p className="font-serif text-2xl"><a href={localePath(locale, live.href)}>{live.headline}</a></p>
              <p className="text-sm">{[live.author, live.published?.slice(0, 16).replace("T", " ")].filter(Boolean).join(" · ")}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <a className={button} href={localePath(locale, "/")}>Open homepage</a>
                {liveSlot ? (
                  <form action={cityDeskAction} className="space-y-2">
                    <HiddenLocale locale={locale} />
                    <input type="hidden" name="intent" value="main-editorial" />
                    <input type="hidden" name="mode" value="clear" />
                    <input type="hidden" name="slot" value={String(liveSlot.id)} />
                    <input type="hidden" name="return" value="/admin/hero" />
                    <label className="flex gap-2 text-xs text-muted">
                      <input type="checkbox" name="confirm" value="REMOVE" required />
                      Remove from the homepage only. The article stays published.
                    </label>
                    <button className={button} formAction={cityDeskAction}>Remove Main Story</button>
                  </form>
                ) : null}
              </div>
              <p className="mt-2 text-xs text-muted">Removal clears the homepage placement only. The article stays published.</p>
            </div>
          </div>
        ) : (
          <p className="text-sm">No main story is live. The homepage shows the editorial empty state until you add one.</p>
        )}
      </section>

      <form method="get" action={`/${locale}/admin/hero`} className="glass-card flex flex-wrap gap-2 p-4">
        <label className="sr-only" htmlFor="hero-q">Search eligible articles</label>
        <input id="hero-q" name="q" defaultValue={query || ""} placeholder="Search by headline, author or department" className={`${control} max-w-xl`} />
        <button className={button}>Search articles</button>
      </form>

      {preview ? (
        <section className="glass-card space-y-2 p-4">
          <h2 className="font-serif text-2xl">Preview</h2>
          <p className="text-xs uppercase tracking-[0.14em] text-emerald">Rustenburg Today original journalism · {preview.category}</p>
          <p className="font-serif text-3xl">{preview.headline}</p>
          {preview.summary ? <p className="text-sm">{preview.summary}</p> : null}
          <p className="text-sm">{[preview.author, preview.published?.slice(0, 16).replace("T", " ")].filter(Boolean).join(" · ")}</p>
          <form action={cityDeskAction} className="flex flex-wrap gap-2 pt-2">
            <HiddenLocale locale={locale} />
            <input type="hidden" name="intent" value="main-editorial" />
            <input type="hidden" name="return" value="/admin/hero" />
            <input type="hidden" name="article" value={preview.key.replace(/^article:/, "")} />
            <button className={button}>Confirm and publish as Main Story now</button>
          </form>
        </section>
      ) : null}

      <form action={cityDeskAction} className="glass-card grid gap-2 p-4">
        <HiddenLocale locale={locale} />
        <input type="hidden" name="intent" value="main-editorial" />
        <input type="hidden" name="return" value="/admin/hero" />
        <h2 className="font-serif text-2xl">Add or replace Main Story</h2>
        <p className="text-sm">Selecting a story replaces any current national main story for the same scope. Confirm the article is approved original journalism.</p>
        <label className="text-sm font-semibold" htmlFor="main-article">Eligible original article</label>
        <select id="main-article" name="article" required className={control} defaultValue={previewId || ""}>
          <option value="" disabled>Select a published original article</option>
          {originals.map((item) => <option key={item.id} value={item.id}>{item.title} · {item.author} · {item.category}</option>)}
        </select>
        <label className="text-sm font-semibold" htmlFor="main-starts">Starts (leave blank for immediately)</label>
        <input id="main-starts" name="starts" type="datetime-local" className={control} />
        <label className="text-sm font-semibold" htmlFor="main-ends">Ends (optional)</label>
        <input id="main-ends" name="ends" type="datetime-local" className={control} />
        <label className="text-sm font-semibold" htmlFor="main-location">Location scope id (blank = national default)</label>
        <input id="main-location" name="location" className={control} placeholder="Optional location id" />
        <div className="flex flex-wrap gap-2">
          <button className={button}>Save Main Story</button>
        </div>
        <p className="text-xs text-muted">Use Preview on a listed article below before confirming a replacement.</p>
      </form>

      {!originals.length ? <p className="text-sm">No eligible original articles matched this search.</p> : (
        <ul className="space-y-2">
          {originals.slice(0, 12).map((item) => (
            <li key={item.id} className="glass-card flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
              <span>
                <strong>{item.title}</strong>
                {" · "}
                {item.author}
                {" · "}
                {item.category}
                {item.published_at ? ` · ${item.published_at.slice(0, 16).replace("T", " ")}` : ""}
              </span>
              <a className={button} href={`/${locale}/admin/hero?preview=${encodeURIComponent(item.id)}${query ? `&q=${encodeURIComponent(query)}` : ""}`}>Preview</a>
            </li>
          ))}
        </ul>
      )}

      <section className="space-y-2">
        <h2 className="font-serif text-2xl">Main story history</h2>
        {slots.length ? (
          <ul className="space-y-2">
            {slots.map((slot) => (
              <li key={String(slot.id)} className="glass-card flex flex-wrap items-center justify-between gap-2 p-4 text-sm">
                <span>
                  <strong>{String(slot.headline)}</strong>
                  {" · "}
                  {String(slot.display_status || slot.status)}
                  {" · "}
                  {slot.location_name ? String(slot.location_name) : "National"}
                  {" · "}
                  {String(slot.starts_at).slice(0, 16).replace("T", " ")}
                  {slot.ends_at ? ` – ${String(slot.ends_at).slice(0, 16).replace("T", " ")}` : ""}
                  {" · "}
                  {String(slot.editor_name)}
                </span>
                <div className="flex flex-wrap gap-2">
                  {String(slot.display_status) === "live" || String(slot.status) === "active" ? (
                    <form action={cityDeskAction}>
                      <HiddenLocale locale={locale} />
                      <input type="hidden" name="intent" value="main-editorial" />
                      <input type="hidden" name="mode" value="clear" />
                      <input type="hidden" name="slot" value={String(slot.id)} />
                      <input type="hidden" name="return" value="/admin/hero" />
                      <button className={button}>Remove</button>
                    </form>
                  ) : null}
                  {String(slot.display_status) === "scheduled" || String(slot.status) === "scheduled" ? (
                    <form action={cityDeskAction}>
                      <HiddenLocale locale={locale} />
                      <input type="hidden" name="intent" value="main-editorial" />
                      <input type="hidden" name="mode" value="cancel" />
                      <input type="hidden" name="slot" value={String(slot.id)} />
                      <input type="hidden" name="return" value="/admin/hero" />
                      <button className={button}>Cancel schedule</button>
                    </form>
                  ) : null}
                  {["cleared", "replaced", "cancelled", "expired"].includes(String(slot.status)) ? (
                    <form action={cityDeskAction}>
                      <HiddenLocale locale={locale} />
                      <input type="hidden" name="intent" value="main-editorial" />
                      <input type="hidden" name="mode" value="restore" />
                      <input type="hidden" name="slot" value={String(slot.id)} />
                      <input type="hidden" name="return" value="/admin/hero" />
                      <button className={button}>Restore as Main Story</button>
                    </form>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm">No Main Story history yet.</p>
        )}
      </section>
    </div>
  );
}

function ComplaintList() {
  const rows = all<Record<string, unknown>>("SELECT kind, subject_type, status, created_at FROM trust_complaints ORDER BY created_at DESC LIMIT 20");
  if (!rows.length) return <p>No copyright, privacy, accuracy or advertising complaints are open.</p>;
  return <ul className="space-y-2">{rows.map((row, index) => <li key={index} className="glass-card p-3 text-sm">{String(row.kind)} · {String(row.subject_type)} · {String(row.status)} · {String(row.created_at).slice(0, 16)}</li>)}</ul>;
}

function VacancyForm({ locale }: { locale: string }) {
  return (
    <form action={cityDeskAction} className="glass-card grid gap-2 p-4">
      <HiddenLocale locale={locale} />
      <input type="hidden" name="intent" value="vacancy" />
      <input type="hidden" name="return" value="/admin/jobs" />
      <input name="id" required placeholder="Job id" className={control} />
      <select name="badge" className={control}><option value="vacancy_confirmed">Vacancy confirmed</option><option value="official_government">Official government vacancy</option></select>
      <textarea name="evidence" required placeholder="How the vacancy and destination were checked" className={control} />
      <input name="destination" placeholder="Official application URL" className={control} />
      <button className={button}>Record vacancy check</button>
    </form>
  );
}

function AdRules() {
  const rows = all<Record<string, unknown>>("SELECT category, rule, note FROM ad_restrictions ORDER BY rule, category");
  return <ul className="space-y-2">{rows.map((row) => <li key={String(row.category)} className="glass-card p-3 text-sm"><strong>{String(row.category)}</strong> · {String(row.rule)} · {String(row.note)}</li>)}</ul>;
}

function RadioForm({ locale }: { locale: string }) {
  const due = licencesDue();
  return (
    <div className="space-y-4">
      <form action={cityDeskAction} className="glass-card grid gap-2 p-4">
        <HiddenLocale locale={locale} />
        <input type="hidden" name="intent" value="licence" />
        <input type="hidden" name="return" value="/admin/radio" />
        <select name="licenceType" className={control}><option value="talk">Original talk clearance</option><option value="icasa">ICASA</option><option value="samro">SAMRO</option><option value="sampra">SAMPRA</option><option value="cleared">Other written clearance</option></select>
        <input name="holder" required placeholder="Licence holder" className={control} />
        <input name="reference" required placeholder="Reference" className={control} />
        <input name="territory" required placeholder="Territory" className={control} defaultValue="South Africa" />
        <input name="starts" type="date" required className={control} />
        <input name="ends" type="date" required className={control} />
        <button className={button}>Save licence record</button>
      </form>
      <form action={cityDeskAction} className="glass-card grid gap-2 p-4">
        <HiddenLocale locale={locale} />
        <input type="hidden" name="intent" value="station" />
        <input type="hidden" name="return" value="/admin/radio" />
        <input name="stream" placeholder="Authorised stream URL" className={control} />
        <button name="status" value="offline" className={button}>Keep offline</button>
        <button name="status" value="on_air" className={button}>Mark on air</button>
      </form>
      {due.length ? <p className="text-sm">Licences ending within 30 days: {due.map((item) => `${item.licence_type} ${item.ends_on}`).join(", ")}</p> : <p className="text-sm">No current licence is inside the 30-day renewal window.</p>}
    </div>
  );
}

function HomeBlocks({ locale }: { locale: string }) {
  const blocks = homepageBlocks();
  return (
    <ul className="space-y-2">
      {blocks.map((block) => (
        <li key={String(block.block_key)} className="glass-card flex items-center justify-between p-3 text-sm">
          <span>{String(block.block_key)}</span>
          <form action={cityDeskAction}>
            <HiddenLocale locale={locale} />
            <input type="hidden" name="intent" value="block" />
            <input type="hidden" name="key" value={String(block.block_key)} />
            <input type="hidden" name="return" value="/admin/homepage" />
            <button name="enabled" value={block.enabled ? "no" : "yes"} className={button}>{block.enabled ? "Hide" : "Show"}</button>
          </form>
        </li>
      ))}
    </ul>
  );
}

function WeatherForm({ locale }: { locale: string }) {
  return (
    <form action={cityDeskAction} className="glass-card grid gap-2 p-4">
      <HiddenLocale locale={locale} />
      <input type="hidden" name="intent" value="weather" />
      <input type="hidden" name="return" value="/admin/weather" />
      <textarea name="summary" required placeholder="Observation copied from the source" className={control} />
      <input name="source" required placeholder="Source name" className={control} />
      <input name="url" placeholder="Source URL" className={control} />
      <input name="observed" type="datetime-local" required className={control} />
      <button className={button}>Record observation</button>
    </form>
  );
}
