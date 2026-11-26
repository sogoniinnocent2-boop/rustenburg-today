import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { localePath, t } from "@/lib/i18n";
import { sectionBySlug } from "@/lib/sections";
import { Field, HiddenLocale, Notice, PageIntro, button, control } from "@/components/chrome";
import { newsCategories } from "@/server/editorial";
import { businessCategories } from "@/server/commerce";
import { moduleByKey, moduleKeyForSection } from "@/server/city";
import { ARTICLE_REACTIONS } from "@/lib/reactions";
import { assignedSections, deskItems, deskStoryReport, manageableSections } from "@/server/departments";
import { all } from "@/server/db";
import { currentUser } from "@/server/session";
import { deskPublishAction, signInAction } from "@/server/actions";

export const metadata = { robots: { index: false, follow: false } };

export default async function DepartmentPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; tab?: string[] }>;
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const { locale, tab } = await params;
  const query = await searchParams;
  const user = await currentUser();

  if (!user) {
    return (
      <div className="mx-auto max-w-lg">
        <PageIntro
          locale={locale}
          title="Content desk login"
          summary="For the people who keep Rustenburg Today informative — headlines, department updates and the main public pages."
        />
        <Notice error={query.error} notice={query.notice} />
        <form action={signInAction} className="mt-4 space-y-3 rounded-2xl bg-white p-5 dark:bg-white/5">
          <HiddenLocale locale={locale} />
          <input type="hidden" name="next" value={localePath(locale, "/department")} />
          <Field label={t(locale, "email")}><input name="email" type="email" autoComplete="username" required className={control} /></Field>
          <Field label={t(locale, "password")}><input name="password" type="password" autoComplete="current-password" required className={control} /></Field>
          <button className={button}>{t(locale, "signIn")}</button>
          <p className="text-sm"><Link href={localePath(locale, "/auth/forgot")}>{t(locale, "forgot")}</Link></p>
        </form>
      </div>
    );
  }

  const mine = user.roles.includes("administrator") || user.roles.includes("editor")
    ? manageableSections()
    : assignedSections(user.id);
  if (!mine.length) {
    return (
      <div>
        <PageIntro locale={locale} title="Content desk" summary="This account is not assigned to a department yet." />
        <p className="rounded-2xl bg-white p-6 dark:bg-white/5">Ask an administrator to assign you under Admin → Departments so you can publish headlines and page updates.</p>
      </div>
    );
  }

  const active = tab?.[0];
  if (!active) {
    return (
      <div>
        <PageIntro
          locale={locale}
          title="Your content desks"
          summary={`${user.displayName} · choose a department and keep that public page current with headlines, stories and updates.`}
        />
        <Notice error={query.error} notice={query.notice} />
        <p className="mb-4 max-w-2xl text-sm">Department accounts own the live content for this website. Publish what residents should see on the home page and section pages.</p>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {mine.map((slug) => {
            const section = sectionBySlug(slug);
            if (!section) return null;
            return (
              <li key={slug}>
                <Link className="block rounded-2xl bg-white px-4 py-5 transition hover:-translate-y-0.5 dark:bg-white/5" href={localePath(locale, `/department/${slug}`)}>
                  <strong className="font-serif text-2xl">{t(locale, section.titleKey)}</strong>
                  <p className="mt-1 text-sm text-muted">Publish headlines and updates for /{slug}</p>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  if (!mine.includes(active) || !sectionBySlug(active)) notFound();
  const meta = sectionBySlug(active)!;
  const items = deskItems(user.id, active);
  const report = deskStoryReport(user, active);
  const moduleKey = moduleKeyForSection(active);
  const totalViews = report.reduce((sum, row) => sum + row.views, 0);
  const totalReactions = report.reduce((sum, row) => sum + row.reactions, 0);

  return (
    <div>
      <PageIntro locale={locale} title={`${t(locale, meta.titleKey)} content desk`} summary={`${user.displayName} · keep /${active} informative for the public site.`} />
      <Notice error={query.error} notice={query.notice === "published" ? "Published on the public department page." : query.notice === "draft" ? "Saved as a draft." : query.notice === "staff-created" ? "Staff account created. One-time password is in data/." : query.notice} />
      <p className="mb-4 text-sm"><Link className="font-semibold text-[#1d4e89]" href={localePath(locale, "/department")}>All content desks</Link></p>
      <nav className="mb-6 flex flex-wrap gap-2 text-sm" aria-label="Assigned departments">
        {mine.map((slug) => {
          const section = sectionBySlug(slug);
          if (!section) return null;
          return (
            <Link key={slug} className={`rounded-full px-3 py-1 ${slug === active ? "bg-[#101827] text-[#F5F7FA]" : "bg-white"}`} href={localePath(locale, `/department/${slug}`)}>
              {t(locale, section.titleKey)}
            </Link>
          );
        })}
      </nav>
      {mine.length > 1 ? <p className="mb-3 text-sm">This account covers {mine.length} departments. Switch above or return to the department list.</p> : null}
      <p className="mb-4 text-sm">What you publish here appears on <Link className="font-semibold text-[#1d4e89]" href={localePath(locale, `/${active}`)}>/{active}</Link>. SAnews wires keep feeding News separately.</p>
      <div className="grid gap-8 lg:grid-cols-2">
        <section className="space-y-8">
          <div className="rounded-2xl bg-white p-5 dark:bg-white/5">
            <h2 className="font-serif text-2xl">Story update</h2>
            <p className="mt-1 text-sm">Headline, picture and story for the {t(locale, meta.titleKey)} page.</p>
            <StoryUpdateForm locale={locale} section={active} />
          </div>
          <div className="rounded-2xl bg-white p-5 dark:bg-white/5">
            <h2 className="font-serif text-2xl">Department records</h2>
            {active === "news" ? <p className="mt-2 text-sm">Use the story update above for news headlines. SAnews wires stay on the public News page automatically.</p> : null}
            {active === "jobs" ? <JobsDeskForm locale={locale} /> : null}
            {active === "events" ? <EventsDeskForm locale={locale} /> : null}
            {active === "learn" ? <LearnDeskForm locale={locale} /> : null}
            {active === "business" ? <BusinessDeskForm locale={locale} /> : null}
            {moduleKey ? <ModuleDeskForm locale={locale} section={active} moduleKey={moduleKey} /> : null}
            {!["news", "jobs", "events", "learn", "business"].includes(active) && !moduleKey ? (
              <p className="mt-3 text-sm">Use the public create form for this desk: <Link className="font-semibold" href={localePath(locale, `/${active}/new`)}>/{active}/new</Link></p>
            ) : null}
          </div>
        </section>
        <section className="space-y-8">
          <div className="rounded-2xl bg-white p-5 dark:bg-white/5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-serif text-2xl">Story report</h2>
                <p className="mt-1 text-sm">Views and Facebook-style reactions for {t(locale, meta.titleKey)} department stories.</p>
              </div>
              <a className={button} href={`/api/v1/desk/report?section=${encodeURIComponent(active)}`}>Download CSV</a>
            </div>
            <p className="mt-3 text-sm">{report.length} {report.length === 1 ? "story" : "stories"} · {totalViews} views · {totalReactions} reactions</p>
            {report.length ? (
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-black/10 text-xs uppercase tracking-wide text-muted dark:border-white/10">
                      <th className="py-2 pr-3 font-semibold">Story</th>
                      <th className="py-2 pr-3 font-semibold">Views</th>
                      <th className="py-2 pr-3 font-semibold">Reactions</th>
                      <th className="py-2 font-semibold">Breakdown</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.map((row) => (
                      <tr key={row.id} className="border-b border-black/5 align-top dark:border-white/10">
                        <td className="py-3 pr-3">
                          <Link className="font-semibold text-[#1d4e89]" href={localePath(locale, `/news/${row.slug}`)}>{row.title}</Link>
                          <p className="text-xs text-muted">{row.status} · {row.author}{row.publishedAt ? ` · ${row.publishedAt.slice(0, 10)}` : ""}</p>
                        </td>
                        <td className="py-3 pr-3">{row.views}</td>
                        <td className="py-3 pr-3">{row.reactions}</td>
                        <td className="py-3">
                          <span className="flex flex-wrap gap-2">
                            {ARTICLE_REACTIONS.filter((item) => row.counts[item.id] > 0).map((item) => (
                              <span key={item.id} title={item.label}>{item.glyph} {row.counts[item.id]}</span>
                            ))}
                            {!row.reactions ? <span className="text-muted">None yet</span> : null}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="mt-3 text-sm">No department stories yet. Publish a story update to start the report.</p>
            )}
          </div>
          <div className="rounded-2xl bg-white p-5 dark:bg-white/5">
            <h2 className="font-serif text-2xl">Your updates</h2>
            {items.length ? (
              <ul className="mt-3 space-y-2">
                {items.map((item) => (
                  <li key={String(item.id)} className="flex gap-3 rounded-xl border border-black/5 px-3 py-2 text-sm dark:border-white/10">
                    {item.image ? <img src={String(item.image)} alt="" className="h-14 w-20 rounded-lg object-cover" /> : null}
                    <div>
                      <strong>{String(item.title)}</strong>
                      <p>{String(item.status)} · {String(item.updated_at || "").slice(0, 16)}{item.kind === "story" ? ` · ${Number(item.views) || 0} views` : ""}</p>
                      {item.kind === "story" && item.slug ? <Link className="font-semibold text-[#1d4e89]" href={localePath(locale, `/news/${item.slug}`)}>Open story</Link> : null}
                      {item.kind !== "story" && item.slug ? <Link className="font-semibold text-[#1d4e89]" href={localePath(locale, `/${active}/${item.slug}`)}>Open</Link> : null}
                      {item.kind !== "story" && !item.slug ? <Link className="font-semibold text-[#1d4e89]" href={localePath(locale, `/${active}/${item.id}`)}>Open</Link> : null}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm">Nothing from this account yet.</p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function StoryUpdateForm({ locale, section }: { locale: string; section: string }) {
  return (
    <form action={deskPublishAction} className="mt-4 space-y-3" encType="multipart/form-data">
      <HiddenLocale locale={locale} />
      <input type="hidden" name="section" value={section} />
      <input type="hidden" name="intent" value="story" />
      {section === "news" ? (
        <Field label={t(locale, "category")}>
          <select name="category" className={control}>{newsCategories().map((category) => <option key={category.slug} value={category.slug}>{category.name}</option>)}</select>
        </Field>
      ) : null}
      <Field label={t(locale, "language")}>
        <select name="language" className={control} defaultValue={locale}>
          <option value="en">English</option>
          <option value="tn">Setswana</option>
          <option value="af">Afrikaans</option>
        </select>
      </Field>
      <Field label="Headline"><input name="headline" required className={control} placeholder="Clear headline for the page" /></Field>
      <Field label="Summary"><textarea name="summary" required className={control} placeholder="One or two sentences under the headline" /></Field>
      <Field label="Story"><textarea name="body" required rows={8} className={control} placeholder="Full story update" /></Field>
      <Field label="Picture"><input name="image" type="file" accept="image/jpeg,image/png,image/webp,image/gif" required className={control} /></Field>
      <Field label="Video link">
        <input name="videoUrl" className={control} placeholder="https://www.youtube.com/watch?v=… or Vimeo" />
      </Field>
      <p className="text-sm text-muted">Optional. Paste a YouTube or Vimeo https link. The platform plays the hosted video; it does not store raw video files.</p>
      <button className={button}>Publish story update</button>
    </form>
  );
}

function JobsDeskForm({ locale }: { locale: string }) {
  return (
    <form action={deskPublishAction} className="mt-4 space-y-3">
      <HiddenLocale locale={locale} />
      <input type="hidden" name="section" value="jobs" />
      <Field label={t(locale, "title")}><input name="title" required className={control} /></Field>
      <Field label={t(locale, "description")}><textarea name="description" required className={control} /></Field>
      <Field label={t(locale, "category")}>
        <select name="jobType" className={control}>{["full-time", "part-time", "temporary", "casual", "internship", "learnership", "government", "youth"].map((type) => <option key={type}>{type}</option>)}</select>
      </Field>
      <Field label="Closing date"><input name="closing" type="date" className={control} /></Field>
      <button className={button}>Publish on Jobs</button>
    </form>
  );
}

function EventsDeskForm({ locale }: { locale: string }) {
  return (
    <form action={deskPublishAction} className="mt-4 space-y-3">
      <HiddenLocale locale={locale} />
      <input type="hidden" name="section" value="events" />
      <Field label={t(locale, "title")}><input name="title" required className={control} /></Field>
      <Field label={t(locale, "description")}><textarea name="description" required className={control} /></Field>
      <Field label={t(locale, "category")}><input name="category" required className={control} defaultValue="community" /></Field>
      <Field label="Start"><input name="start" type="datetime-local" required className={control} /></Field>
      <Field label="Venue"><input name="venue" className={control} /></Field>
      <button className={button}>Publish on Events</button>
    </form>
  );
}

function BusinessDeskForm({ locale }: { locale: string }) {
  return (
    <form action={deskPublishAction} className="mt-4 space-y-3">
      <HiddenLocale locale={locale} />
      <input type="hidden" name="section" value="business" />
      <Field label={t(locale, "name")}><input name="name" required className={control} /></Field>
      <Field label={t(locale, "description")}><textarea name="description" required className={control} /></Field>
      <Field label={t(locale, "category")}>
        <select name="category" className={control}>{businessCategories().map((item) => <option key={item.slug} value={item.slug}>{item.name}</option>)}</select>
      </Field>
      <Field label={t(locale, "phone")}><input name="phone" className={control} /></Field>
      <Field label="Address"><input name="address" className={control} /></Field>
      <Field label="Website"><input name="website" className={control} /></Field>
      <button className={button}>Publish on Business</button>
    </form>
  );
}

function LearnDeskForm({ locale }: { locale: string }) {
  return (
    <form action={deskPublishAction} className="mt-4 space-y-3">
      <HiddenLocale locale={locale} />
      <input type="hidden" name="section" value="learn" />
      <Field label={t(locale, "title")}><input name="title" required className={control} /></Field>
      <Field label={t(locale, "description")}><textarea name="description" required className={control} /></Field>
      <Field label={t(locale, "price")}><input name="price" className={control} placeholder="0" /></Field>
      <p className="text-sm">A course stays a draft until you add a lesson and publish it from Learn.</p>
      <button className={button}>Save course draft</button>
    </form>
  );
}

function ModuleDeskForm({ locale, section, moduleKey }: { locale: string; section: string; moduleKey: string }) {
  const spec = moduleByKey(moduleKey);
  const locations = all<{ slug: string; name: string }>("SELECT slug, name FROM locations WHERE active = 1 ORDER BY name");
  return (
    <form action={deskPublishAction} className="mt-4 space-y-3">
      <HiddenLocale locale={locale} />
      <input type="hidden" name="section" value={section} />
      <input type="hidden" name="module" value={moduleKey} />
      {spec.fields.map((field) => (
        <Field key={field.column} label={field.column.replaceAll("_", " ")}>
          {field.type === "textarea" ? <textarea name={field.column} className={control} required={field.required} /> : null}
          {field.type === "select" ? <select name={field.column} className={control}>{field.options?.map((option) => <option key={option}>{option}</option>)}</select> : null}
          {field.type === "location" ? <select name={field.column} className={control}><option value="">—</option>{locations.map((place) => <option key={place.slug} value={place.slug}>{place.name}</option>)}</select> : null}
          {field.type !== "textarea" && field.type !== "select" && field.type !== "location" ? <input name={field.column} className={control} required={field.required} /> : null}
        </Field>
      ))}
      {spec.consent ? <label className="flex gap-2 text-sm"><input type="checkbox" name="consent" value="yes" /> Consent is confirmed where this notice needs it.</label> : null}
      <button className={button}>Publish on {t(locale, sectionBySlug(section)!.titleKey)}</button>
    </form>
  );
}
