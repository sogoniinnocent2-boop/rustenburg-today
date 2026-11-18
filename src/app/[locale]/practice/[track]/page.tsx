import { notFound } from "next/navigation";
import { HiddenLocale, Notice, button } from "@/components/chrome";
import { practiceAction } from "@/server/actions";
import { PRACTICE_TRACKS, practiceSet, type PracticeTrack } from "@/server/commercial";

const titles: Record<PracticeTrack, string> = {
  k53: "K53 practice",
  language: "Language practice",
  trivia: "South Africa quiz",
  sequence: "Number sequences",
  spelling: "Spelling",
};

export default async function PracticeTrackPage({ params, searchParams }: { params: Promise<{ locale: string; track: string }>; searchParams: Promise<{ error?: string; notice?: string }> }) {
  const { locale, track } = await params;
  if (!(PRACTICE_TRACKS as readonly string[]).includes(track)) notFound();
  const name = track as PracticeTrack;
  const query = await searchParams;
  const questions = practiceSet(name);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-4xl">{titles[name]}</h1>
        <p className="mt-2 max-w-2xl text-sm">Free practice. Unanswered questions score zero. This is not an official examination and it is not a prize.</p>
      </div>
      <Notice error={query.error} notice={query.notice} />
      <form action={practiceAction} className="space-y-4">
        <HiddenLocale locale={locale} />
        <input type="hidden" name="track" value={name} />
        {questions.map((question, index) => (
          <fieldset key={question.id} className="glass-card space-y-2 p-4">
            <legend className="font-semibold">{index + 1}. {question.prompt}</legend>
            {question.options.map((option, optionIndex) => <label key={option} className="block text-sm"><input type="radio" name={question.id} value={optionIndex} /> {option}</label>)}
            <p className="text-xs">{question.note}</p>
          </fieldset>
        ))}
        <button className={button}>Mark my answers</button>
      </form>
    </div>
  );
}
