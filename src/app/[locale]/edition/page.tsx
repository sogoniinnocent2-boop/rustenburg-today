import { freshWires } from "@/server/citydesk";

export default async function EditionPage() {
  const stories = freshWires(8);
  return (
    <section className="max-w-3xl space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#1d4e89]">Morning edition</p>
        <h1 className="mt-2 font-serif text-4xl">Stories from the current official feed</h1>
        <p className="mt-2 text-sm">This page lists headlines the desk is allowed to show. It is not a separate edited newspaper until an editor schedules one. The same list is available as a <a className="font-semibold text-[#1d4e89]" href="/api/v1/briefing.xml">briefing feed</a>.</p>
      </div>
      {stories.length ? (
        <ol className="space-y-5">
          {stories.map((story, index) => (
            <li key={String(story.id)}>
              <p className="text-xs text-[#1d4e89]">{index + 1} · {String(story.publisher)}</p>
              <a className="mt-1 block font-serif text-2xl" href={String(story.canonical_url)}>{String(story.headline)}</a>
              {story.summary ? <p className="mt-1 text-sm">{String(story.summary)}</p> : null}
            </li>
          ))}
        </ol>
      ) : <p className="text-sm">No fresh official headline is on file.</p>}
    </section>
  );
}
