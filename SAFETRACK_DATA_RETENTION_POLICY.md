# SafeTrack data retention

| Record | Current behaviour |
| --- | --- |
| Account profile | Follows the existing account delete path. SafeTrack rows are not yet included in that delete. |
| Location points | Kept until a retention job exists. Reads still show the age of the point. |
| SOS and missing incidents | Kept. Case references are sealed. |
| Emergency-access disclosure | `expires_at` is 24 hours after disclosure. The request row remains as evidence. |
| Guardian evidence files | Not collected. Do not add document uploads until a retention limit and access list exist. |
| Audit | Kept. Do not edit a row to hide a read. |
| Concerns | Kept sealed. Opened only by a privacy officer. |

Automatic deletion, legal holds and backup restore drills are not built. Encrypted backups of the SQLite file are an operational task, not a feature of this release.

Production should set a dedicated `SAFETRACK_DATA_KEY` and keep it apart from database backups.
