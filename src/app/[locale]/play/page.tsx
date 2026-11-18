import Link from "next/link";
import { localePath } from "@/lib/i18n";
import { HiddenLocale, Notice, button, control } from "@/components/chrome";
import { MemoryGame } from "@/components/memory-game";
import { memoryAction, studioAction } from "@/server/actions";
import { memoryBoard } from "@/server/commercial";
import { SUDOKU_GIVEN, dailyLetters } from "@/server/studio";
import { currentUser } from "@/server/session";

export default async function PlayPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ error?: string; notice?: string }> }) {
  const { locale } = await params;
  const query = await searchParams;
  const user = await currentUser();
  const board = memoryBoard();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-4xl">Play</h1>
        <p className="mt-2 max-w-2xl text-sm">Memory match is free. The words are original to this page. A score is stored only after you finish a round on this device. It is not a prize competition.</p>
      </div>
      <Notice error={query.error} notice={query.notice} />
      {user ? <MemoryGame action={memoryAction} locale={locale} /> : <p className="text-sm">Sign in to play and save a finished round.</p>}
      {user ? (
        <>
          <form action={studioAction} className="grid max-w-md gap-2">
            <HiddenLocale locale={locale} />
            <input type="hidden" name="intent" value="word" />
            <input type="hidden" name="token" value={dailyLetters().token} />
            <p className="text-sm">Unscramble: {dailyLetters().letters}</p>
            <input name="guess" required placeholder="Your word" className={control} />
            <button className={button}>Check word</button>
          </form>
          <form action={studioAction} className="grid max-w-sm grid-cols-4 gap-2">
            <HiddenLocale locale={locale} />
            <input type="hidden" name="intent" value="sudoku" />
            {SUDOKU_GIVEN.map((given, index) => given ? <input key={index} name={`c${index}`} value={given} readOnly className="rounded-xl border px-2 py-3 text-center" /> : <input key={index} name={`c${index}`} required inputMode="numeric" className="rounded-xl border px-2 py-3 text-center" />)}
            <button className={`${button} col-span-4`}>Check puzzle</button>
          </form>
        </>
      ) : null}
      <p className="text-sm"><Link href={localePath(locale, "/practice/trivia")}>South Africa quiz</Link> · <Link href={localePath(locale, "/practice/sequence")}>Number sequences</Link> · <Link href={localePath(locale, "/practice/spelling")}>Spelling</Link></p>
      <section>
        <h2 className="font-serif text-2xl">Finished rounds</h2>
        {board.length ? board.map((row, index) => <p key={`${row.name}-${index}`} className="text-sm">{row.name} · {row.moves} moves · {row.seconds}s</p>) : <p className="text-sm">No finished round is on file.</p>}
      </section>
    </div>
  );
}
