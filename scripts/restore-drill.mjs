/**
 * Disposable restore drill: copy a production backup into a temp DATA_DIR and prove it opens.
 * Never writes over the live production database.
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { DatabaseSync } from "node:sqlite";

const src = process.argv[2];
if (!src || !fs.existsSync(src)) {
  console.error("Usage: node scripts/restore-drill.mjs <path-to-backup.db>");
  process.exit(1);
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rt-restore-"));
const dest = path.join(dir, "rustenburg.db");
fs.copyFileSync(src, dest);
const db = new DatabaseSync(dest, { readOnly: true });
const users = db.prepare("SELECT COUNT(*) as c FROM users WHERE status != 'deleted'").get().c;
const desks = db.prepare("SELECT COUNT(DISTINCT section_slug) as c FROM department_assignments").get().c;
const articles = db.prepare("SELECT COUNT(*) as c FROM articles WHERE deleted_at IS NULL").get().c;
console.log(JSON.stringify({
  ok: true,
  restoreCopy: dest,
  users,
  desks,
  articles,
  note: "Disposable copy only — live /data/rustenburg.db was not modified",
}, null, 2));
