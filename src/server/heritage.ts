import type { SessionUser } from "./auth";
import { assertActive } from "./auth";
import { all, newId, run } from "./db";
import { AppError } from "./errors";
import { ensureReady } from "./init";

const KINDS = ["memory", "photograph", "correction", "oral", "culture"] as const;

export function submitHistoryNote(user: SessionUser, input: { kind: string; body: string; source: string; consent: boolean }): string {
  ensureReady();
  assertActive(user);
  if (!input.consent) throw new AppError(400, "Consent is required before a history note can be held for review");
  if (!(KINDS as readonly string[]).includes(input.kind)) throw new AppError(400, "Choose what you are sending");
  if (input.body.trim().length < 20) throw new AppError(400, "Write the memory or correction");
  if (input.source.trim().length < 8) throw new AppError(400, "Say where this comes from and who owns it");
  const id = newId();
  run(
    "INSERT INTO history_notes (id, user_id, kind, body, source_note, consent, status, created_at) VALUES (?, ?, ?, ?, ?, 1, 'pending', ?)",
    id,
    user.id,
    input.kind,
    input.body.trim().slice(0, 4000),
    input.source.trim().slice(0, 500),
    new Date().toISOString(),
  );
  return id;
}

export function pendingHistoryNotes(): Array<Record<string, unknown>> {
  ensureReady();
  return all("SELECT id, kind, body, source_note, created_at FROM history_notes WHERE status = 'pending' ORDER BY created_at DESC LIMIT 30");
}
