import { HiddenLocale, Notice, button, control } from "@/components/chrome";
import { studioAction } from "@/server/actions";
import { all } from "@/server/db";
import { myAppointments } from "@/server/studio";
import { currentUser } from "@/server/session";

export default async function AppointmentsPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ error?: string; notice?: string }> }) {
  const { locale } = await params;
  const query = await searchParams;
  const user = await currentUser();
  const rows = user ? myAppointments(user.id) : [];
  const businesses = all<{ id: string; name: string }>("SELECT id, name FROM businesses WHERE status = 'published' AND deleted_at IS NULL ORDER BY name LIMIT 40");
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-4xl">Appointments</h1>
        <p className="mt-2 max-w-2xl text-sm">Request a time with a published business. The business confirms or declines. No booking fee is charged.</p>
      </div>
      <Notice error={query.error} notice={query.notice} />
      {user && businesses.length ? (
        <form action={studioAction} className="grid max-w-xl gap-2">
          <HiddenLocale locale={locale} />
          <input type="hidden" name="intent" value="appointment" />
          <input type="hidden" name="return" value="/appointments" />
          <select name="business" className={control}>{businesses.map((business) => <option key={business.id} value={business.id}>{business.name}</option>)}</select>
          <input name="when" type="datetime-local" required className={control} />
          <textarea name="note" required placeholder="What the appointment is for" className={control} />
          <button className={button}>Request appointment</button>
        </form>
      ) : <p className="text-sm">{businesses.length ? "Sign in to request an appointment." : "No published business is available for appointments."}</p>}
      <section className="space-y-3">
        <h2 className="font-serif text-2xl">Your appointments</h2>
        {rows.length ? rows.map((row) => (
          <div key={`${row.id}-${row.direction}`} className="text-sm">
            <p>{row.direction === "in" ? "Request from" : "Request to"} {String(row.business)} · {String(row.starts_at)} · {String(row.status)}</p>
            <p>{String(row.note)}</p>
            {row.direction === "in" && row.status === "requested" ? (
              <div className="mt-1 flex gap-2">
                <form action={studioAction}><HiddenLocale locale={locale} /><input type="hidden" name="intent" value="confirm" /><input type="hidden" name="return" value="/appointments" /><input type="hidden" name="id" value={String(row.id)} /><button className={button}>Confirm</button></form>
                <form action={studioAction}><HiddenLocale locale={locale} /><input type="hidden" name="intent" value="decline" /><input type="hidden" name="return" value="/appointments" /><input type="hidden" name="id" value={String(row.id)} /><button className={button}>Decline</button></form>
              </div>
            ) : null}
          </div>
        )) : <p className="text-sm">No appointment is on your account.</p>}
      </section>
    </div>
  );
}
