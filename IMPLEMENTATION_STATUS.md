# Implementation status

Updated: 17 November 2026.

Statuses: NOT STARTED, IN PROGRESS, IMPLEMENTED, TESTING, VERIFIED, BLOCKED.

Only VERIFIED means the full definition of completion: interface, database, server logic, permissions, validation, loading/empty/error states, persistence, a tested user workflow, admin controls where needed, security checks and documentation. Nothing in this file is marked VERIFIED. Automated tests and a browser pass cover the flows named below. They do not certify the whole product.

No completion percentage is stated.

## Checked on 17 November 2026

- `npx tsc --noEmit` passed.
- `npx tsx --test tests/platform.test.ts`: 11 passed, 0 failed. The added SafeTrack test covers consent, revocation, household isolation, unverified guardians, honest SOS queueing, stale locations, denied unofficial access and two-reviewer disclosure.
- The 17 November suite covers role applications (self-serve seller is refused), the South Africa → province geography seed, unpaid ticket holds that refuse a second sale when capacity is 1, ticket codes issued only after a signed webhook, duplicate check-in refusal, search suggestions that do not invent a title, a group, a viewing request and organisation staff.
- Google sign-in, SMTP delivery, a merchant payment account, Postgres and a populated national map were not exercised. Production ticket payments stay off.
- Browser on the development server: home in English and Afrikaans, Setswana home returned HTTP 200, registration, development email-verify link, sign-in, account roles, a community post that persisted, empty jobs, Ask for “digital city”, daily briefing for a signed-in person, OpenStreetMap tiles on the city map, resident denied at `/admin`, administrator dashboard counts (2 users, 1 article, 1 post).
- Motion pass on `http://localhost:3000`: first visit ran the brand overlay; a later full load of `/en/news` kept it hidden (`display: none`). Client navigation home → news → back → forward did not add a document load. Throttled navigation showed the property card skeleton and the account skeleton, then the real pages. Search for “digital” returned the demonstration article. `/en/jobs` and `/en/property` stayed empty. Sign-in still explains that Google is not configured. Reduced motion set page and ambient animations to none. A missing image request showed the “Image unavailable” frame. `npx tsc --noEmit` passed. No low-powered physical phone was used.

## Platform

| Area | Status | Evidence and limit |
| --- | --- | --- |
| One account, profiles, roles | TESTING | Register, verify and sign-in work. Privileged roles are applications. A standard account does not grant seller, organiser, journalist or landlord. An administrator approves or rejects the request. Google sign-in runs only when client credentials are set. |
| Email delivery | TESTING | With no `SMTP_HOST`, mail stays queued and the development verify link is shown once. With `SMTP_HOST`, the worker sends through SMTP and uses STARTTLS on port 587. No mailbox was connected in this pass. |
| Language URLs `/en` `/tn` `/af` | TESTING | Navigation strings switch. Article body falls back to an approved translation. The UI catalogue is not a professionally reviewed translation. |
| Theme | TESTING | Light and dark class from the theme control. Liquid Glass Flow adds a first-visit brand overlay, 280ms route fades, skeletons and a hidden-tab pause. `prefers-reduced-motion` removes those animations. Contrast was checked on the home hero in the browser, not with an automated audit. |
| Search and Ask | TESTING | Suggestions come from indexed titles. Sponsored matches stay in a separate labelled block. Saved searches and history clearing require a signed-in account. Ask still returns only stored records. |
| Daily briefing | TESTING | Signed-in briefing listed the demonstration article and empty states for events, jobs, deals and notices. |
| Map | TESTING | Leaflet rendered OpenStreetMap tiles. No verified public points are seeded. |
| Alerts and web push | IN PROGRESS | In-app notifications and preference rows exist. Web push is not sent. The service worker file is not registered. |
| Messaging | IMPLEMENTED | Service rules block messages involving a minor and honour blocks. The account inbox exists. A two-person browser thread was not exercised. |
| Payments | TESTING | Signed webhook, amount match, idempotency and browser-pay refusal passed in tests. A ticket order becomes paid only through that webhook, which then issues a unique code. No South African merchant is connected. `payment_mode` stays disabled. |
| Uploads | TESTING | A text file disguised as an image was rejected. Images are served by id. Video files are not accepted. |
| Rewards | TESTING | Ledger rules and a published offer redemption passed in the service test. Offers appear on Account → rewards after an administrator publishes them. |
| PostgreSQL / Supabase RLS | IN PROGRESS | `supabase/migrations/0001_init.sql` enables row-level security on 162 tables and grants no policies. The running database is still SQLite. The migration has not been applied. |
| Production hosting, SSL, monitoring, Core Web Vitals | NOT STARTED | Local `next build` succeeded. No host, domain or field measurement. |
| Malware scanning | NOT STARTED | Uploads are limited by type and size only. |

## Departments

| Department | Status | What exists |
| --- | --- | --- |
| 01 News | TESTING | Draft, review, schedule, publish, translation fallback, search and comments are in the editorial service and covered by tests. The public article page shows the labelled demonstration story in English and Afrikaans. |
| 02 Podcasts | TESTING | Programme and episode records, playback progress and the demonstration WAV exist. Rights must be confirmed for new music. |
| 03 Rustenburg TV | IMPLEMENTED | Videos stay pending until moderation and play only through YouTube, Vimeo or Mux embeds. No self-hosted video platform. |
| 04 Talent | IMPLEMENTED | Profiles, auditions, contests and votes are in the media service. A contest entry is covered by the test file. |
| 05 Advertising | TESTING | A campaign stays off the page until approval and a verified or waived payment. Sponsored items are labelled in the home query. Browser campaign creation was not walked through. |
| 06 Marketplace | TESTING | Listings, favourites, unpaid orders and seller moderation are in the commerce service and tests. Checkout cannot be marked paid from the browser. |
| 07 Learn | TESTING | Enrolment, lesson text, a quiz form that submits answers to the server, and a non-accredited completion number (`RT-…`) are in place. The service test still grades a quiz. |
| 08 Jobs | TESTING | Publish and apply passed in tests. The public jobs page is an honest empty state. |
| 09 Events | TESTING | Create, publish and registration passed in tests. Ticket stock is reserved atomically and a second sale past capacity is refused. Codes are issued after the signed webhook. A second scan is refused. The public page does not mark an order paid. |
| 10 Business | IMPLEMENTED | Profiles stay pending until verification. Hours, reviews and enquiries have tables and service functions. |
| 11 Property | TESTING | Create, publish and a viewing request passed in the service test. Accommodation requests use the same published-listing check. No live booking payment exists. |
| 12 Food | TESTING | A published place can store menu items with rand prices. Covered by the service test. |
| 13 Sports | TESTING | Published clubs, fixtures, results and standings are wired. The service test records a 2–1 result and a win. |
| 14 Youth | IMPLEMENTED | Opportunity records exist. Accounts under 13 are rejected. Ages 13–17 need guardian consent and cannot use direct messages. |
| 15 Community support | TESTING | A pledge stays uncounted until an administrator confirms it. The test checks that total. |
| 16 Transport | IMPLEMENTED | Traffic and transport records can be submitted. Nothing is placed on the public map until it is verified and not sensitive. |
| 17 Tourism | IMPLEMENTED | Listings can be submitted and, once published with a location, can become map points. |
| 18 Health | IMPLEMENTED | Directory records require editorial review. The pages are a directory, not medical advice. |
| 19 Public voice | TESTING | Petitions can take signatures. The site states it is not an official municipal channel. |
| 20 Radio and music | IMPLEMENTED | Schedule and an offline stream note are seeded. Song requests and music uploads require a rights confirmation. |
| 21 Deals | IMPLEMENTED | Offers have an end date and can be saved. None are published. |
| 22 Competitions | IMPLEMENTED | Entries are accepted only inside the published window. Winner announcement is an admin action. |
| 23 History | IMPLEMENTED | Heritage records can be submitted for review. |
| 24 Local services | IMPLEMENTED | Provider profiles and quote requests exist. Minors cannot request a quote. |
| 25 Agriculture | IMPLEMENTED | Produce and related listings use the shared record workflow. |
| 26 Faith | IMPLEMENTED | Organisation records can be submitted. |
| 27 Family | IMPLEMENTED | Family resources and childcare listings use the shared record workflow. |
| 28 Technology | IMPLEMENTED | Organisation records can be submitted. |
| 29 Public notices | IMPLEMENTED | Funeral notices without consent are rejected. A 13-digit identity number in a community post is rejected. |
| 30 Creators | TESTING | A creator post stays pending until a moderator publishes it. Sponsored posts require a sponsor label. Revenue sharing is not a payout. |

## SafeTrack

| Area | Status | Evidence and limit |
| --- | --- | --- |
| Family safety on the website | TESTING | Households, grants, dependants, SOS, missing-person records and emergency-access denial are in `src/server/safetrack.ts` and the 17 November service test. The staff desk does not query coordinates. Native apps, SMS, push, SAPS and a retention job are not built. See SAFETRACK_IMPLEMENTATION_STATUS.md. |

## Still open

- Point `SMTP_HOST` at a real mailbox. The sender is written; this machine has no mail server configured.
- Apply `supabase/migrations/0001_init.sql` to Postgres and add policies for a real auth user id. The app still runs on SQLite.
- Click through the quiz form in a browser. The form posts to the server, and the service test grades answers.
- Register web push after a VAPID key exists.
- Measure accessibility and Core Web Vitals on a deployed URL.
- Have a person review Setswana and Afrikaans copy before calling it editorial.
