import Link from "next/link";
import { localePath } from "@/lib/i18n";
import { HiddenLocale, Money, Notice, button, control } from "@/components/chrome";
import { planAction } from "@/server/actions";
import { activePlan, listPlans, revenueLines } from "@/server/commercial";
import { all } from "@/server/db";
import { hasPermission } from "@/server/permissions";
import { currentUser } from "@/server/session";
import { setting } from "@/server/store";

export default async function PlansPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ error?: string; notice?: string }> }) {
  const { locale } = await params;
  const query = await searchParams;
  const user = await currentUser();
  const plans = listPlans();
  const current = user ? activePlan(user.id) : null;
  const history = user ? all<{ name: string; status: string; amount_cents: number }>("SELECT p.name, s.status, s.amount_cents FROM business_subscriptions s JOIN commercial_plans p ON p.code = s.plan_code WHERE s.user_id = ? ORDER BY s.created_at DESC", user.id) : [];
  const admin = user ? hasPermission(user.id, "admin.access") : false;
  const revenue = admin ? revenueLines() : [];
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-4xl">Business plans</h1>
        <p className="mt-2 max-w-2xl text-sm">News, jobs, notices, core lessons, K53 practice, games, competition entry, public posts and follows stay free. The same rows cover the creator packages: Free, Starter at R49, Growth at R99, Professional at R199, Business Plus at R399, and Enterprise with checkout closed. Payment mode: {setting("payment_mode", "disabled")}. {setting("payment_mode", "disabled") === "disabled" ? "Payments are not connected, so a priced plan opens as a preview. A preview is not a payment and it is not revenue." : "A priced plan stays unpaid until a signed payment confirmation."} Paid memberships, tips and subscriber-only posts stay closed until that provider is connected.</p>
      </div>
      <Notice error={query.error} notice={query.notice} />
      <div className="grid gap-4 md:grid-cols-2">
        {plans.map((plan) => (
          <article key={plan.code} className="glass-card space-y-3 p-4">
            <h2 className="font-serif text-2xl">{plan.name}</h2>
            <p><Money cents={plan.price_cents} />{plan.price_cents ? " / month, test price" : ""}</p>
            <p className="text-sm">{plan.summary}</p>
            {user ? (
              <form action={planAction}>
                <HiddenLocale locale={locale} />
                <input type="hidden" name="plan" value={plan.code} />
                <button className={button}>{current?.code === plan.code ? "Current plan" : plan.code === "enterprise" && plan.price_cents === 0 ? "Checkout closed" : plan.price_cents ? (setting("payment_mode", "disabled") === "disabled" ? "Use as a preview" : "Request this plan") : "Use free plan"}</button>
              </form>
            ) : <Link className="text-sm font-semibold" href={localePath(locale, "/auth/sign-in")}>Sign in to choose a plan</Link>}
          </article>
        ))}
      </div>
      {user ? (
        <section className="space-y-3">
          <h2 className="font-serif text-2xl">Your plans</h2>
          {history.length ? history.map((item, index) => <p key={`${item.name}-${index}`} className="text-sm">{item.name} · {item.status} · <Money cents={item.amount_cents} /></p>) : <p className="text-sm">No plan is on your account.</p>}
          <form action={planAction}><HiddenLocale locale={locale} /><input type="hidden" name="intent" value="cancel" /><button className={button}>Cancel current plan</button></form>
          {current && current.rank >= 2 ? (
            <form action={planAction} className="flex flex-wrap gap-2">
              <HiddenLocale locale={locale} />
              <input type="hidden" name="intent" value="feature" />
              <input name="deal" required placeholder="Your deal id" className={control} />
              <button className={button}>Feature my deal</button>
            </form>
          ) : null}
        </section>
      ) : null}
      {admin ? (
        <section className="space-y-3">
          <h2 className="font-serif text-2xl">Verified payments</h2>
          {revenue.length ? revenue.map((line) => <p key={line.reference_type} className="text-sm">{line.reference_type}: {line.payments} verified · <Money cents={line.cents} /></p>) : <p className="text-sm">No verified payment is on file. This is not a revenue forecast.</p>}
          <form action={planAction} className="grid max-w-md gap-2">
            <HiddenLocale locale={locale} />
            <input type="hidden" name="intent" value="price" />
            <select name="plan" className={control}>{plans.map((plan) => <option key={plan.code} value={plan.code}>{plan.name}</option>)}</select>
            <input name="cents" required placeholder="New price in cents" className={control} />
            <button className={button}>Update listed price</button>
          </form>
        </section>
      ) : null}
      <p className="text-sm"><Link href={localePath(locale, "/network")}>Request a quote</Link> stays free for the customer.</p>
    </div>
  );
}
