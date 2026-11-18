# System architecture

Rustenburg Today is one Next.js 15 application. It is not 30 separate apps.

```
Browser
  -> Next.js App Router (src/app) and middleware (locale)
  -> Server actions (src/server/actions.ts) and /api/v1
  -> Domain services (editorial, community, media, commerce, payments, city, engage, auth)
  -> SQLite file data/rustenburg.db
  -> data/uploads for checked files
```

React components render and submit forms. They do not decide who may publish, pay or moderate. Those checks live in the services and are repeated by the API.

## Replaceable edges

| Concern | Current adapter | Replacement |
| --- | --- | --- |
| Database | `node:sqlite` via `src/server/db.ts` | Supabase Postgres. SQL shape is in `src/server/schema.sql`. RLS is not generated or applied. |
| Passwords and sessions | scrypt hashes and an HMAC httpOnly cookie `rt_session` | Supabase Auth, if the session layer is swapped without weakening server checks. |
| Email | Rows in `email_outbox`. Nothing is sent until SMTP is connected. | A transactional provider behind `src/server/mail.ts`. |
| Video | Provider id allowlist: YouTube, Vimeo, Mux | Keep a hosted provider. Do not serve video from the Next.js process. |
| Maps | Leaflet and OpenStreetMap tiles | Another tile host, with the same verification rules. |
| Payments | HMAC webhook in `src/server/payments.ts` | A South African provider. Browser responses never mark an order paid. |
| Ask | Retrieval over `search_documents` | A model may summarise only those hits. It must not invent jobs, prices or announcements. |

## Request rules

- Public pages are server-rendered and dynamic because they read the database.
- `/api/v1` checks the signed session, permission and, on POST, the site origin, except the payment webhook which is authenticated by HMAC.
- Money is integer cents. `randsToCents` parses a decimal string.
- Background work in `src/server/worker.ts` publishes scheduled articles and expires listings, deals, notices and map points.
- Journal mode is DELETE so the database file behaves on OneDrive. A WAL file is not used.

## Identity

Registration creates one user and one profile. Default roles are resident, reader, contributor, buyer, job seeker and student. Extra commercial roles are self-serve. Editorial and moderation roles are requested and approved. The administrator role is seeded once and short-circuits permission checks. Other roles cannot.
