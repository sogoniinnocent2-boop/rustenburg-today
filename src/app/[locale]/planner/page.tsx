import { HiddenLocale, Notice, button, control } from "@/components/chrome";
import { studioAction } from "@/server/actions";
import { studyPlan } from "@/server/studio";
import { currentUser } from "@/server/session";

const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default async function PlannerPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ error?: string; notice?: string }> }) {
  const { locale } = await params;
  const query = await searchParams;
  const user = await currentUser();
  const blocks = user ? studyPlan(user.id) : [];
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-4xl">Study planner</h1>
        <p className="mt-2 max-w-2xl text-sm">Add the subjects you plan to study. The list shows only what you saved. It does not invent a streak or a mark.</p>
      </div>
      <Notice error={query.error} notice={query.notice} />
      {user ? (
        <form action={studioAction} className="grid max-w-xl gap-2">
          <HiddenLocale locale={locale} />
          <input type="hidden" name="intent" value="study" />
          <input type="hidden" name="return" value="/planner" />
          <select name="weekday" className={control}>{days.map((day, index) => <option key={day} value={index}>{day}</option>)}</select>
          <input name="subject" required placeholder="Subject" className={control} />
          <input name="minutes" type="number" min={10} max={180} defaultValue={30} className={control} />
          <button className={button}>Add to the week</button>
        </form>
      ) : <p className="text-sm">Sign in to keep a study plan.</p>}
      <ul className="space-y-2">
        {blocks.length ? blocks.map((block) => (
          <li key={block.id} className="flex flex-wrap items-center gap-2 text-sm">
            <span>{days[block.weekday]} · {block.subject} · {block.minutes} minutes</span>
            <form action={studioAction}><HiddenLocale locale={locale} /><input type="hidden" name="intent" value="forget" /><input type="hidden" name="return" value="/planner" /><input type="hidden" name="id" value={block.id} /><button className={button}>Remove</button></form>
          </li>
        )) : <li className="text-sm">No study block is saved.</li>}
      </ul>
    </div>
  );
}
