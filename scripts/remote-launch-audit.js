/** Production launch audit — no secrets. */
const { DatabaseSync } = require("node:sqlite");
const fs = require("fs");
const db = new DatabaseSync("/data/rustenburg.db", { readOnly: true });

function count(sql, ...params) {
  return db.prepare(sql).get(...params).c;
}

const report = {
  stamp: new Date().toISOString(),
  users: count("SELECT COUNT(*) as c FROM users WHERE status != 'deleted'"),
  activeUsers: count("SELECT COUNT(*) as c FROM users WHERE status = 'active'"),
  demoArticlesPublished: count("SELECT COUNT(*) as c FROM articles WHERE is_demo = 1 AND status = 'published' AND deleted_at IS NULL"),
  realArticlesPublished: count("SELECT COUNT(*) as c FROM articles WHERE is_demo = 0 AND status = 'published' AND deleted_at IS NULL"),
  demoPodcasts: count("SELECT COUNT(*) as c FROM podcasts WHERE is_demo = 1 AND status = 'published' AND deleted_at IS NULL"),
  assignments: count("SELECT COUNT(*) as c FROM department_assignments"),
  desksCovered: count("SELECT COUNT(DISTINCT section_slug) as c FROM department_assignments"),
  subscriptions: count("SELECT COUNT(*) as c FROM alert_subscriptions"),
  uploadsDir: fs.existsSync("/data/uploads") ? fs.readdirSync("/data/uploads").length : null,
  dbBytes: fs.statSync("/data/rustenburg.db").size,
  backups: fs.readdirSync("/data/backups").filter((n) => n.endsWith(".db")).slice(-5),
  seedDemoEnv: process.env.SEED_DEMO || null,
  nodeEnv: process.env.NODE_ENV || null,
};
console.log(JSON.stringify(report, null, 2));
