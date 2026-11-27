import { DatabaseSync } from "node:sqlite";
const db = new DatabaseSync("data/rustenburg.db", { readOnly: true });
const rows = db
  .prepare(
    `SELECT a.id, a.status, a.deleted_at, t.title
     FROM articles a
     JOIN article_translations t ON t.article_id = a.id
     WHERE t.title LIKE '%Desk access%' OR t.title LIKE '%access test%'`
  )
  .all();
console.log(JSON.stringify(rows, null, 2));
