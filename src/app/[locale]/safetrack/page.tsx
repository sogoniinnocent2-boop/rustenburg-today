import Link from "next/link";
import { redirect } from "next/navigation";
import { localePath } from "@/lib/i18n";
import { safeTrackAction } from "@/server/actions";
import { currentUser } from "@/server/session";
import { SAPS_GUIDANCE, mySafety } from "@/server/safetrack";
import { get } from "@/server/db";

export const metadata = { robots: { index: false, follow: false } };

export default async function SafeTrackPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ notice?: string; ref?: string; queued?: string; error?: string }> }) {
  const { locale } = await params;
  const query = await searchParams;
  const user = await currentUser();
  if (!user) redirect(`/${locale}/auth/sign-in?next=/safetrack`);
  const safety = mySafety(user);
  const birthMissing = !get("SELECT date_of_birth FROM profiles WHERE user_id = ? AND date_of_birth IS NOT NULL", user.id);
  const staff = user.roles.some((role) => ["administrator", "verification_officer", "emergency_reviewer", "incident_officer", "privacy_officer"].includes(role));
  const key = crypto.randomUUID();
  return (
    <div className="mx-auto grid max-w-5xl gap-6 px-4 py-8">
      <header className="glass-card grid gap-2 p-6">
        <p className="text-sm font-semibold text-[#1d4e89]">SafeTrack</p>
        <h1 className="text-3xl font-semibold text-graphite dark:text-cloud">Your family. Your safety. Your peace of mind.</h1>
        <p>SafeTrack helps a household prepare, share a position only with people you choose, and organise an emergency. It does not call the police, track anyone in secret, or replace 10111.</p>
        {staff ? <Link className="font-semibold text-[#1d4e89]" href={localePath(locale, "/safetrack/desk")}>Safety desk</Link> : null}
      </header>
      {query.error ? <p className="glass-card p-4 text-[#1d4e89]" role="alert">{query.error}</p> : null}
      {query.notice === "sos" ? (
        <p className="glass-card p-4" role="status">
          Incident {query.ref} is recorded. {query.queued || 0} notification{query.queued === "1" ? "" : "s"} queued. None are marked delivered. SafeTrack did not contact emergency services. If you need help now, call 10111 or 112.
        </p>
      ) : null}
      {query.notice === "missing" ? <p className="glass-card p-4" role="status">Platform reference {query.ref}. {SAPS_GUIDANCE}</p> : null}
      {query.notice === "saved" ? <p className="glass-card p-4" role="status">Saved.</p> : null}
      {birthMissing ? (
        <form action={safeTrackAction} className="glass-card grid gap-3 p-6">
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="intent" value="birth" />
          <p>SafeTrack needs your date of birth before an adult can open a household. It is stored on your profile.</p>
          <label className="grid gap-1">Date of birth<input name="dob" type="date" required className="rounded-xl border border-white/50 bg-white/70 px-3 py-2" /></label>
          <button className="w-fit rounded-full bg-[#101827] px-4 py-2 font-semibold text-white" type="submit">Save date of birth</button>
        </form>
      ) : null}

      <section className="glass-card grid gap-4 p-6" aria-labelledby="sos-title">
        <h2 id="sos-title" className="text-2xl font-semibold">Emergency</h2>
        <form action={safeTrackAction} className="grid gap-3">
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="intent" value="sos" />
          <input type="hidden" name="key" value={key} />
          <label className="grid gap-1">Optional note for your contacts<input name="note" maxLength={500} className="rounded-xl border border-white/50 bg-white/70 px-3 py-2" /></label>
          <button className="rounded-2xl bg-[#9a3412] px-6 py-5 text-xl font-semibold text-white" type="submit">Send SOS to my authorised contacts</button>
        </form>
        <p>An SOS tells contacts who already have permission to receive one. It is not a dispatch confirmation.</p>
      </section>

      <section className="glass-card grid gap-3 p-6">
        <h2 className="text-2xl font-semibold">If someone may be missing</h2>
        <p className="font-semibold">{SAPS_GUIDANCE}</p>
        <form action={safeTrackAction} className="grid gap-3">
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="intent" value="missing" />
          <label className="grid gap-1">Child profile, if this is about a dependant
            <select name="dependant" className="rounded-xl border border-white/50 bg-white/70 px-3 py-2" defaultValue="">
              <option value="">This report is about me</option>
              {safety.dependants.map((item) => <option key={item.id} value={item.id}>{item.preferred_name}</option>)}
            </select>
          </label>
          <label className="grid gap-1">Clothing<input name="clothing" className="rounded-xl border border-white/50 bg-white/70 px-3 py-2" /></label>
          <label className="grid gap-1">SAPS station<input name="station" className="rounded-xl border border-white/50 bg-white/70 px-3 py-2" /></label>
          <label className="grid gap-1">SAPS case reference, if you already have one<input name="case" className="rounded-xl border border-white/50 bg-white/70 px-3 py-2" /></label>
          <button className="rounded-full bg-[#101827] px-4 py-2 font-semibold text-white" type="submit">Record the platform incident</button>
        </form>
        <ul className="grid gap-2">
          {safety.incidents.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center justify-between gap-2">
              <span>{item.reference_code} · {item.incident_type} · {item.status}</span>
              {item.status !== "person_located" && item.status !== "closed" ? (
                <form action={safeTrackAction}>
                  <input type="hidden" name="locale" value={locale} />
                  <input type="hidden" name="intent" value="found" />
                  <input type="hidden" name="id" value={item.id} />
                  <button className="text-[#1d4e89]" type="submit">Mark the platform incident as person located</button>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
        <p>Marking a person located closes the SafeTrack record only. It does not close a SAPS case.</p>
      </section>

      <section className="glass-card grid gap-3 p-6">
        <h2 className="text-2xl font-semibold">Household</h2>
        <ul>{safety.households.map((item) => <li key={item.id}>{item.name}</li>)}</ul>
        <form action={safeTrackAction} className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="intent" value="household" />
          <label className="grid gap-1">Household name<input name="name" required className="rounded-xl border border-white/50 bg-white/70 px-3 py-2" /></label>
          <button className="self-end rounded-full bg-[#101827] px-4 py-2 font-semibold text-white" type="submit">Create</button>
        </form>
        {safety.households[0] ? (
          <form action={safeTrackAction} className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="intent" value="invite" />
            <input type="hidden" name="household" value={safety.households[0].id} />
            <label className="grid gap-1">Invite an adult by their account email<input name="email" type="email" required className="rounded-xl border border-white/50 bg-white/70 px-3 py-2" /></label>
            <button className="self-end rounded-full border px-4 py-2" type="submit">Invite</button>
          </form>
        ) : null}
        {safety.invites.map((item) => (
          <form key={item.id} action={safeTrackAction}>
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="intent" value="accept" />
            <input type="hidden" name="id" value={item.id} />
            <button className="text-[#1d4e89]" type="submit">Join {item.name}. This does not share your location.</button>
          </form>
        ))}
      </section>

      <section className="glass-card grid gap-3 p-6">
        <h2 className="text-2xl font-semibold">Who can see my information</h2>
        <ul>
          {safety.grants.length === 0 ? <li>Nobody else has a permission from you.</li> : safety.grants.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center justify-between gap-2">
              <span>{item.display_name} · {item.permission.replaceAll("_", " ")} · {item.status}</span>
              {item.status === "active" ? (
                <form action={safeTrackAction}>
                  <input type="hidden" name="locale" value={locale} />
                  <input type="hidden" name="intent" value="revoke" />
                  <input type="hidden" name="id" value={item.id} />
                  <button className="text-[#1d4e89]" type="submit">Withdraw</button>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
        <form action={safeTrackAction} className="grid gap-3 sm:grid-cols-3">
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="intent" value="grant" />
          <label className="grid gap-1">Their email<input name="email" type="email" required className="rounded-xl border border-white/50 bg-white/70 px-3 py-2" /></label>
          <label className="grid gap-1">Permission
            <select name="permission" className="rounded-xl border border-white/50 bg-white/70 px-3 py-2">
              <option value="receive_sos">Receive SOS</option>
              <option value="receive_journey_alerts">Receive journey alerts</option>
              <option value="view_live_location">View latest location</option>
              <option value="view_last_known">View last known location</option>
              <option value="view_profile">View profile</option>
              <option value="view_emergency_information">View emergency information</option>
            </select>
          </label>
          <button className="self-end rounded-full bg-[#101827] px-4 py-2 font-semibold text-white" type="submit">Grant</button>
        </form>
        <form action={safeTrackAction} className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="intent" value="contact" />
          <label className="grid gap-1">Emergency contact email. This does not make them a guardian or a location viewer.<input name="email" type="email" required className="rounded-xl border border-white/50 bg-white/70 px-3 py-2" /></label>
          <button className="self-end rounded-full border px-4 py-2" type="submit">Add contact</button>
        </form>
        <ul>{safety.contacts.map((item) => <li key={item.id}>{item.display_name} · emergency contact</li>)}</ul>
      </section>

      <section className="glass-card grid gap-3 p-6">
        <h2 className="text-2xl font-semibold">Children and dependants</h2>
        <p>A child profile has no login. Naming yourself as a parent does not grant guardian authority until a verification officer reviews it. Location sharing, once allowed, is shown here and is not hidden from the child.</p>
        {safety.households[0] ? (
          <form action={safeTrackAction} className="grid gap-3">
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="intent" value="dependant" />
            <input type="hidden" name="household" value={safety.households[0].id} />
            <label className="grid gap-1">Name the child uses<input name="preferred" required className="rounded-xl border border-white/50 bg-white/70 px-3 py-2" /></label>
            <label className="grid gap-1">Legal name, stored encrypted<input name="legal" required className="rounded-xl border border-white/50 bg-white/70 px-3 py-2" /></label>
            <label className="grid gap-1">Date of birth<input name="dob" type="date" required className="rounded-xl border border-white/50 bg-white/70 px-3 py-2" /></label>
            <label className="grid gap-1">Your claimed relationship
              <select name="relationship" className="rounded-xl border border-white/50 bg-white/70 px-3 py-2">
                <option value="parent">Parent</option>
                <option value="legal_guardian">Legal guardian</option>
                <option value="court_caregiver">Court-authorised caregiver</option>
                <option value="foster_caregiver">Foster caregiver</option>
              </select>
            </label>
            <button className="w-fit rounded-full bg-[#101827] px-4 py-2 font-semibold text-white" type="submit">Register dependant</button>
          </form>
        ) : <p>Create a household before registering a dependant.</p>}
        <ul className="grid gap-2">
          {safety.dependants.map((item) => (
            <li key={item.id} className="grid gap-1">
              <span>{item.preferred_name} · {item.relationship_type.replaceAll("_", " ")} · {item.verification_status}</span>
              <span>{item.location_shared ? "Location sharing is on. The child-facing household record says a guardian can see the latest report." : "Location sharing is off."}</span>
              {item.authority_status === "verified" && !item.location_shared ? (
                <form action={safeTrackAction}>
                  <input type="hidden" name="locale" value={locale} />
                  <input type="hidden" name="intent" value="child-location" />
                  <input type="hidden" name="dependant" value={item.id} />
                  <button className="text-[#1d4e89]" type="submit">Allow this guardian to see future location reports</button>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      <section className="glass-card grid gap-3 p-6">
        <h2 className="text-2xl font-semibold">Journey check-in</h2>
        <p>The website records the journey and who may be told if you miss the arrival time. It does not draw a live route. A missed check-in asks you first. It does not declare a person missing. Live background location needs a phone app, which is not available yet.</p>
        <form action={safeTrackAction} className="grid gap-3">
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="intent" value="journey" />
          <label className="grid gap-1">Destination<input name="destination" required className="rounded-xl border border-white/50 bg-white/70 px-3 py-2" /></label>
          <label className="grid gap-1">Expected arrival<input name="arrival" type="datetime-local" required className="rounded-xl border border-white/50 bg-white/70 px-3 py-2" /></label>
          <label className="grid gap-1">Emails of people who already have journey-alert permission, separated by commas<input name="contacts" className="rounded-xl border border-white/50 bg-white/70 px-3 py-2" /></label>
          <button className="w-fit rounded-full bg-[#101827] px-4 py-2 font-semibold text-white" type="submit">Start journey</button>
        </form>
      </section>

      <section className="glass-card grid gap-3 p-6">
        <h2 className="text-2xl font-semibold">Confidential concern</h2>
        <p>If a household or guardian arrangement is being used to threaten or control you, record it here. This does not publish your location.</p>
        <form action={safeTrackAction} className="grid gap-3">
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="intent" value="concern" />
          <textarea name="body" required minLength={12} className="min-h-28 rounded-xl border border-white/50 bg-white/70 px-3 py-2" />
          <button className="w-fit rounded-full border px-4 py-2" type="submit">Send to the privacy queue</button>
        </form>
      </section>
    </div>
  );
}
