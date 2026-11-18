# Content moderation policy

Rustenburg Today is an independent publisher and host. It is not the Rustenburg municipality and it is not a police reporting line. Emergencies belong with the relevant emergency service.

## People

Editors and moderators review queues in the admin desk. Their decisions are stored with a reason. Administrators can suspend an account. Residents can report a post, comment, listing, profile or message.

## What is refused or removed

- Content that sexualises a child, or any private message involving a minor.
- Published identity numbers, private residential locations, and unverified allegations on the public map.
- Funeral notices and missing-person notices posted without the required consent.
- Impersonation, scams, and advertisements that pretend to be unpaid editorial.
- Health claims presented as personal medical advice. Health profiles are a directory and stay in review until an editor approves them.
- Hate or harassment aimed at a faith, language or neighbourhood community. Faith listings must be able to sit beside each other without the platform ranking one as official.
- Music or video uploaded without a rights confirmation, and any attempt to host a video file on this server.
- Sponsored articles, listings or posts that are not labelled as sponsored.

Safety reports from the community form stay pending. They are not published as fact.

## How a decision is made

1. A report or a new sensitive item lands in a queue.
2. A moderator reads the record and the reason.
3. The item can stay, be returned for changes, or be removed. Removal sets the status and `deleted_at`.
4. The action is written to `moderation_actions` and `audit_logs`.
5. Account suspension is reserved for repeat or serious harm, and it is also audited.

Appeals can be sent to the desk by the account holder. There is no separate appeals product yet. A human reads the original action.

## Editorial standards

News uses draft, review and publication. Corrections are kept. A translation is public only after review. The demonstration article is labelled and is not a news report.

Marketplace and job listings can be reported as scams. A listing can expire. Payment status still comes only from a verified webhook.
