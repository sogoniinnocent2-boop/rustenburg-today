# Integrations

Each external system sits behind a small module so it can be replaced. None of the paid or hosted providers below are connected to a live account.

| Integration | Module | Current behaviour |
| --- | --- | --- |
| Email | `src/server/mail.ts` | Queues `email_outbox`. When `SMTP_HOST` is empty, nothing is sent. When it is set, the worker opens SMTP, upgrades port 587 with STARTTLS, and marks the row sent or failed. |
| Database | `src/server/db.ts` and `supabase/migrations/0001_init.sql` | The app runs on SQLite. The SQL file enables Postgres row-level security with no policies. It is not applied to a database. |
| Payments | `src/server/payments.ts` | Verifies `x-payment-signature` with `PAYMENT_WEBHOOK_SECRET`. Accepts `order`, `course` and `campaign` when the amount matches. No Payfast, Yoco, Peach or other provider SDK is installed. |
| Video | `src/lib/text.ts` `videoEmbed` | YouTube nocookie, Vimeo and Mux ids become iframes. Other hosts are rejected. |
| Maps | `src/components/map-view.tsx` | Leaflet loads `tile.openstreetmap.org`. The content security policy allows that host. |
| Search | `search_documents` | SQL prefilter plus a small edit-distance check. No external search cluster. |
| Ask | `askCity` | Returns search hits and `grounded: true`. No model API is called. |
| Web push | `push_subscriptions` table and `public/sw.js` | The worker file is not registered and no VAPID message is sent. |
| Analytics | `analytics_events` | First-party counts for views and ad impressions. No third-party tracker is installed. |
| Uploads | `src/server/uploads.ts` | Local disk. Supabase Storage is not configured. |

## Environment names

See `.env.example` for `DATA_DIR`, `SESSION_SECRET`, `SEED_DEMO`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `SMTP_HOST`, `SMTP_FROM`, `PAYMENT_PROVIDER`, `PAYMENT_WEBHOOK_SECRET`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `NEXT_PUBLIC_SITE_URL`.

Leave payment and VAPID values empty until the provider account exists. Do not put service-role keys in client code. This app has no service-role key in the frontend.
