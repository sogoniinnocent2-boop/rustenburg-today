# Security

This is the control set that is actually in the code. It is not a penetration test.

## In place

- Passwords are scrypt hashes. The login path compares against a dummy hash when the account is missing.
- Sessions are random tokens stored as SHA-256, carried in an httpOnly, SameSite cookie signed with HMAC. The secret comes from `SESSION_SECRET` or, in local development only, `data/dev-secret.txt`. Production throws if the secret is missing.
- Email verification is required before a protected action. Reset tokens expire sooner than verification tokens.
- Registration rejects a date of birth under 13. Ages 13–17 are stored as minors only with guardian consent, and messaging involving a minor is refused.
- Community text that contains a 13-digit number is rejected so a South African identity number is not published.
- Funeral notices require an explicit consent field.
- Permissions live in `src/server/access.ts`. The administrator role is the only short-circuit. Residents cannot open the admin desk; the page says so.
- API POST checks the `Origin` header against the site URL. The payment webhook is the exception and requires `PAYMENT_WEBHOOK_SECRET`.
- Orders and campaigns are not marked paid from a browser call. A webhook must match the signature, the amount and a new provider event id.
- Uploads check magic bytes, size and a path that stays under `data/uploads`.
- Map points need verification, approval and `sensitive = 0`.
- Security headers, including a content security policy, are set in `next.config.ts`. Frames are limited to the video hosts in use. Inline scripts are still allowed because the Next.js runtime needs them.
- Audit rows are written for moderation, payment verification and account changes.
- Account deletion anonymises the profile and retires the email rather than leaving the address in place.

## Not in place

- No SMTP means verification links appear in the development redirect. Do not run that behaviour on a public host.
- No malware scanner.
- No Postgres row-level security, because the running database is SQLite.
- No staff penetration test, dependency exception process, backup restore drill or incident rota.
- `npm audit` reported vulnerabilities at install time. They were not triaged in this pass.
- The content security policy still allows `unsafe-inline` and `unsafe-eval`.

## Local administrator

The first boot writes `data/bootstrap-admin.txt`. Treat it as a secret, change the password from Account → Security, and do not commit the file.

## Reporting

Use the in-app report dialog for content. Security defects in this codebase should be fixed before the site is exposed on the public internet.
