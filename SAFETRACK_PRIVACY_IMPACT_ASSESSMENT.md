# SafeTrack privacy impact notes

This is an engineering risk note, not a POPIA assessment and not legal advice. A qualified review is still required before a public launch.

| Processing | Risk | Current control |
| --- | --- | --- |
| Adult location | Secret tracking by a family member | The subject creates the grant and can revoke it. Household membership grants nothing |
| Child profile | An adult claims authority they do not have | Claim stays pending. Legal name and date of birth are sealed. No child login |
| Child location | Monitoring hidden from the child | Sharing is off until a verified guardian turns it on, and the household screen says it is on |
| Dispute | One adult locks another out, or overrides a court order | New child grants freeze. This screen cannot clear a dispute |
| SOS text | Precise coordinates in a notification | The queue stores a recipient and a status. The product copy tells the contact to open SafeTrack. No SMS provider is connected |
| Staff access | An administrator browses live positions | The desk query does not select location rows. A location read without a grant is denied and audited |
| Official request | Someone claims to be a police officer | The organisation must already be verified. No agency is seeded, so a real SAPS request is denied until an agreement exists |
| Retention | Location kept forever | Points are not auto-deleted yet. A retention job is not built |
| Keys | Sealed fields exposed by a stolen dev secret | Production must set `SAFETRACK_DATA_KEY` and `SESSION_SECRET`. There is no key rotation service |

Children under 13 cannot register an ordinary Rustenburg Today account. SafeTrack dependants are profiles, not accounts.
