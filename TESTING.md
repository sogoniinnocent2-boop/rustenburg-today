# Testing

## Automated

Command:

```bash
npx tsx --test tests/platform.test.ts
```

On 16 November 2026 this file passed 7 tests and failed 0. Each test uses a temporary database with `SEED_DEMO=false`.

| Test | Covers |
| --- | --- |
| registration, session and password reset | Adult registration, under-13 rejection, verify, login, reset. |
| editorial workflow and search | Resident cannot publish news. Editor workflow, translation, search typo, corrections. |
| community interaction and moderation | Two users, comments, reactions, follows, identity-number rejection, reports, moderation. |
| orders and campaigns | Unpaid orders, rejected browser payment, signed webhook, duplicate webhook, bad signature, campaign approval and payment gate. |
| jobs, courses, events and directories | Applications, quiz, certificate prefix `RT-`, events, property, petitions, pledges that stay at zero until confirmed. |
| assistant, uploads, rewards, media and blocks | Ask refuses an invented job, upload type check, reward uniqueness, video allowlist, podcast episode, talent entry, minor messaging block. |
| menus, fixtures, creators, rewards and mail | Menu price, a recorded 2–1 result, a moderated creator post, a reward redemption, a listing enquiry, and mail left queued when SMTP is unset. |

`npm test` runs the same file.

## Browser, development server, 16 November 2026

Walked through: English and Afrikaans home, registration, development verify link, sign-in, account roles, publishing a community post, empty jobs, Ask, signed-in briefing, map tiles, non-admin refusal, administrator counts.

Not walked through in the browser: a second user messaging the first, quiz submission, campaign creative upload, order enquiry, course certificate download, mobile viewport as a separate device, keyboard-only travel, or a screen reader.

## Not measured

Core Web Vitals, cross-browser matrix, load tests, restore from backup, and SMTP delivery.
