import { HiddenLocale, Notice, button, control } from "@/components/chrome";
import { studioAction } from "@/server/actions";
import { all } from "@/server/db";
import { loyaltyCards } from "@/server/studio";
import { currentUser } from "@/server/session";

export default async function LoyaltyPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ error?: string; notice?: string }> }) {
  const { locale } = await params;
  const query = await searchParams;
  const user = await currentUser();
  const cards = user ? loyaltyCards(user.id) : [];
  const businesses = user ? all<{ id: string; name: string }>("SELECT id, name FROM businesses WHERE owner_id = ? AND deleted_at IS NULL", user.id) : [];
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-4xl">Loyalty cards</h1>
        <p className="mt-2 max-w-2xl text-sm">A business records a stamp on a customer account. The reward note uses the words the business wrote. No discount is applied to a payment.</p>
      </div>
      <Notice error={query.error} notice={query.notice} />
      {user && businesses.length ? (
        <form action={studioAction} className="grid max-w-xl gap-2">
          <HiddenLocale locale={locale} />
          <input type="hidden" name="intent" value="card" />
          <input type="hidden" name="return" value="/loyalty" />
          <select name="business" className={control}>{businesses.map((business) => <option key={business.id} value={business.id}>{business.name}</option>)}</select>
          <input name="title" required placeholder="Card name" className={control} />
          <input name="stamps" type="number" min={2} max={20} defaultValue={5} className={control} />
          <input name="reward" required placeholder="What the customer receives" className={control} />
          <button className={button}>Create card</button>
        </form>
      ) : <p className="text-sm">A loyalty card needs one of your business profiles.</p>}
      {cards.map((card) => (
        <form key={String(card.id)} action={studioAction} className="glass-card grid gap-2 p-4">
          <HiddenLocale locale={locale} />
          <input type="hidden" name="intent" value="stamp" />
          <input type="hidden" name="return" value="/loyalty" />
          <input type="hidden" name="card" value={String(card.id)} />
          <p className="font-semibold">{String(card.title)} · {String(card.business)} · {String(card.stamps_required)} stamps · {String(card.reward_note)}</p>
          <input name="email" type="email" required placeholder="Customer account email" className={control} />
          <button className={button}>Add stamp</button>
        </form>
      ))}
      {user ? (
        <form action={studioAction} className="grid max-w-xl gap-2">
          <HiddenLocale locale={locale} />
          <input type="hidden" name="intent" value="redeem" />
          <input type="hidden" name="return" value="/loyalty" />
          <input name="deal" required placeholder="Your deal id" className={control} />
          <input name="note" required placeholder="Who redeemed it" className={control} />
          <button className={button}>Record a deal redemption</button>
        </form>
      ) : null}
    </div>
  );
}
