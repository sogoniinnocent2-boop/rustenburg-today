import { HiddenLocale, button, control } from "@/components/chrome";
import { cmsAction } from "@/server/actions";
import { getManagedArticle, listManagedArticles, newsCategories, publicArticleHref } from "@/server/editorial";
import { EDITORIAL_PRIORITIES, NEWS_PUBLISHING_DEPARTMENTS } from "@/lib/news-display";
import { localePath } from "@/lib/i18n";
import { all } from "@/server/db";

const STATUS_TABS: Array<{ key: string; label: string }> = [
  { key: "all", label: "All department stories" },
  { key: "headline", label: "Headline News" },
  { key: "body", label: "Body News" },
  { key: "published", label: "Published" },
  { key: "draft", label: "Drafts" },
  { key: "scheduled", label: "Scheduled" },
  { key: "in_review", label: "Pending approval" },
  { key: "unpublished", label: "Unpublished" },
  { key: "archived", label: "Archived" },
  { key: "deleted", label: "Deleted" },
];

export function ContentCms({
  locale,
  status,
  q,
  department,
  page,
  editId,
}: {
  locale: string;
  status?: string;
  q?: string;
  department?: string;
  page?: number;
  editId?: string;
}) {
  const filter = status || "all";
  const listing = listManagedArticles({ status: filter, q, department, page });
  const editing = editId ? getManagedArticle(editId) : null;
  const categories = newsCategories();
  const locations = all<{ id: string; name: string }>("SELECT id, name FROM locations WHERE active = 1 ORDER BY name LIMIT 80");
  const deskChoices = NEWS_PUBLISHING_DEPARTMENTS;
  const audit = all<{ action: string; resource_id: string; created_at: string; display_name: string }>(
    `SELECT a.action, a.resource_id, a.created_at, p.display_name
     FROM audit_logs a
     LEFT JOIN profiles p ON p.user_id = a.actor_id
     WHERE a.resource_type = 'article'
     ORDER BY a.created_at DESC LIMIT 12`,
  );

  return (
    <div className="space-y-8">
      <section className="glass-card space-y-2 p-4">
        <h2 className="font-serif text-2xl">Department news workspace</h2>
        <p className="text-sm">
          Every authorised department can create original Rustenburg Today news here. Choose Headline News for prominent placement or Body News for regular departmental feeds.
          The Main Editorial Story manager stays separate and is not overwritten by Headline News.
        </p>
        <div className="flex flex-wrap gap-2 text-xs">
          {STATUS_TABS.map((tab) => (
            <a
              key={tab.key}
              className={`rounded-full px-3 py-1 ${filter === tab.key ? "bg-[#101827] text-[#F5F7FA]" : "bg-white"}`}
              href={`/${locale}/admin/cms?status=${tab.key}${q ? `&q=${encodeURIComponent(q)}` : ""}${department ? `&department=${encodeURIComponent(department)}` : ""}`}
            >
              {tab.label}
              {listing.counts[tab.key] != null ? ` (${listing.counts[tab.key]})` : ""}
            </a>
          ))}
        </div>
      </section>

      <form method="get" action={`/${locale}/admin/cms`} className="glass-card flex flex-wrap gap-2 p-4">
        <input type="hidden" name="status" value={filter} />
        <input name="q" defaultValue={q || ""} placeholder="Search headline, author, category" className={`${control} max-w-xl`} />
        <select name="department" defaultValue={department || ""} className={control}>
          <option value="">All departments</option>
          {deskChoices.map((item) => (
            <option key={item.slug} value={item.slug}>
              {item.label}
            </option>
          ))}
        </select>
        <button className={button}>Filter</button>
      </form>

      <section className="glass-card space-y-3 p-4">
        <h2 className="font-serif text-2xl">{editing ? "Edit news story" : "Create new news"}</h2>
        <form action={cmsAction} className="grid gap-2" encType="multipart/form-data">
          <HiddenLocale locale={locale} />
          <input type="hidden" name="intent" value={editing ? "update" : "create"} />
          {editing ? <input type="hidden" name="id" value={editing.id} /> : null}
          <input type="hidden" name="return" value="/admin/cms" />
          <label className="text-sm font-semibold" htmlFor="cms-title">
            Headline
          </label>
          <input id="cms-title" name="title" required defaultValue={editing?.title || ""} className={control} />
          <label className="text-sm font-semibold" htmlFor="cms-excerpt">
            Introduction / excerpt
          </label>
          <textarea id="cms-excerpt" name="excerpt" required rows={3} defaultValue={editing?.excerpt || ""} className={control} />
          <label className="text-sm font-semibold" htmlFor="cms-body">
            Full article
          </label>
          <textarea id="cms-body" name="body" required rows={12} defaultValue={editing?.body || ""} className={control} placeholder="Use plain text with blank lines between paragraphs. Links and quotations are supported." />
          <div className="grid gap-2 md:grid-cols-2">
            <div>
              <label className="text-sm font-semibold" htmlFor="cms-display-type">
                News display type
              </label>
              <select id="cms-display-type" name="displayType" className={control} defaultValue={editing?.news_display_type || "body"} required>
                <option value="body">Body News — departmental feeds and Latest Official Stories</option>
                <option value="headline">Headline News — prominent headline sections (limited slots)</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-semibold" htmlFor="cms-priority">
                Editorial priority
              </label>
              <select id="cms-priority" name="priority" className={control} defaultValue={editing?.editorial_priority || "standard"}>
                {EDITORIAL_PRIORITIES.map((item) => (
                  <option key={item} value={item}>
                    {item === "top" ? "Top Story" : item.charAt(0).toUpperCase() + item.slice(1)}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-muted">Breaking and Top Story require editor or assigned department editor authority.</p>
            </div>
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            <div>
              <label className="text-sm font-semibold" htmlFor="cms-category">
                Category
              </label>
              <select id="cms-category" name="category" required className={control} defaultValue={editing?.categorySlug || "local-news"}>
                {categories.map((category) => (
                  <option key={category.id} value={category.slug}>
                    {category.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-semibold" htmlFor="cms-department">
                Department destination
              </label>
              <select id="cms-department" name="department" className={control} defaultValue={editing?.department_slug || "news"}>
                {deskChoices.map((item) => (
                  <option key={item.slug} value={item.slug}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="text-sm font-semibold" htmlFor="cms-headline-expires">
              Headline expiry (optional)
            </label>
            <input
              id="cms-headline-expires"
              name="headlineExpires"
              type="datetime-local"
              className={control}
              defaultValue={editing?.headline_expires_at ? editing.headline_expires_at.slice(0, 16) : ""}
            />
            <p className="mt-1 text-xs text-muted">Headline News defaults to a 7-day window if left blank. After expiry the story continues as Body News.</p>
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            <div>
              <label className="text-sm font-semibold" htmlFor="cms-tags">
                Tags (comma separated)
              </label>
              <input id="cms-tags" name="tags" defaultValue={editing?.tags || ""} className={control} />
            </div>
            <div>
              <label className="text-sm font-semibold" htmlFor="cms-location">
                Location
              </label>
              <select id="cms-location" name="location" className={control} defaultValue={editing?.location_id || ""}>
                <option value="">National / unspecified</option>
                {locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            <div>
              <label className="text-sm font-semibold" htmlFor="cms-meta-title">
                SEO title
              </label>
              <input id="cms-meta-title" name="metaTitle" defaultValue={editing?.meta_title || ""} className={control} />
            </div>
            <div>
              <label className="text-sm font-semibold" htmlFor="cms-meta-description">
                SEO description
              </label>
              <input id="cms-meta-description" name="metaDescription" defaultValue={editing?.meta_description || ""} className={control} />
            </div>
          </div>
          <label className="text-sm font-semibold" htmlFor="cms-image">
            Featured image
          </label>
          <input id="cms-image" name="image" type="file" accept="image/jpeg,image/png,image/webp,image/gif" className={control} />
          {editing?.featured_image ? <p className="text-xs text-muted">Current image: {editing.featured_image}</p> : null}
          <label className="text-sm font-semibold" htmlFor="cms-schedule">
            Schedule (optional)
          </label>
          <input id="cms-schedule" name="schedule" type="datetime-local" className={control} />
          <div className="flex flex-wrap gap-2 pt-2">
            <button className={button} name="mode" value="draft">
              Save draft
            </button>
            <button className={button} name="mode" value="submit">
              Submit for approval
            </button>
            <button className={button} name="mode" value="publish">
              Publish now
            </button>
            <button className={button} name="mode" value="schedule">
              Schedule
            </button>
            {editing?.status === "published" ? (
              <button className={button} name="mode" value="update-live">
                Save and keep published
              </button>
            ) : null}
          </div>
        </form>
      </section>

      <section className="space-y-2">
        <h2 className="font-serif text-2xl">
          {STATUS_TABS.find((tab) => tab.key === filter)?.label || "Posts"} ({listing.total})
        </h2>
        {!listing.items.length ? <p className="text-sm">No posts match this filter.</p> : null}
        <ul className="space-y-2">
          {listing.items.map((item) => (
            <li key={item.id} className="glass-card space-y-2 p-4 text-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-serif text-xl">
                    {item.status === "published" ? (
                      <a href={localePath(locale, publicArticleHref(item.slug))}>{item.title}</a>
                    ) : (
                      item.title
                    )}
                  </p>
                  <p>
                    {item.author} · {item.category} · {item.destination} · {item.status} ·{" "}
                    <span className={item.news_display_type === "headline" ? "font-semibold text-emerald" : ""}>
                      {item.news_display_type === "headline" ? "Headline News" : "Body News"}
                    </span>
                    {" · "}
                    {item.editorial_priority}
                  </p>
                  <p className="text-xs text-muted">
                    Created {item.created_at.slice(0, 16).replace("T", " ")} · Updated {item.updated_at.slice(0, 16).replace("T", " ")}
                    {item.published_at ? ` · Published ${item.published_at.slice(0, 16).replace("T", " ")}` : ""}
                    {item.scheduled_for ? ` · Scheduled ${item.scheduled_for.slice(0, 16).replace("T", " ")}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <a className={button} href={`/${locale}/admin/cms?edit=${item.id}&status=${filter}`}>
                    Edit
                  </a>
                  {item.status === "in_review" || item.status === "draft" || item.status === "changes_requested" ? (
                    <form action={cmsAction}>
                      <HiddenLocale locale={locale} />
                      <input type="hidden" name="intent" value="lifecycle" />
                      <input type="hidden" name="mode" value="publish" />
                      <input type="hidden" name="id" value={item.id} />
                      <input type="hidden" name="return" value="/admin/cms" />
                      <button className={button}>Publish</button>
                    </form>
                  ) : null}
                  {item.status === "published" || item.status === "scheduled" ? (
                    <form action={cmsAction}>
                      <HiddenLocale locale={locale} />
                      <input type="hidden" name="intent" value="lifecycle" />
                      <input type="hidden" name="mode" value="unpublish" />
                      <input type="hidden" name="id" value={item.id} />
                      <input type="hidden" name="return" value="/admin/cms" />
                      <label className="sr-only">
                        <input type="checkbox" name="confirm" value="YES" required />
                      </label>
                      <button className={button} name="confirm" value="YES">
                        Unpublish
                      </button>
                    </form>
                  ) : null}
                  {item.status !== "archived" && item.status !== "deleted" && !item.status.includes("removed") ? (
                    <form action={cmsAction}>
                      <HiddenLocale locale={locale} />
                      <input type="hidden" name="intent" value="lifecycle" />
                      <input type="hidden" name="mode" value="archive" />
                      <input type="hidden" name="id" value={item.id} />
                      <input type="hidden" name="return" value="/admin/cms" />
                      <button className={button} name="confirm" value="YES">
                        Archive
                      </button>
                    </form>
                  ) : null}
                  {item.status === "archived" || item.status === "unpublished" || filter === "deleted" ? (
                    <form action={cmsAction}>
                      <HiddenLocale locale={locale} />
                      <input type="hidden" name="intent" value="lifecycle" />
                      <input type="hidden" name="mode" value="restore" />
                      <input type="hidden" name="id" value={item.id} />
                      <input type="hidden" name="return" value="/admin/cms" />
                      <button className={button}>Restore</button>
                    </form>
                  ) : null}
                  {item.status !== "deleted" ? (
                    <form action={cmsAction}>
                      <HiddenLocale locale={locale} />
                      <input type="hidden" name="intent" value="lifecycle" />
                      <input type="hidden" name="mode" value="remove" />
                      <input type="hidden" name="id" value={item.id} />
                      <input type="hidden" name="return" value="/admin/cms" />
                      <button className={button} name="confirm" value="YES">
                        Delete
                      </button>
                    </form>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
        {listing.total > listing.items.length ? (
          <p className="text-sm">
            <a className={button} href={`/${locale}/admin/cms?status=${filter}&page=${(page || 1) + 1}${q ? `&q=${encodeURIComponent(q)}` : ""}`}>
              Next page
            </a>
          </p>
        ) : null}
      </section>

      <section className="glass-card space-y-2 p-4">
        <h2 className="font-serif text-2xl">Editorial activity</h2>
        {!audit.length ? <p className="text-sm">No article audit entries yet.</p> : null}
        <ul className="space-y-1 text-sm">
          {audit.map((row, index) => (
            <li key={`${row.resource_id}-${row.created_at}-${index}`}>
              {row.display_name || "System"} · {row.action} · {row.resource_id.slice(0, 8)} · {row.created_at.slice(0, 16).replace("T", " ")}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
