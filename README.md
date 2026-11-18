# Rustenburg Today

Your city. Your stories. Your opportunities.

Rustenburg Today is a modular Next.js application for news, community, media, jobs, learning, events, local trade and public information in Rustenburg, North West. One account is used across every department.

## Run it locally

```bash
npm install
npm run dev
```

Open http://localhost:3000. The site redirects to `/en`, `/tn` or `/af`.

The first non-test start creates `data/rustenburg.db` and writes a one-time administrator password to `data/bootstrap-admin.txt`. Change that password after signing in. The file is gitignored.

Copy `.env.example` to `.env.local` before connecting email, payments or a public URL. Do not commit secrets.

## Scripts

- `npm run dev` — development server
- `npm run build` / `npm start` — production build
- `npm run typecheck` — TypeScript
- `npm test` — service tests (`tests/platform.test.ts`)
- `npm run backup` — documented in DEPLOYMENT.md; the admin desk can also copy the database

## What is running

The application stores data in SQLite (`node:sqlite`) so it runs without a cloud project. PostgreSQL and Supabase row-level security are specified in DATABASE_SCHEMA.md and are not connected. Authorisation is enforced in server services and again on every mutating API route.

The only seeded public content is a labelled demonstration article and a one-second tone for the demonstration podcast. Jobs, clinics, traffic, missing people and prices are empty until a person publishes them.

Read IMPLEMENTATION_STATUS.md before treating a department as finished. A feature is complete only when its real workflow is verified.
