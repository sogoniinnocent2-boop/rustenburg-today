# SafeTrack testing

Command: `npx tsx --test tests/platform.test.ts`

On 17 November 2026 the file reported 11 passed, 0 failed. `npx tsc --noEmit` passed. The SafeTrack test covers:

- An invitation does not create a location grant.
- A household member and an administrator cannot read a location without a grant.
- There is no all-locations directory.
- A denied read writes an audit row.
- Revocation stops a later read.
- A point older than two minutes is labelled as an older report.
- An emergency contact without `receive_sos` produces an incident with zero queued notifications.
- With that permission, one notification is queued and a repeated idempotency key returns the same incident. Delivery status stays `queued`.
- An emergency contact is not inserted as a guardian.
- An unverified guardian cannot enable child location or open a child missing record.
- Approval allows child location, and a dispute turns it off and blocks a fresh approval.
- Missing-person guidance contains the SAPS sentence. Person located is a platform status.
- An unknown organisation is denied.
- A life-threatening request stays at first approval until a second reviewer, then disclosure returns a stale point and a 24-hour scope.
- A journey contact without journey-alert permission is refused.
- An overdue journey becomes `checkin_due` and records `asked_subject`. It does not become a missing-person incident.

Not tested: a physical Android or iPhone, background location, battery use, SMS, push delivery, backup restore, load, screen-reader pass, or a real SAPS request. Those remain NOT STARTED or BLOCKED. The service test is not a VERIFIED launch.
