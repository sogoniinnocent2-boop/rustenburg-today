# SafeTrack database schema

Migration `0005_safetrack` in `src/server/db.ts` adds these SQLite tables. Identifiers are UUIDs. Timestamps are UTC ISO strings.

| Table | Holds |
| --- | --- |
| st_households | Household name and creator. The id is not derived from a person's name. |
| st_members | Adult membership. Active membership is checked in the service. |
| st_invitations | Email invitation. Accepting it creates membership only. |
| st_dependants | Preferred name plus sealed legal name and date of birth. `location_shared` is 0 or 1 and is shown in the household. |
| st_guardians | Claimed relationship, pending until review. Disputed claims stay frozen. |
| st_consent | Purpose, policy version, grant and withdrawal time. |
| st_grants | One permission per row. Status active, revoked or frozen. |
| st_grant_history | Append-only grant changes. |
| st_contacts | Emergency contacts. No location column. |
| st_sessions | A sharing session started by the person. |
| st_points | Sealed latitude and longitude, accuracy, captured time and received time. |
| st_zones | Reserved for a named place. The website does not emit arrival events. |
| st_journeys, st_journey_contacts, st_checkins | Destination, expected arrival, contacts and check-in results. |
| st_incidents | SOS or missing record, reference, optional idempotency key. |
| st_notifications | queued, not delivered, until a provider exists. |
| st_missing | Station in the clear, clothing and case reference sealed. |
| st_agencies | Organisations allowed to request access. None are seeded. |
| st_access_requests, st_access_approvals, st_disclosures | Request, each review, and a time-limited disclosure receipt. |
| st_audit | Append-only. The application has no update or delete for this table. |
| st_concerns | Sealed confidential report. |

Postgres and row-level security are not used by the running site. The unused Supabase migration must not be applied as-is.
