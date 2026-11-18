import { Notice } from "@/components/chrome";
import { StudyTimer } from "@/components/study-timer";
import { studyAction } from "@/server/actions";
import { focusStats } from "@/server/commercial";
import { currentUser } from "@/server/session";

export default async function StudyPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ error?: string; notice?: string }> }) {
  const { locale } = await params;
  const query = await searchParams;
  const user = await currentUser();
  const stats = user ? focusStats(user.id) : { sessions: 0, minutes: 0 };
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-4xl">Study timer</h1>
        <p className="mt-2 max-w-2xl text-sm">Core lessons stay free. This timer records a session only when it reaches zero. It does not invent a study streak.</p>
      </div>
      <Notice error={query.error} notice={query.notice} />
      {user ? <StudyTimer action={studyAction} locale={locale} /> : <p className="text-sm">Sign in to record a finished session.</p>}
      <p className="text-sm">{stats.sessions} recorded session{stats.sessions === 1 ? "" : "s"} · {stats.minutes} minutes.</p>
    </div>
  );
}
