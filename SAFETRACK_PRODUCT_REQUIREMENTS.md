# SafeTrack product requirements

SafeTrack is a family safety service inside Rustenburg Today. The website helps an adult household record who may be told, start a journey check-in, send an SOS to people who already have permission, and keep a missing-person record that tells the family to call the South African Police Service immediately.

SafeTrack is not a covert tracker, a police dispatch desk, or a replacement for 10111 or 112.

## In this build

- Adult households, invitations and membership. Joining does not grant location access.
- Dependant profiles with no login. Guardian claims stay pending until a verification officer approves them. A dispute freezes child location sharing.
- Separate permissions for profile, location, SOS, journey alerts and emergency information. The subject grants them and can withdraw them.
- Emergency contacts are not guardians and do not receive location access.
- SOS creates an incident at once, queues notifications only for contacts who have `receive_sos`, and never marks them delivered. The screen says emergency services were not contacted.
- Missing-person records show: report to SAPS immediately and do not wait 24 hours. The family can mark the platform incident as person located. That does not close a SAPS case.
- Emergency-access requests from an organisation that is not on the verified list are denied. A life-threatening request needs two different reviewers. Disclosure lasts 24 hours.
- Staff desk lists claims, incident references and access requests. It does not list coordinates. Concern text opens only for the `privacy_officer` role.

## Not in this build

Native Android and iOS apps, background location, push, SMS, a maps provider for private positions, a SAPS connection, public missing-person notices, identity-document uploads, a key-management service, Postgres row-level security, and a staffed 24/7 control room.

Nothing is marked VERIFIED. South African legal review has not been obtained.
