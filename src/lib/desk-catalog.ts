export type DeskGroup = "study" | "youth" | "stories" | "people" | "business" | "income" | "city";
export type DeskMode = "open" | "hold" | "income" | "personal";

export type DeskSpec = {
  kind: string;
  title: string;
  summary: string;
  group: DeskGroup;
  mode: DeskMode;
};

export const DESK_GROUPS: Array<{ id: DeskGroup; title: string }> = [
  { id: "study", title: "Schools and study" },
  { id: "youth", title: "Youth and talent" },
  { id: "stories", title: "Stories" },
  { id: "people", title: "People and community" },
  { id: "business", title: "Business and work" },
  { id: "income", title: "Paid extras" },
  { id: "city", title: "City life" },
];

export const DESKS: DeskSpec[] = [
  { kind: "school", group: "study", mode: "open", title: "School desk", summary: "A school publishes its own term dates, notices and contacts." },
  { kind: "homework", group: "study", mode: "open", title: "Homework board", summary: "A teacher posts the task and the due date. This is not a grade." },
  { kind: "papers", group: "study", mode: "open", title: "Past-paper shelf", summary: "A paper link filed by subject and year. Anyone can open the link." },
  { kind: "circle", group: "study", mode: "open", title: "Study circle", summary: "One subject, one time, and a place or link the host publishes." },
  { kind: "countdown", group: "study", mode: "open", title: "Exam countdown", summary: "A date the school itself enters. No date is invented here." },
  { kind: "reading", group: "study", mode: "open", title: "Reading list", summary: "A teacher pins a book or lesson in English, Setswana or Afrikaans." },
  { kind: "tutor-note", group: "study", mode: "open", title: "Tutor board", summary: "A person lists a subject, an area and a rate. A request is not a paid booking." },
  { kind: "learner-note", group: "study", mode: "personal", title: "Learner record", summary: "Your own note of a lesson finished on this platform. It is not a qualification." },
  { kind: "bursary", group: "study", mode: "open", title: "Bursary desk", summary: "A bursary with a closing date and a link to the source." },
  { kind: "career", group: "study", mode: "open", title: "Career morning", summary: "Employers who opt in, and a date the school publishes." },
  { kind: "talent", group: "youth", mode: "open", title: "Talent page", summary: "A short bio, work the person owns, and a contact they choose to share." },
  { kind: "audition", group: "youth", mode: "open", title: "Audition board", summary: "A real call from the organiser, with a date and a place." },
  { kind: "fixture", group: "youth", mode: "open", title: "Club fixture", summary: "The match, the ground, and the score only after the club enters it." },
  { kind: "mentor", group: "youth", mode: "open", title: "Mentor hour", summary: "An adult offers one hour. This does not share anyone's live location." },
  { kind: "showcase", group: "youth", mode: "open", title: "Showcase night", summary: "A real event. Ticket payment stays on the tickets desk and is not collected here." },
  { kind: "youth-notice", group: "youth", mode: "open", title: "Youth notice", summary: "A bursary, trial or workshop with its source." },
  { kind: "neighbourhood", group: "stories", mode: "open", title: "Neighbourhood page", summary: "A note published for one place. It is not an official ward channel." },
  { kind: "series", group: "stories", mode: "open", title: "Story series", summary: "Part of a continuing story. The story tracker still follows published news." },
  { kind: "digest", group: "stories", mode: "open", title: "Desk digest", summary: "Follow a desk. A new published item sends an in-app note. Mail is sent only when email is configured." },
  { kind: "correction", group: "stories", mode: "hold", title: "Correction slip", summary: "A reader flags a fact. It stays off the public list until an editor accepts it." },
  { kind: "oral", group: "stories", mode: "hold", title: "Oral history", summary: "A dated memory. It stays unpublished until an editor approves it." },
  { kind: "photo", group: "stories", mode: "hold", title: "Photo desk", summary: "A description, place and credit. No picture is shown until an editor approves a file." },
  { kind: "skill", group: "people", mode: "open", title: "Skill swap", summary: "An offer or a request. Money is optional and is not collected on this page." },
  { kind: "hall", group: "people", mode: "open", title: "Hall calendar", summary: "Open slots the hall manager publishes. A request is not a confirmed booking." },
  { kind: "lost", group: "people", mode: "hold", title: "Lost and found", summary: "Items only. Do not post a child's phone number or a home address. An editor reviews it first." },
  { kind: "language", group: "people", mode: "open", title: "Language help", summary: "A volunteer offers English, Setswana or Afrikaans and sets their own times." },
  { kind: "cv", group: "people", mode: "open", title: "CV clinic", summary: "A named person offers a slot. The CV stays with the person who owns it." },
  { kind: "checklist", group: "people", mode: "open", title: "Official checklist", summary: "Steps that link to an official page. This desk does not collect ID numbers." },
  { kind: "faith", group: "people", mode: "open", title: "Faith times", summary: "Service times a congregation publishes, with the name of who published them." },
  { kind: "food-point", group: "people", mode: "open", title: "Food point", summary: "Hours a kitchen or parcel desk publishes. The list stays empty until they do." },
  { kind: "pin", group: "income", mode: "income", title: "Featured business pin", summary: "A paid week on the map. While payments are off this is a preview, not a live pin and not revenue." },
  { kind: "job-pin", group: "income", mode: "income", title: "Job highlight", summary: "A request to pin a real vacancy. Reading jobs stays free. This does not publish a job by itself." },
  { kind: "recruit", group: "income", mode: "income", title: "Recruitment bundle", summary: "Several vacancies on one future invoice. Nothing is charged today." },
  { kind: "slots", group: "income", mode: "income", title: "Marketplace slots", summary: "A request for extra listing room. A few listings stay free. No fee is taken here." },
  { kind: "ticket-note", group: "income", mode: "income", title: "Ticket fee note", summary: "The fee an organiser wants to charge later, in rands. The browser cannot mark a ticket paid." },
  { kind: "property-pin", group: "income", mode: "income", title: "Property feature", summary: "A request for a week at the top of property. It is not placed while payments are off." },
  { kind: "banner", group: "income", mode: "income", title: "Category banner", summary: "A request for an ad slot. A live advertisement is labelled Sponsored and is booked from Advertising." },
  { kind: "newsletter", group: "income", mode: "income", title: "Newsletter slot", summary: "A request for one labelled line in a future edition. It does not choose the lead story." },
  { kind: "sponsored", group: "income", mode: "income", title: "Sponsored story request", summary: "A request for a labelled story. It cannot take the lead position." },
  { kind: "podcast-read", group: "income", mode: "income", title: "Podcast read", summary: "A request for a labelled spoken line. It runs only inside an episode that is actually published." },
  { kind: "boost", group: "income", mode: "income", title: "Event boost", summary: "A request to feature a published event. The event itself is created on the events desk." },
  { kind: "visit", group: "income", mode: "income", title: "Verification visit", summary: "A request for a paid check. No verified badge is granted from this form." },
  { kind: "school-brand", group: "income", mode: "income", title: "School term page", summary: "A request for a branded school page. School notices stay free to read." },
  { kind: "tutor-pin", group: "income", mode: "income", title: "Tutor pin", summary: "A request for a paid place on the tutor board. The tutor's own rate is separate." },
  { kind: "stay-pin", group: "income", mode: "income", title: "Tourism feature", summary: "A request for a week on tourism. Availability is only what the owner writes." },
  { kind: "print", group: "income", mode: "income", title: "Licensed print", summary: "A request to buy a print. Only a photograph this desk has the right to sell can be offered later." },
  { kind: "edition", group: "income", mode: "income", title: "Business edition", summary: "A labelled page a firm wants later. It stays separate from the city news lead." },
  { kind: "tip", group: "income", mode: "income", title: "Tip jar", summary: "An amount a creator would accept later. Nothing is collected." },
  { kind: "hours", group: "business", mode: "open", title: "Opening hours", summary: "Hours the business types. The page says they came from that business." },
  { kind: "menu", group: "business", mode: "open", title: "Menu", summary: "Dishes and prices a kitchen publishes. No price is added for them." },
  { kind: "quote", group: "business", mode: "open", title: "Quote request", summary: "A customer asks. This page does not take payment." },
  { kind: "invoice-ask", group: "business", mode: "open", title: "Invoice request", summary: "A request for a document. The invoices desk writes it. Status stays unpaid until a signed webhook." },
  { kind: "roster", group: "business", mode: "personal", title: "Private roster", summary: "Staff times for your account only. Other people cannot read this list." },
  { kind: "supplier", group: "business", mode: "open", title: "Supplier list", summary: "A farm, hardware shop or spaza that publishes its own profile note." },
  { kind: "tender", group: "business", mode: "open", title: "Tender board", summary: "A notice with a source link and a closing date." },
  { kind: "reply", group: "business", mode: "open", title: "Owner reply", summary: "A public answer under a business name the owner writes." },
  { kind: "stall", group: "business", mode: "open", title: "Stall map", summary: "A stall the organiser says they assigned. This is not a municipal market roll." },
  { kind: "farm", group: "business", mode: "open", title: "Farm notice", summary: "Livestock, feed or a field day the farmer publishes." },
  { kind: "deal", group: "business", mode: "open", title: "Deal card", summary: "An offer with an end date the business sets. It is not labelled Sponsored." },
  { kind: "classified", group: "business", mode: "open", title: "Classified", summary: "A short public note. Extra paid slots are not charged while payments are off." },
  { kind: "venue", group: "business", mode: "open", title: "Venue hire", summary: "A hall or ground lists a rate. The request is not a paid booking." },
  { kind: "block", group: "city", mode: "personal", title: "Load-shedding block", summary: "Save your block for yourself. No live stage is shown, because no schedule feed is connected." },
  { kind: "outage", group: "city", mode: "hold", title: "Outage notice", summary: "Water or power. It stays hidden until an editor can see a source." },
  { kind: "taxi", group: "city", mode: "open", title: "Taxi route", summary: "A rank and a route an association publishes." },
  { kind: "transport", group: "city", mode: "open", title: "School transport", summary: "A pickup note the operator publishes for a named school." },
  { kind: "recycling", group: "city", mode: "open", title: "Recycling point", summary: "A place someone is willing to name. It is not added to the map until an editor plots it." },
  { kind: "library", group: "city", mode: "open", title: "Library week", summary: "Hours and events the library publishes." },
  { kind: "members", group: "city", mode: "personal", title: "Club members", summary: "A private list on your account. Fixtures belong on the club fixture desk." },
  { kind: "rehearsal", group: "city", mode: "open", title: "Rehearsal night", summary: "An evening a choir or band publishes." },
  { kind: "lend", group: "city", mode: "open", title: "Tool library", summary: "A tool a neighbour will lend. Pickup is arranged by them." },
  { kind: "result", group: "city", mode: "open", title: "Match result", summary: "A score a school or club enters after the match." },
  { kind: "attendance", group: "city", mode: "personal", title: "Attendance book", summary: "A private note for the school account. It is not a public ranking of children." },
  { kind: "equipment", group: "city", mode: "open", title: "Equipment borrow", summary: "What a school says a class can ask to borrow." },
  { kind: "alumni", group: "city", mode: "open", title: "Alumni note", summary: "A person chooses to say where they studied." },
  { kind: "ward", group: "city", mode: "open", title: "Ward meeting", summary: "A date, a place and a source. This is an independent notice, not a council channel." },
  { kind: "condolence", group: "city", mode: "hold", title: "Condolence notice", summary: "A family submits it. An editor approves it before it is public." },
  { kind: "ground", group: "city", mode: "open", title: "Ground hours", summary: "Open hours the ground manager publishes." },
  { kind: "embed", group: "city", mode: "open", title: "Creator link", summary: "A link to video or audio the creator has the right to share. The page does not copy the file." },
  { kind: "collection", group: "city", mode: "personal", title: "Saved collection", summary: "A private list of titles you want to keep together." },
  { kind: "school-edition", group: "city", mode: "open", title: "School edition", summary: "A note from a school. Public headlines stay on the news desk." },
];

const byKind = new Map(DESKS.map((desk) => [desk.kind, desk]));

export function deskByKind(kind: string): DeskSpec | undefined {
  return byKind.get(kind);
}

export function desksIn(group: DeskGroup): DeskSpec[] {
  return DESKS.filter((desk) => desk.group === group);
}
