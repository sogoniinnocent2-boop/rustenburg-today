import { publishedServices } from "@/server/studio";

export default async function TutorsPage() {
  const tutors = publishedServices("tutoring");
  const schools = publishedServices("driving-school");
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-4xl">Tutors and driving schools</h1>
        <p className="mt-2 max-w-2xl text-sm">Only published profiles are listed. Qualifications are not added by the platform. Core lessons and K53 practice stay free.</p>
      </div>
      <section>
        <h2 className="font-serif text-2xl">Tutors</h2>
        {tutors.length ? tutors.map((item) => <p key={String(item.id)} className="text-sm">{String(item.name)} · {String(item.description)}</p>) : <p className="text-sm">No tutor profile is published.</p>}
      </section>
      <section>
        <h2 className="font-serif text-2xl">Driving schools</h2>
        {schools.length ? schools.map((item) => <p key={String(item.id)} className="text-sm">{String(item.name)} · {String(item.description)}</p>) : <p className="text-sm">No driving school is published.</p>}
      </section>
    </div>
  );
}
