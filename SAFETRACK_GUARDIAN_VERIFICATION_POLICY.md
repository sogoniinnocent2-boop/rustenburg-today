# SafeTrack guardian verification policy

A dependant is not an account. The adult who registers the profile records a preferred name, a sealed legal name, a sealed date of birth, and one of: parent, legal guardian, court-authorised caregiver, or foster caregiver.

That choice creates a claim with `verification_status = submitted`. It does not create a location grant.

A verification officer, or an administrator because of the existing site shortcut, records a note of at least eight characters and approves or rejects. The officer cannot review their own claim. The product does not upload identity documents in this version. A launch process must define which documents are accepted, who may see them, and when they are deleted. Until that exists, approval in the software is a status change, not proof that a court order was checked by a trained team.

If another adult in the household disputes the claim, authority becomes `disputed`, child location sharing turns off, and active child grants freeze. The review action refuses to approve a disputed claim. Clearing a dispute needs a later, documented process. It is not on this screen.

An emergency contact is stored in `st_contacts` and is never written into `st_guardians`.
