# SafeTrack incident response plan

This is the engineering plan for a problem with SafeTrack itself, such as a bad access grant, a leaked key, or a false official request. It is not a plan for rescuing a person. Families still call 10111 or 112.

1. Preserve `st_audit`, the incident row and the access-request rows. Do not edit them. Add a new audit note in the operational log if a correction is required.
2. Revoke the affected grants. Revocation is immediate for later location reads.
3. If a disclosure was made in error, leave the disclosure row and its expiry in place and record the mistake. Do not delete it.
4. If `SAFETRACK_DATA_KEY` or the development secret may be exposed, rotate the key, stop the site, and accept that older sealed rows will not open until a planned re-encryption exists. Re-encryption is not built.
5. Suspend a staff account through the existing account status control if that account is the source of the problem.
6. Tell affected adults what was accessed, when, and what was not. Do not include coordinates in email until an approved channel exists.
7. A suspected impersonation of police stays in `st_access_requests` with status denied. Escalate it to the privacy contact. There is no automatic report to SAPS.

No on-call rota is staffed. Do not publish a 24/7 monitoring promise.
