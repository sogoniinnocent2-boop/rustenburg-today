# SafeTrack admin guide

Open `/safetrack/desk` with an account that has verification, incident, or emergency-review permission. An administrator can open it because the site still treats that role as allowed for staff permissions. The desk does not show coordinates.

Guardian claims show the child's preferred name, the claimed relationship and the status. Write what was reviewed. Approve or reject. If the status is disputed, the server refuses approval.

Incidents show a reference, a type and a status. Do not tell a family that SAPS has been notified by the platform.

Emergency access shows the organisation, scope, legal basis and status. Deny a request you cannot verify. A life-threatening basis needs a second, different reviewer before disclosure. Disclosure lasts 24 hours. There is no search box for people or households.

Concern text is hidden unless the signed-in account has the role `privacy_officer`.

Do not insert a row into `st_agencies` until the organisation, the contact channel and the legal process are real. No agency is loaded with the software.
