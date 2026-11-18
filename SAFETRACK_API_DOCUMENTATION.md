# SafeTrack API

All SafeTrack routes require the `rt_session` cookie. There is no public location URL.

| Method and path | Behaviour |
| --- | --- |
| GET /api/v1/safetrack/me | Households, permission labels and contact names. No coordinates. |
| GET /api/v1/safetrack/location/{userId} | Latest point for that person when the caller has `view_live_location` or `view_last_known`. Returns captured time, accuracy and whether the report is under two minutes old. |
| POST /api/v1/safetrack/sos | Body `idempotencyKey` and optional `note`. Creates the incident and returns `delivered: false` and `emergencyServicesContacted: false`. |
| POST /api/v1/safetrack/location/session | Starts a sharing session for the signed-in person. |
| POST /api/v1/safetrack/location/point | Body `sessionId`, `latitude`, `longitude`, `accuracyM`, `capturedAt`. Stores a report from that person's own session. |

Household, guardian, journey and emergency-access changes are server actions on `/safetrack` and `/safetrack/desk`. They use the same service checks as the API. A cross-origin POST is rejected.

Repeating an SOS idempotency key returns the original incident. Five new SOS incidents are allowed per account in ten minutes.
