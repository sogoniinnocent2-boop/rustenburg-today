import { notFound, redirect } from "next/navigation";
import { localePath, t } from "@/lib/i18n";
import { HiddenLocale, Notice, PageIntro, button } from "@/components/chrome";
import { currentUser } from "@/server/session";
import { all, get } from "@/server/db";
import { backupAction, moderateAction, reviewNewsAction } from "@/server/actions";
import { CityAdmin, adminDeskLinks, adminTabs } from "@/components/city-admin";
import { modules } from "@/server/city";

export const metadata = { robots: { index: false, follow: false } };

export default async function AdminPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; tab?: string[] }>;
  searchParams: Promise<{ error?: string; notice?: string; q?: string; preview?: string; status?: string; department?: string; page?: string; edit?: string }>;
}) {
  const { locale, tab } = await params;
  const query = await searchParams;
  const active = tab?.[0] || "dashboard";
  if (!adminTabs.includes(active)) notFound();
  const user = await currentUser();
  if (!user) redirect(localePath(locale, "/auth/sign-in?next=/admin"));
  if (!user.roles.some((role) => ["administrator", "editor", "moderator", "journalist"].includes(role))) {
    return <p role="alert" className="rounded-2xl bg-white p-6 dark:bg-white/5">This desk is limited to journalists, editors, moderators and administrators.</p>;
  }
  if (active === "cms" && !user.roles.some((role) => ["administrator", "editor", "journalist"].includes(role))) {
    return <p role="alert" className="rounded-2xl bg-white p-6 dark:bg-white/5">Content management is limited to journalists, editors and administrators.</p>;
  }
  const counts = {
    users: count("SELECT COUNT(*) as count FROM users WHERE status = 'active'"),
    articles: count("SELECT COUNT(*) as count FROM articles WHERE status = 'published'"),
    pendingArticles: count("SELECT COUNT(*) as count FROM articles WHERE status = 'in_review'"),
    posts: count("SELECT COUNT(*) as count FROM community_posts WHERE status = 'published'"),
    reports: count("SELECT COUNT(*) as count FROM content_reports WHERE status = 'open'"),
    listings: count("SELECT COUNT(*) as count FROM products WHERE listing_status = 'published'"),
    jobs: count("SELECT COUNT(*) as count FROM jobs WHERE status = 'published'"),
    events: count("SELECT COUNT(*) as count FROM events WHERE status = 'published'"),
  };
  return (
    <div>
      <PageIntro locale={locale} title={t(locale, "admin")} summary={active} />
      <Notice error={query.error} notice={query.notice} />
      <nav className="mb-6 flex flex-wrap gap-2 text-sm" aria-label="City desks"><a className={`rounded-full px-3 py-1 ${active === "dashboard" ? "bg-[#101827] text-[#F5F7FA]" : "bg-white"}`} href={`/${locale}/admin`}>Dashboard</a>{adminDeskLinks.map(([key, label]) => <a key={key} className="rounded-full bg-white px-3 py-1" href={`/${locale}/admin/${key}`}>{label}</a>)}</nav>
      {active !== "dashboard" ? (
        <CityAdmin
          locale={locale}
          active={active}
          query={query.q}
          previewId={query.preview}
          status={query.status}
          department={query.department}
          page={query.page ? Number(query.page) : 1}
          editId={query.edit}
        />
      ) : (
      <>
      <div className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-4">
        {Object.entries(counts).map(([key, value]) => <div key={key} className="rounded-2xl bg-white p-4 dark:bg-white/5"><p className="text-xs uppercase text-muted">{key}</p><p className="font-serif text-3xl">{value}</p></div>)}
      </div>
      <Queue title="Articles in review" rows={all("SELECT id, slug as title FROM articles WHERE status = 'in_review' LIMIT 20")} kind="article" locale={locale} />
      <Queue title="Businesses" rows={all("SELECT id, name as title FROM businesses WHERE status = 'pending' LIMIT 20")} kind="business" locale={locale} />
      <Queue title="Listings" rows={all("SELECT id, title FROM products WHERE listing_status IN ('pending', 'unpublished') LIMIT 20")} kind="product" locale={locale} />
      <Queue title="Published listings" rows={all("SELECT id, title FROM products WHERE listing_status = 'published' LIMIT 20")} kind="product" locale={locale} actions={[{ value: "unpublish", label: "Unpublish" }, { value: "no", label: "Remove" }]} />
      <Queue title="Campaigns" rows={all("SELECT id, title FROM advertising_campaigns WHERE approval_status = 'pending' LIMIT 20")} kind="campaign" locale={locale} />
      <Queue title="Jobs" rows={all("SELECT id, title FROM jobs WHERE status = 'pending' LIMIT 20")} kind="job" locale={locale} />
      <Queue title="Events" rows={all("SELECT id, title FROM events WHERE status = 'pending' LIMIT 20")} kind="event" locale={locale} />
      <Queue title="Role applications" rows={all("SELECT r.id, r.role_name || ' · ' || p.username as title FROM role_requests r JOIN profiles p ON p.user_id = r.user_id WHERE r.status = 'pending' ORDER BY r.created_at LIMIT 20")} kind="role-request" locale={locale} />
      <section className="mb-6"><h2 className="font-serif text-2xl">Recent orders</h2><ul className="mt-2 space-y-2">{all<{ id: string; payment_status: string; order_status: string; total_cents: number }>("SELECT id, payment_status, order_status, total_cents FROM marketplace_orders ORDER BY created_at DESC LIMIT 20").map((order) => <li key={order.id} className="rounded-2xl bg-white px-4 py-3 text-sm dark:bg-white/5">{order.payment_status} · {order.order_status} · {order.total_cents} cents</li>)}</ul><p className="mt-2 text-sm">An order stays unpaid until a signed payment webhook. This desk cannot mark one paid.</p></section>
      <Queue title="Reports" rows={all("SELECT id, reason as title FROM content_reports WHERE status = 'open' LIMIT 20")} kind="report" locale={locale} />
      <Queue title="Creator posts" rows={all("SELECT id, title FROM creator_posts WHERE status = 'pending' LIMIT 20")} kind="creator" locale={locale} />
      <Queue title="Reward offers" rows={all("SELECT id, title FROM rewards_offers WHERE status = 'pending' LIMIT 20")} kind="reward" locale={locale} />
      <Queue title="Directory submissions" rows={pendingDirectories()} kind="module" locale={locale} />
      <form action={backupAction} className="mt-8"><HiddenLocale locale={locale} /><button className={button}>{t(locale, "backup")}</button></form>
      </>
      )}
    </div>
  );
}

function count(sql: string): number {
  return get<{ count: number }>(sql)?.count ?? 0;
}

function pendingDirectories(): Array<Record<string, unknown>> {
  return modules.flatMap((spec) =>
    all<Record<string, unknown>>(`SELECT id, ${spec.title} as title FROM ${spec.table} WHERE status = 'pending' AND deleted_at IS NULL LIMIT 8`).map((row) => ({ ...row, module: spec.key })),
  );
}

function Queue({ title, rows, kind, locale, actions }: { title: string; rows: Array<Record<string, unknown>>; kind: string; locale: string; actions?: Array<{ value: string; label: string }> }) {
  if (!rows.length) return null;
  const action = kind === "article" ? reviewNewsAction : moderateAction;
  const choices = actions || (kind === "article" ? [{ value: "publish", label: t(locale, "publish") }] : [{ value: "yes", label: t(locale, "publish") }, { value: "no", label: "Decline" }]);
  return (
    <section className="mb-6">
      <h2 className="font-serif text-2xl">{title}</h2>
      <ul className="mt-2 space-y-2">
        {rows.map((row) => (
          <li key={String(row.id)} className="flex items-center justify-between gap-3 rounded-2xl bg-white px-4 py-3 dark:bg-white/5">
            <span>{String(row.title)}</span>
            <div className="flex gap-2">
              {choices.map((choice) => (
                <form key={choice.value} action={action}>
                  <HiddenLocale locale={locale} />
                  <input type="hidden" name="id" value={String(row.id)} />
                  <input type="hidden" name="kind" value={kind} />
                  {row.module ? <input type="hidden" name="module" value={String(row.module)} /> : null}
                  <input type="hidden" name={kind === "article" ? "decision" : "approve"} value={choice.value} />
                  <button className={button}>{choice.label}</button>
                </form>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
