# SafeTrack system architecture

SafeTrack runs inside the existing Next.js application. It uses the same cookie session and the same SQLite database file. It does not add a second database, a new sign-in provider, or a microservice.

```
Browser form or authenticated /api/v1/safetrack
  -> server action or route
  -> src/server/safetrack.ts
  -> SQLite tables prefixed st_
  -> append-only st_audit
```

Sensitive strings are encrypted in the application with AES-256-GCM before they are stored. The key is `SAFETRACK_DATA_KEY` when that variable is at least long enough to be present, otherwise a key derived from the development session secret. That is not a managed key service.

Location rows are not returned by public search, the city map, or the staff desk. A read of one person's latest point requires an active grant, or the separate disclosure function after two-party approval where the legal basis says the emergency is life-threatening. The administrator role does not bypass that location check.

The mobile applications described in the product blueprint are not built. A phone must not connect to SQLite. When they exist, they should call the authenticated API.
