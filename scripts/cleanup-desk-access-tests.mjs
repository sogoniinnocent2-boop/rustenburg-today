process.env.DATA_DIR = process.env.DATA_DIR || new URL("../data", import.meta.url).pathname.replace(/^\//, "").replace(/\//g, "\\").includes(":")
  ? undefined
  : undefined;

import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.env.DATA_DIR = process.env.DATA_DIR || path.join(root, "data");
process.env.SEED_DEMO = "false";

const { ensureReady } = await import("../src/server/init.ts");
const { all, run } = await import("../src/server/db.ts");

ensureReady();
const rows = all(
  `SELECT a.id, t.title
   FROM articles a
   JOIN article_translations t ON t.article_id = a.id
   WHERE t.title LIKE 'Desk access test%' AND a.deleted_at IS NULL`,
);
const stamp = new Date().toISOString();
for (const row of rows) {
  run("UPDATE articles SET deleted_at = ?, status = 'archived', updated_at = ? WHERE id = ?", stamp, stamp, row.id);
}
console.log(JSON.stringify({ cleaned: rows.length, titles: rows.map((r) => r.title) }));
