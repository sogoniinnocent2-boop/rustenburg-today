import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { before, test } from "node:test";
import { DESKS } from "../src/lib/desk-catalog";
import { loadUser, registerAccount, verifyEmail, type SessionUser } from "../src/server/auth";
import { fileDesk, listDesk, reviewDesk } from "../src/server/desks";
import { useTestDatabase } from "../src/server/init";
import { grantRole } from "../src/server/permissions";

function account(prefix: string): SessionUser {
  const email = `${prefix}-${Math.random().toString(16).slice(2)}@example.com`;
  const created = registerAccount({ email, password: "password123", displayName: prefix, dateOfBirth: "1990-01-01", acceptedTerms: true, guardianConsent: false, locale: "en", ip: email });
  verifyEmail(created.verifyToken);
  const user = loadUser(created.userId);
  if (!user) throw new Error("missing user");
  return user;
}

let writer: SessionUser;
let editor: SessionUser;

before(() => {
  useTestDatabase(fs.mkdtempSync(path.join(os.tmpdir(), "rt-desks-")));
  writer = account("writer");
  editor = account("editor");
  grantRole(editor.id, "administrator");
});

test("eighty desks are wired", () => {
  assert.equal(DESKS.length, 80);
  assert.equal(new Set(DESKS.map((desk) => desk.kind)).size, 80);
});

test("an open desk publishes and a priced desk stays a preview", () => {
  const open = fileDesk(writer, { kind: "school", title: "Term dates", body: "The school typed these dates." });
  assert.equal(open.status, "published");
  assert.equal(listDesk("school").length, 1);
  const priced = fileDesk(writer, { kind: "pin", title: "Week on the map", body: "A preview pin.", priceCents: 25000 });
  assert.equal(priced.status, "preview");
  assert.equal(listDesk("pin")[0]?.status, "preview");
});

test("a reviewed desk waits, a private desk stays with the author, and an ID number is refused", () => {
  const held = fileDesk(writer, { kind: "oral", title: "A memory", body: "Told in 1994, still waiting for an editor." });
  assert.equal(held.status, "pending");
  assert.equal(listDesk("oral").length, 0);
  reviewDesk(editor, held.id, "publish");
  assert.equal(listDesk("oral").length, 1);
  const note = fileDesk(writer, { kind: "attendance", title: "Monday", body: "Present: class list kept private." });
  assert.equal(note.status, "personal");
  assert.equal(listDesk("attendance", writer.id).length, 1);
  assert.equal(listDesk("attendance", editor.id).length, 0);
  assert.throws(() => fileDesk(writer, { kind: "checklist", title: "Identity number", body: "8001015009087" }), /identity numbers/);
});
