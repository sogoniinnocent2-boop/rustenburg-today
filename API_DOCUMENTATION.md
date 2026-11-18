# API

Base path: `/api/v1`.

Responses are JSON `{ ok: true, data }` or `{ ok: false, error }` with an HTTP status. Lists accept `page` and `pageSize` where the handler paginates.

Cookie `rt_session` authenticates the caller. POST requests must come from the same site origin, except `POST /api/v1/payments/webhook`.

Hiding a button is not a control. Handlers call `requirePermission` or an equivalent service check.

## Groups

| Path | Purpose |
| --- | --- |
| `GET /api/v1/health` | Process up, without secrets. |
| `GET /api/v1/me` | Current profile or null. |
| `GET /api/v1/search?q=` | Cross-department search. |
| `GET /api/v1/ask?q=` | Same records, with `grounded: true`. |
| `GET /api/v1/articles` and `GET /api/v1/articles/:slug` | Published news. |
| `GET /api/v1/community` | Visible posts. |
| `GET /api/v1/podcasts` `GET /api/v1/videos` | Published media. Video payloads include an embed URL only after moderation. |
| `GET /api/v1/businesses` `GET /api/v1/products` `GET /api/v1/jobs` `GET /api/v1/events` | Public directories. |
| `GET /api/v1/map` | Verified, approved, non-sensitive, unexpired points. |
| `GET /api/v1/media/:id` | A stored upload after type and path checks. |
| `POST /api/v1/reports` | Signed-in content report. |
| `POST /api/v1/orders` | Creates an order with `paymentStatus: unpaid`. |
| `POST /api/v1/orders/:id/pay` | Always 403. Payment is not confirmed in the browser. |
| `POST /api/v1/payments/webhook` | HMAC-SHA256 hex in `x-payment-signature`. Body must match the order or campaign amount. Duplicate `providerEventId` values do not create a second payment. |
| `POST /api/v1/admin/:resource/:id` | Editor, moderator or administrator action. |

Forms on the website use server actions in `src/server/actions.ts` rather than these routes. Both paths call the same services.

Rate limits are stored in `rate_limits` for sign-in, registration and a few write actions. They are not a substitute for a production edge limiter.
