# SafeTrack permission matrix

A role name is not enough for location. `hasPermission` still treats `administrator` as allowed for ordinary site permissions, including SafeTrack staff queues. Location reads in `latestPoint` ignore that shortcut and require a grant.

| Action | Who can do it |
| --- | --- |
| Create a household, invite an adult | An active adult member, 18 or over |
| Join a household | The invited adult email. No location grant is created |
| Register a dependant | An adult member. Creates a pending guardian claim |
| Approve or reject a guardian claim | `safetrack.verify`, and not the claimant. A disputed claim cannot be approved from this screen |
| Grant profile, location, SOS, journey or emergency-info access | The adult subject, to someone else |
| Withdraw that grant | The adult subject |
| See a latest location | The subject, or a grantee with an active location permission |
| See every location | Nobody. `listAllPoints` always refuses |
| Receive an SOS | A contact who also has an active `receive_sos` grant |
| Manage child location | A verified guardian. A dispute turns sharing off and freezes those grants |
| Open a missing record for a child | A verified guardian |
| Mark a platform incident person located | The person who opened it. This is not a SAPS closure |
| Request official access | Any signed-in adult. Unknown organisations are denied and stored |
| Approve access | `safetrack.review`, not the requester. Life-threatening bases need two different approvals |
| Disclose | `safetrack.review` after approval. Expires in 24 hours. Scope is one named set of records |
| Read a confidential concern | The `privacy_officer` role on the account. Other staff, including an administrator, see only that the queue is restricted |
| Browse the desk | `safetrack.verify`, `safetrack.incidents` or `safetrack.review` |

Staff roles are not self-serve. They are added to `ROLES` with `selfServe: false`.
