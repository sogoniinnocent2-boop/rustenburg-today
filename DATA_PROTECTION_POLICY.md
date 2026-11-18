# Data protection

This note describes how this application treats personal information. It is an engineering policy for the POPIA-conscious design in the product brief. It is not a filed legal opinion, and the public privacy page is the notice visitors see.

## What is collected

- Account: email, password hash, optional phone, date of birth, display name, username, language, theme, and the roles you add.
- Content you submit: posts, applications, listings, messages, reports and uploaded files.
- Consent rows for the terms and, where relevant, guardian consent.
- Technical rows: session hashes, rate-limit counters, audit logs and first-party page events.

The app is built to refuse a 13-digit identity number in community text. Do not add ID number fields.

## Why

The data runs the account, shows what you chose to publish, delivers notifications you enabled, and lets the desk moderate harm. Advertising measurements store impressions and clicks on a campaign, not a dossier for sale.

## Sharing

There is no third-party analytics tag. Email, payments, video and map tiles are the external processors when those integrations are turned on. Today, map tiles are requested from OpenStreetMap as the map loads. Email is not sent. Payments are not processed by a provider. Video plays from the host you embed.

## Retention and deletion

Account deletion anonymises the profile, retires the email and ends the session. Audit and payment records can remain where a legal or accounting duty requires a record of the action. Backups on disk should be deleted on the same cycle once a backup rotation exists. A rotation is not automated yet.

## Your actions

Signed-in people can export a JSON file of their account from the privacy tab and can correct their profile. Password reset and email verification use time-limited tokens.

## Children

Under 13: no account. 13–17: guardian consent is stored and direct messages are blocked. Youth content is moderated with the same report tools, and safety reports are not auto-published.

## Security of the store

Secrets stay in the environment or in gitignored files under `data/`. The database file is gitignored. Production still needs encryption at the host, access control on the server, and Postgres row-level security before it should hold a city’s real personal information.
