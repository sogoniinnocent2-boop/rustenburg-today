# SafeTrack security

- Sessions stay on the existing httpOnly cookie. Privileged reviewers use the same sign-in. Separate multi-factor for staff is not built.
- Authorisation is checked in `src/server/safetrack.ts` from the session user id. A household id in a form is not trusted: membership is loaded from the database.
- Legal names, dependant dates of birth, coordinates, SOS notes, clothing descriptions, police case references and concern text are sealed with AES-256-GCM.
- Audit rows are inserted. Application code does not update or delete `st_audit`.
- SOS uses an idempotency key and a rate limit.
- Location responses include the captured time and say when a report is older than two minutes.
- The city Leaflet map is unchanged and is not given family coordinates.
- Pages under `/safetrack` send `noindex`.
- Threats still open: no managed key service, no Postgres row security, no device binding, no push or SMS authenticity, no independent penetration test, and the global administrator shortcut still opens non-location staff queues.

Do not log sealed values. The disclosure receipt stores the capture time and freshness, not the coordinates.

## Threat model

| Threat | What the code does |
| --- | --- |
| Family member tracks an adult after a household invite | Join writes membership only. Location read without a grant returns 403 and an audit row |
| Person grants themselves guardian rights | Guardian rows are claims. Approval requires another account with `safetrack.verify` |
| Emergency contact treated as a parent | Contacts and guardians are different tables. Tests check a contact creates no guardian row |
| Staff browse live locations | Desk queries omit `st_points`. `listAllPoints` always throws. Administrator does not bypass `latestPoint` |
| Forged police email | Request is denied unless `st_agencies.status` is verified. Nothing is seeded |
| Life-threatening access by one insider | Second, different reviewer required before disclosure. Requester cannot approve themselves |
| Disclosure kept forever | `expires_at` is 24 hours. A later read of the API still needs a personal grant |
| Stale GPS shown as live | `fresh` is false after two minutes and the note says it is an older report |
| SOS claims a dispatch | Response sets `delivered` false and `emergencyServicesContacted` false. Status stored as queued |
| Offline success message | The website action only redirects after the server insert. A failed request shows the error. There is no offline queue that pretends success |
| Duplicate SOS | Same idempotency key returns the original incident |
| Missed check-in becomes a missing-person case | Status becomes `checkin_due` with result `asked_subject` |
| Public map leaks a family point | City map code is not passed SafeTrack coordinates |
| Child monitored in secret | `location_shared` is shown on the household page |

Remaining exposure: SQLite file access on the server is full database access, field encryption depends on the application key, and push or SMS spoofing does not arise yet because those channels are not connected.
