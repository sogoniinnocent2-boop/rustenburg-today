# Google and Facebook sign-in setup

Rustenburg Today uses server-side OAuth. Buttons stay visible but unavailable until credentials exist. Never put client secrets in frontend code or Git.

## Shared application settings

Set these in the hosting environment (and locally in `.env`):

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SITE_URL` | Public site origin, e.g. `https://rustenburg.today` |
| `SESSION_SECRET` | Long random string for signed cookies |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth client |
| `FACEBOOK_APP_ID` / `FACEBOOK_APP_SECRET` | Meta Facebook Login app |

Callback URLs are derived from `NEXT_PUBLIC_SITE_URL`:

- Google: `{SITE}/api/auth/google/callback`
- Facebook: `{SITE}/api/auth/facebook/callback`

Local development defaults to `http://localhost:3000`.

## Google Cloud Console

1. Create an OAuth client (Web application) in Google Cloud Console.
2. Add authorised JavaScript origins: the production origin and `http://localhost:3000` for local work.
3. Add authorised redirect URIs for both environments using the Google callback path above.
4. Enable the OpenID Connect scopes used by the app: `openid`, `email`, `profile`.
5. Copy the client id and secret into the environment variables. Do not commit them.
6. Publish the OAuth consent screen when moving beyond test users. Google may require verification for production use of sensitive scopes.

## Meta Developer Console (Facebook Login)

1. Create a Meta app and add the Facebook Login product.
2. Set Valid OAuth Redirect URIs to the Facebook callback paths for production and local.
3. Request `email` and `public_profile`. Facebook may omit email; the app then asks the person to enter an email during account finish.
4. Copy App ID and App Secret into the environment variables.
5. Complete Meta app review / business verification before public production login if Meta requires it for your use case.
6. Publish a privacy policy and terms URL that Meta can reach.

## Account behaviour

- New Google or Facebook sign-in creates one Rustenburg Today account, then sends the person to finish date of birth and terms (`/auth/google-profile`).
- Existing provider subject logs the person back into the same account.
- Matching email alone never merges accounts. The person must sign in with a password and link the provider from **Account → Security**.
- Linking requires password confirmation, then the real provider consent screen.
- Unlinking is blocked when it would remove the only remaining sign-in method and no password exists.

## Honest status without credentials

Without Google or Facebook credentials, Continue with Google / Continue with Facebook show an unavailable message. Automated tests cover that closed state. Live end-to-end provider login remains **BLOCKED** until real credentials and provider approval exist.
