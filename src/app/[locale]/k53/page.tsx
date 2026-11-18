import { HiddenLocale, Notice, button } from "@/components/chrome";
import { practiceAction } from "@/server/actions";
import { practiceSet } from "@/server/commercial";

export default async function K53Page({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ error?: string; notice?: string }> }) {
  const { locale } = await params;
  const query = await searchParams;
  const questions = practiceSet("k53");
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-4xl">K53 practice</h1>
        <p className="mt-2 max-w-2xl text-sm">Free practice notes about ordinary road rules. This is not an official learner-licence paper, and a score here does not guarantee a pass. No protected exam paper is stored.</p>
      </div>
      <Notice error={query.error} notice={query.notice} />
      <form action={practiceAction} className="space-y-4">
        <HiddenLocale locale={locale} />
        <input type="hidden" name="track" value="k53" />
        {questions.map((question, index) => (
          <fieldset key={question.id} className="glass-card space-y-2 p-4">
            <legend className="font-semibold">{index + 1}. {question.prompt}</legend>
            {question.options.map((option, optionIndex) => (
              <label key={option} className="block text-sm"><input type="radio" name={question.id} value={optionIndex} /> {option}</label>
            ))}
            <p className="text-xs">{question.note}</p>
          </fieldset>
        ))}
        <button className={button}>Mark my answers</button>
      </form>
    </div>
  );
}
