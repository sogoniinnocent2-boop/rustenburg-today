import Link from "next/link";
import { ExploreIcon } from "@/components/explore-icon";
import { localePath } from "@/lib/i18n";

const ideas: Array<[string, string, string, string]> = [
  ["/desks", "City desks", "Eighty desks for schools, stories, talent, business and neighbourhood notes.", "desks"],
  ["/community", "Public posts", "Discover and Following feeds, reactions, comments and hashtags. No private chat.", "community"],
  ["/books", "Books", "Write a book. A free book can be read. A priced book stays a sample until payment is connected.", "story"],
  ["/live", "Live notices", "A public schedule. The camera is not connected, so this is not a broadcast.", "events"],
  ["/briefing", "My Daily Briefing", "A signed-in summary of published news, events, jobs and notices already on the platform.", "news"],
  ["/edition", "Morning Edition", "The current official headlines, with source and original link.", "story"],
  ["/story", "The story of Rustenburg", "A sourced introduction and timeline. Memories stay unpublished until review.", "heritage"],
  ["/watch", "City Watch", "Published notices with who filed them, the time, and the expiry.", "watch"],
  ["/news", "Story Tracker", "Track a published story. An in-app alert is sent when that story is corrected or withdrawn.", "news"],
  ["/saved", "Read Later", "Saved articles, jobs, events and listings, with their titles.", "story"],
  ["/community/new", "Community Reporter", "A news tip or a sensitive report waits for review.", "community"],
  ["/map", "Discover Map", "Verified public places. Private locations are not plotted.", "places"],
  ["/jobs", "Opportunity Radar", "Published vacancies. A listing drops off after its closing date.", "work"],
  ["/radio", "Listen", "The player stays off until a licensed stream is connected.", "news"],
  ["/plans", "Business plans", "Until payments are connected, a priced plan is a preview and is not revenue.", "business"],
  ["/invoices", "Quotations and invoices", "A business writes the document. The platform does not collect the money.", "business"],
  ["/appointments", "Appointments", "Request a time with a published business.", "events"],
  ["/loyalty", "Loyalty cards", "Stamps recorded on an account.", "market"],
  ["/planner", "Study planner", "The week you save.", "learn"],
  ["/tutors", "Tutors and driving schools", "Published profiles only.", "learn"],
  ["/practice/trivia", "South Africa quiz", "Four general-knowledge questions. Not a prize.", "tools"],
  ["/network", "Request a quote", "Customers ask for free. A request is not an exclusive lead.", "business"],
  ["/k53", "K53 practice", "Free road-rule notes. Not an official paper.", "tools"],
  ["/languages", "Language practice", "A few common greetings. Not a full course.", "learn"],
  ["/study", "Study timer", "Records a session when the timer reaches zero.", "learn"],
  ["/play", "Play", "A free memory match.", "events"],
  ["/tools", "Document tools", "Word count and a simple file download. No AI provider is connected.", "tools"],
];

export default async function FeaturesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return (
    <section className="desk-page">
      <header className="desk-hero">
        <ExploreIcon name="desks" />
        <div>
          <h1 className="font-serif text-4xl">More of the platform</h1>
          <p className="mt-2 max-w-2xl text-sm">Each card opens a real page. A feature that is not live says so on that page.</p>
        </div>
      </header>
      <div className="desk-grid">
        {ideas.map(([href, title, note, icon]) => (
          <Link key={title} className="desk-card" href={localePath(locale, href)}>
            <ExploreIcon name={icon} />
            <span>
              <span className="desk-title">{title}</span>
              <span className="desk-note">{note}</span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
