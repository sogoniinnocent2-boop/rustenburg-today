# Changelog

## 17 November 2026

- Midnight Glass colours set to midnight navy `#101827`, cloud white `#F5F7FA` and graphite `#343B46`. Text on light glass stays the darker blue used for readable contrast.
- Tagline is “Discover. Connect. Learn. Trade. Experience. Grow.” with Afrikaans and Setswana lines.
- Location selector filters geotagged businesses, events, jobs and properties. News stays the published set. Empty cities stay empty.
- Privileged roles are applications. Seller and creator profiles are created when an administrator approves the request.
- Search suggestions, saved searches and a separate sponsored block.
- Community groups, organisation staff, property viewing requests and unpaid ticket holds with post-webhook codes and duplicate check-in refusal.
- National place records for the nine provinces and a principal city in each. No invented businesses.
- Nine service tests passed. Nothing is marked VERIFIED. Google, SMTP, merchant payments and Postgres remain unconnected.
- Liquid Glass Flow: a first-visit brand overlay that does not block clicks, 280ms route fades, route skeletons, and reduced-motion fallbacks. No animation library was added.
- News desk stores headlines, short permitted summaries and original links. Items stay in review unless an editor publishes them, or an official emergency source is explicitly allowed to publish a non-sensitive item. Today's Top Five stays empty until an editor schedules real stories. Vacancies cannot charge an application fee. The radio station stays off air until an authorised stream and a current licence record are saved. Weather and traffic stay blank until a sourced record exists.
- SafeTrack households, permission grants, dependant claims, SOS records and missing-person records run on the existing account and SQLite database. Location is not public. An SOS does not contact emergency services. No police agency is connected. Details are in SAFETRACK_IMPLEMENTATION_STATUS.md. Nothing is marked VERIFIED.

## 1.0.0 — 16 November 2026

First working build of the Rustenburg Today modular site.

- Next.js, TypeScript, Tailwind and a shared page shell in English, Setswana and Afrikaans.
- SQLite schema for the departments in the product brief, with service-layer permissions.
- Accounts, editorial workflow, community posts, media embeds, commerce records that stay unpaid until a signed webhook, jobs, courses, events and the remaining city directories.
- Search, Ask, briefing, map, alerts and an admin desk.
- Six passing service tests and a local browser pass recorded in TESTING.md.

Known gaps are listed in IMPLEMENTATION_STATUS.md. Email sending, Postgres row-level security, a live payment provider and production hosting are not done.
