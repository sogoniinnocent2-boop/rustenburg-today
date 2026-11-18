import { HiddenLocale, Notice, button } from "@/components/chrome";
import { practiceAction } from "@/server/actions";
import { practiceSet } from "@/server/commercial";

const offered = ["English", "Afrikaans", "isiZulu", "isiXhosa", "Sepedi", "Setswana", "Sesotho", "Xitsonga", "siSwati", "Tshivenda", "isiNdebele", "French", "Portuguese", "Spanish", "Mandarin"];

export default async function LanguagesPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ error?: string; notice?: string }> }) {
  const { locale } = await params;
  const query = await searchParams;
  const questions = practiceSet("language");
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-4xl">Language practice</h1>
        <p className="mt-2 max-w-2xl text-sm">The greeting check below uses a few common words. It is not a full course, and it is not presented as a native-speaker curriculum. Other languages can be added when a reviewer files lessons.</p>
        <p className="mt-2 text-sm">{offered.join(", ")}.</p>
      </div>
      <Notice error={query.error} notice={query.notice} />
      <form action={practiceAction} className="space-y-4">
        <HiddenLocale locale={locale} />
        <input type="hidden" name="track" value="language" />
        {questions.map((question, index) => (
          <fieldset key={question.id} className="glass-card space-y-2 p-4">
            <legend className="font-semibold">{index + 1}. {question.prompt}</legend>
            {question.options.map((option, optionIndex) => (
              <label key={option} className="block text-sm"><input type="radio" name={question.id} value={optionIndex} /> {option}</label>
            ))}
          </fieldset>
        ))}
        <button className={button}>Mark my answers</button>
      </form>
    </div>
  );
}
