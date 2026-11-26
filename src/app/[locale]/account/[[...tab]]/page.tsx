import Link from "next/link";
import { localePath, t } from "@/lib/i18n";
import { Field, HiddenLocale, Notice, PageIntro, button, control } from "@/components/chrome";
import { notFound, redirect } from "next/navigation";
import { currentUser } from "@/server/session";
import { deleteAction, deskAction, exportAction, messageAction, orderAction, passwordAction, profileAction, roleAction, signOutAction, cvAction, organisationAction, topicAction } from "@/server/actions";
import { listConversations, listMessages, listOwnedEnquiries, pointsBalance } from "@/server/engage";
import { followedStories, followedTopics } from "@/server/alerts";
import { listApplications } from "@/server/city";
import { listRewardOffers } from "@/server/city";
import { listAdvertiserCampaigns } from "@/server/commerce";
import { listNotifications } from "@/server/alerts";
import { all } from "@/server/db";
import { REQUEST_ONLY_ROLES } from "@/server/access";

const tabs = ["overview", "profile", "messages", "notifications", "security", "privacy", "deletion", "listings", "applications", "orders", "events", "courses", "rewards", "advertisements"];

export default async function AccountPage({ params, searchParams }: { params: Promise<{ locale: string; tab?: string[] }>; searchParams: Promise<{ error?: string; notice?: string; conversation?: string }> }) {
  const { locale, tab } = await params;
  const query = await searchParams;
  const active = tab?.[0] || "overview";
  if (!tabs.includes(active)) notFound();
  const user = await currentUser();
  if (!user) redirect(localePath(locale, "/auth/sign-in"));
  return (
    <div className="grid gap-8 md:grid-cols-[14rem_1fr]">
      <nav className="glass-card space-y-3 p-3 text-sm" aria-label="Account">
        {([["Identity", ["overview", "profile", "security", "privacy", "deletion"]], ["Your work", ["messages", "notifications", "listings", "applications", "orders", "events", "courses", "rewards", "advertisements"]]] as const).map(([label, items]) => (
          <div key={label}>
            <p className="px-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">{label}</p>
            {items.map((item) => <Link key={item} className={item === active ? "nav-link font-bold text-emerald" : "nav-link"} href={localePath(locale, `/account/${item === "overview" ? "" : item}`)} aria-current={item === active ? "page" : undefined}>{item}</Link>)}
          </div>
        ))}
        <form action={signOutAction}><HiddenLocale locale={locale} /><button className="nav-link w-full text-left text-muted">{t(locale, "signOut")}</button></form>
      </nav>
      <div>
        <PageIntro locale={locale} title={user.displayName} summary={`@${user.username}`} />
        <Notice error={query.error} notice={query.notice === "verified" ? "Your email is confirmed. You can use the community, tickets, property and SafeTrack." : query.notice} />
        {active === "overview" ? <Overview locale={locale} userId={user.id} roles={user.roles} verified={user.emailVerified} /> : null}
        {active === "profile" ? <form action={profileAction} className="max-w-lg space-y-3"><HiddenLocale locale={locale} />{user.avatarUrl ? <img src={user.avatarUrl} alt="" className="h-16 w-16 rounded-full object-cover" /> : null}<Field label={t(locale, "name")}><input name="displayName" defaultValue={user.displayName} className={control} /></Field><Field label={t(locale, "description")}><textarea name="biography" defaultValue={user.biography || ""} className={control} /></Field><Field label={t(locale, "language")}><select name="language" defaultValue={user.language} className={control}><option value="en">English</option><option value="tn">Setswana</option><option value="af">Afrikaans</option></select></Field><Field label="Who can see this profile"><select name="visibility" defaultValue={user.visibility} className={control}><option value="public">Public</option><option value="private">Private</option></select></Field><Field label={t(locale, "phone")}><input name="phone" defaultValue={user.phone || ""} className={control} /></Field><Field label="Profile photograph"><input name="avatar" type="file" accept="image/jpeg,image/png,image/webp,image/gif" className={control} /></Field><Field label="Messages"><select name="messagePolicy" className={control} disabled={user.isMinor}><option value="connections">People I follow who follow me</option><option value="everyone">Signed-in adults</option><option value="none">No new messages</option></select></Field><button className={button}>{t(locale, "save")}</button></form> : null}
        {active === "messages" ? <Messages locale={locale} userId={user.id} conversation={query.conversation} /> : null}
        {active === "notifications" ? <Notifications locale={locale} userId={user.id} /> : null}
        {active === "security" ? user.hasPassword ? <form action={passwordAction} className="max-w-md space-y-3"><HiddenLocale locale={locale} /><Field label="Current"><input type="password" name="current" className={control} required /></Field><Field label={t(locale, "password")}><input type="password" name="password" className={control} required /></Field><button className={button}>{t(locale, "save")}</button></form> : <p className="max-w-md text-sm">This account has no password yet. Use <Link href={localePath(locale, "/auth/forgot")}>password reset</Link> to set one. Email is delivered only when SMTP is configured.</p> : null}
        {active === "privacy" ? <form action={exportAction}><button className={button}>{t(locale, "export")}</button></form> : null}
        {active === "deletion" ? <form action={deleteAction} className="max-w-md space-y-3"><HiddenLocale locale={locale} /><p className="text-sm">This closes the account, ends every session, removes the password and replaces the public name with “Deleted user”. Posts can remain under that name. Orders and payment records stay for the legal record. This cannot be undone.</p><Field label="Type DELETE"><input name="confirm" required className={control} autoComplete="off" /></Field>{user.hasPassword ? <Field label={t(locale, "password")}><input type="password" name="password" required className={control} /></Field> : <p className="text-sm">This account has no password. The signed-in session and the word DELETE are the confirmation.</p>}<button className={button}>{t(locale, "delete.account")}</button></form> : null}
        {active === "listings" ? <List sql="SELECT id, title, listing_status as status FROM products WHERE seller_id = ?" userId={user.id} /> : null}
        {active === "applications" ? <Applications locale={locale} userId={user.id} /> : null}
        {active === "orders" ? <Orders locale={locale} userId={user.id} /> : null}
        {active === "events" ? <List sql="SELECT event_id as id, registration_status as title, registration_status as status FROM event_registrations WHERE user_id = ?" userId={user.id} /> : null}
        {active === "courses" ? <List sql="SELECT course_id as id, enrolment_status as title, enrolment_status as status FROM course_enrolments WHERE user_id = ?" userId={user.id} /> : null}
        {active === "rewards" ? <Rewards locale={locale} userId={user.id} /> : null}
        {active === "advertisements" ? <Advertisements locale={locale} userId={user.id} /> : null}
      </div>
    </div>
  );
}

function Advertisements({ locale, userId }: { locale: string; userId: string }) {
  const campaigns = listAdvertiserCampaigns(userId);
  if (!campaigns.length) return <p>{t(locale, "empty")}</p>;
  return (
    <div className="space-y-3">
      {campaigns.map((item) => (
        <article key={String(item.id)} className="rounded-2xl bg-white p-4 dark:bg-white/5">
          <p className="text-xs uppercase text-emerald">{String(item.campaign_kind)} · {String(item.placement)}</p>
          <h2 className="font-serif text-2xl">{String(item.title)}</h2>
          <p className="text-sm">{String(item.approval_status)} · {String(item.payment_status)} · {String(item.start_date)} – {String(item.end_date)}</p>
          <p className="text-sm">{t(locale, "impressions")}: {String(item.impressions)} · {t(locale, "clicks")}: {String(item.clicks)}</p>
        </article>
      ))}
    </div>
  );
}

function Rewards({ locale, userId }: { locale: string; userId: string }) {
  const offers = listRewardOffers();
  return (
    <div className="space-y-3">
      <p>{t(locale, "points")}: {pointsBalance(userId)}</p>
      {offers.length ? offers.map((offer) => (
        <form key={String(offer.id)} action={deskAction} className="rounded-2xl bg-white p-4 dark:bg-white/5">
          <HiddenLocale locale={locale} />
          <input type="hidden" name="intent" value="redeem" />
          <input type="hidden" name="id" value={String(offer.id)} />
          <input type="hidden" name="return" value={localePath(locale, "/account/rewards")} />
          <p className="font-semibold">{String(offer.title)}</p>
          <p className="text-sm">{String(offer.description)} · {String(offer.points_cost)} points</p>
          <button className={`${button} mt-2`}>{t(locale, "save")}</button>
        </form>
      )) : <p>{t(locale, "empty")}</p>}
    </div>
  );
}

function Overview({ locale, userId, roles, verified }: { locale: string; userId: string; roles: string[]; verified: boolean }) {
  const contentOwner = roles.includes("department_editor") || roles.includes("administrator") || roles.includes("editor");
  if (contentOwner) {
    return (
      <div className="space-y-4">
        <p>Content owner account · {verified ? "Email verified." : "Email not verified yet."}</p>
        <p className="max-w-2xl text-sm">This login is for people who keep the public website informative — headlines, department stories and page updates. Open your content desk to publish.</p>
        <div className="flex flex-wrap gap-2 text-sm">
          <Link className={`${button}`} href={localePath(locale, "/department")}>Open content desk</Link>
          {roles.some((role) => ["administrator", "editor", "moderator"].includes(role)) ? <Link className="rounded-full border px-3 py-1" href={localePath(locale, "/admin")}>Admin</Link> : null}
          <Link className="rounded-full border px-3 py-1" href={localePath(locale)}>Preview public site</Link>
          <Link className="rounded-full border px-3 py-1" href={localePath(locale, "/account/security")}>Security</Link>
        </div>
        <p className="text-sm text-muted">Roles: {roles.join(", ")}</p>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <p>Rustenburg Today ID · {verified ? "Email verified." : "Email not verified yet."}</p>
      <div className="flex flex-wrap gap-2 text-sm">
        <Link className="rounded-full border px-3 py-1" href={localePath(locale, "/community/new")}>Write a post</Link>
        <Link className="rounded-full border px-3 py-1" href={localePath(locale, "/tickets")}>Tickets</Link>
        <Link className="rounded-full border px-3 py-1" href={localePath(locale, "/property")}>Property</Link>
        <Link className="rounded-full border px-3 py-1" href={localePath(locale, "/safetrack")}>SafeTrack</Link>
      </div>
      <p>{t(locale, "points")}: {pointsBalance(userId)}</p>
      <p className="text-sm">{roles.join(", ")}</p>
      <form action={roleAction} className="flex flex-wrap gap-2">
        <HiddenLocale locale={locale} />
        <input type="hidden" name="mode" value="request" />
        <label className="text-sm font-semibold" htmlFor="role-request">Apply for a platform role</label>
        <select id="role-request" name="role" className={control}>{REQUEST_ONLY_ROLES.map((role) => <option key={role} value={role}>{role}</option>)}</select>
        <button className={button}>Apply</button>
      </form>
      {all<{ role_name: string; status: string }>("SELECT role_name, status FROM role_requests WHERE user_id = ? ORDER BY created_at DESC", userId).map((request) => <p key={`${request.role_name}-${request.status}`} className="text-sm">{request.role_name}: {request.status}</p>)}
      <form action={organisationAction} className="flex flex-wrap gap-2">
        <HiddenLocale locale={locale} />
        <input name="name" placeholder="Organisation name" className={control} />
        <button className={button}>Register organisation</button>
      </form>
      <p className="text-sm text-muted">A standard account can read, buy, learn and take part in the community. Selling, hiring, publishing news, teaching, organising events and listing property stay inactive until an administrator approves the application.</p>
    </div>
  );
}

function Notifications({ locale, userId }: { locale: string; userId: string }) {
  const topics = followedTopics(userId);
  const stories = followedStories(userId);
  const notes = listNotifications(userId);
  return (
    <div className="space-y-4">
      <section>
        <h2 className="flex items-center gap-2 font-serif text-2xl"><span className="pulse-lamp is-live" aria-hidden="true" />Story tracker</h2>
        {stories.length ? (
          <ul className="mt-2 space-y-2 text-sm">
            {stories.map((story) => (
              <li key={`${story.kind}:${story.id}`} className="flex items-center gap-2">
                <span className="pulse-lamp is-live" aria-hidden="true" />
                <Link href={localePath(locale, story.href)}>{story.title}</Link>
              </li>
            ))}
          </ul>
        ) : <p className="mt-2 text-sm">No story is being tracked. Open a published story and choose Track this story.</p>}
      </section>
      <section>
        <h2 className="font-serif text-2xl">Followed topics</h2>
        {topics.length ? topics.map((topic) => (
          <form key={topic} action={topicAction} className="mt-2 flex items-center gap-3 text-sm">
            <HiddenLocale locale={locale} />
            <input type="hidden" name="category" value={topic} />
            <input type="hidden" name="return" value={localePath(locale, "/account/notifications")} />
            <span>{topic}</span>
            <button className="font-semibold text-[#1d4e89]">Unfollow</button>
          </form>
        )) : <p className="text-sm">Follow a news category from the news page. Alerts stay inside this account.</p>}
      </section>
      {notes.length ? <ul className="space-y-2">{notes.map((item) => <li key={item.id} className="rounded-2xl bg-white p-3 dark:bg-white/5"><strong>{item.title}</strong><p>{item.body}</p>{item.target_url ? <Link className="text-sm font-semibold text-[#1d4e89]" href={localePath(locale, item.target_url)}>Open</Link> : null}</li>)}</ul> : <p className="text-sm">No notifications yet.</p>}
    </div>
  );
}

function Applications({ locale, userId }: { locale: string; userId: string }) {
  const rows = listApplications(userId);
  return (
    <div className="space-y-4">
      <form action={cvAction} className="max-w-lg space-y-2"><HiddenLocale locale={locale} /><input name="headline" placeholder="Headline" className={control} /><input name="skills" placeholder="Skills" className={control} /><textarea name="experience" placeholder="Experience" className={control} /><textarea name="education" placeholder="Education" className={control} /><button className={button}>Save CV</button></form>
      {rows.length ? <ul className="space-y-2">{rows.map((row) => (
        <li key={String(row.id)} className="rounded-2xl bg-white p-3 dark:bg-white/5">
          {row.job_status === "published" ? <Link className="font-semibold" href={localePath(locale, `/jobs/${row.job_id}`)}>{String(row.title)}</Link> : <strong>{String(row.title)}</strong>}
          <p className="text-sm">{String(row.status)}{row.closing_date ? ` · Closes ${String(row.closing_date).slice(0, 10)}` : ""}</p>
        </li>
      ))}</ul> : <p>No applications yet.</p>}
    </div>
  );
}

function Messages({ locale, userId, conversation }: { locale: string; userId: string; conversation?: string }) {
  const conversations = listConversations(userId);
  const messages = conversation ? listMessages(userId, conversation) : [];
  const enquiries = listOwnedEnquiries(userId);
  return (
    <div className="space-y-6">
      <p className="text-sm">Personal private chat is closed. A reply here continues an enquiry that was already opened from a listing or a business.</p>
      {enquiries.length ? (
        <section>
          <h2 className="font-serif text-2xl">Enquiry inbox</h2>
          <ul className="mt-2 space-y-2">{enquiries.map((item) => <li key={item.id} className="rounded-2xl bg-white p-3 text-sm dark:bg-white/5"><span className="uppercase text-[#1d4e89]">{item.kind}</span> · {item.title}<p>{item.message}</p>{item.conversation_id ? <Link className="font-semibold" href={localePath(locale, `/account/messages?conversation=${item.conversation_id}`)}>Open</Link> : null}</li>)}</ul>
        </section>
      ) : null}
    <div className="grid gap-4 md:grid-cols-2">
      <ul>{conversations.map((item) => <li key={String(item.id)}><Link href={localePath(locale, `/account/messages?conversation=${item.id}`)}>{String(item.conversation_type || "message")} · {String(item.subject || item.last_message || "Conversation")}</Link></li>)}</ul>
      <div>
        {messages.map((item) => <p key={String(item.id)} className="mb-2"><strong>{String(item.display_name)}:</strong> {String(item.message_body)}</p>)}
        {conversation ? <form action={messageAction} className="space-y-2"><HiddenLocale locale={locale} /><input type="hidden" name="conversationId" value={conversation} /><textarea name="body" className={control} required /><button className={button}>{t(locale, "send")}</button></form> : null}
      </div>
    </div>
    </div>
  );
}

function Orders({ locale, userId }: { locale: string; userId: string }) {
  const rows = all<{ id: string; payment_status: string; order_status: string; side: string }>("SELECT id, payment_status, order_status, CASE WHEN buyer_id = ? THEN 'buyer' ELSE 'seller' END as side FROM marketplace_orders WHERE buyer_id = ? OR seller_id = ? ORDER BY created_at DESC", userId, userId, userId);
  if (!rows.length) return <p>Nothing here yet.</p>;
  return (
    <ul className="space-y-2">{rows.map((row) => (
      <li key={row.id} className="rounded-2xl bg-white p-3 dark:bg-white/5">
        <p>{row.side === "buyer" ? "You ordered" : "A customer ordered"} · {row.payment_status} · {row.order_status}</p>
        <p className="text-sm">Payment stays unpaid until the payment provider confirms it. This page cannot mark an order paid.</p>
        {row.payment_status === "unpaid" && row.order_status === "placed" ? <form action={orderAction}><HiddenLocale locale={locale} /><input type="hidden" name="intent" value="cancel" /><input type="hidden" name="id" value={row.id} /><button className={button}>Cancel unpaid order</button></form> : null}
      </li>
    ))}</ul>
  );
}

function List({ sql, userId }: { sql: string; userId: string }) {
  const rows = all<Record<string, unknown>>(sql, userId);
  if (!rows.length) return <p>Nothing here yet.</p>;
  return <ul className="space-y-2">{rows.map((row) => <li key={String(row.id)} className="rounded-2xl bg-white p-3 dark:bg-white/5">{String(row.title)} · {String(row.status)}</li>)}</ul>;
}
