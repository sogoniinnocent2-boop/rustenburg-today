# Admin guide

Sign in with an administrator, editor or moderator account, then open `/en/admin` (or `/tn` or `/af`).

The first local administrator is created at startup. The password is written once to `data/bootstrap-admin.txt`. Change it under Account → Security and keep the file off any shared machine.

A resident who opens the desk sees a refusal. They are not shown the queues.

## Dashboard

The overview counts users, published articles, articles still in review, community posts, open reports, listings, jobs and events from the database.

## Queues

Use the tabs for editorial, community, business, marketplace, jobs, events, learning, advertising, reports and people.

- News moves through draft, review, changes requested, approved, scheduled and published. Publishing indexes the article and can notify breaking-news or municipal subscribers.
- Businesses, products, jobs, events, videos and directory records stay pending until someone with permission publishes or verifies them.
- Advertising goes live only when the campaign is approved, the dates include today, and payment is verified or explicitly waived. Waiving payment is an audited admin action, not a visitor button.
- A donation pledge stays a pledge until you confirm it. Confirmed totals ignore open pledges.
- Reports can remove a post, comment, listing or profile. The action is stored in `moderation_actions` and `audit_logs`.
- Role requests for journalist, editor and moderator are approved or declined here. Do not grant administrator from a casual request.

## Department desks

Open **Admin → Departments** to create staff accounts or assign an existing email to a section (`news`, `jobs`, `health`, `tourism`, and the other city pages).

One person can hold several departments. Create the account once, then use **Assign another department** with the same email for each extra section. Revoke removes only that section.

Each assigned person signs in with their own account and opens `/en/desk`. What they publish there goes live on that section’s public page. They cannot publish to a department they are not assigned to. The desk story report and CSV download show views and reactions for that department’s stories.

SAnews RSS keeps feeding News as headline links. Desk-published articles appear on the same News page as your own reporting.

One-time passwords for newly created staff are written under `data/department-*.txt`. Change those passwords after the first sign-in.

## Backup

“Create backup” copies the SQLite file into `data/backups`. Stop the server before you restore a copy over `data/rustenburg.db`.

## What this desk cannot do yet

It cannot send email, take a live card payment, or edit Postgres policies. Those integrations are not connected.
