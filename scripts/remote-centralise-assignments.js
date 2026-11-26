/** Run on Railway: assign all manageable desks to the three central editors. No secrets printed. */
const { DatabaseSync } = require("node:sqlite");
const crypto = require("node:crypto");
const fs = require("node:fs");

const MANAGEABLE = [
  "news","community","podcasts","tv","radio","music","talent","marketplace","jobs","learn",
  "events","business","advertising","property","food","sports","youth","support","transport",
  "tourism","health","voice","deals","competitions","history","services","agriculture","faith",
  "family","technology","notices","creators",
];

const CENTRAL = [
  "thabo.soke@rustenburgtoday.co.za",
  "innocent.sogoni@rustenburgtoday.co.za",
  "thato.selokwane@rustenburgtoday.co.za",
];

const db = new DatabaseSync("/data/rustenburg.db");
db.exec("PRAGMA foreign_keys = ON");

const backupDir = "/data/backups";
fs.mkdirSync(backupDir, { recursive: true });
const backupPath = `${backupDir}/rustenburg-centralise-${Date.now()}.db`;
fs.copyFileSync("/data/rustenburg.db", backupPath);

const admin = db.prepare(`
  SELECT u.id FROM users u
  JOIN user_roles ur ON ur.user_id = u.id
  JOIN roles r ON r.id = ur.role_id
  WHERE r.name = 'administrator' AND u.status = 'active'
  ORDER BY u.created_at LIMIT 1
`).get();
if (!admin) throw new Error("No administrator");

const role = db.prepare("SELECT id FROM roles WHERE name = 'department_editor'").get();
if (!role) throw new Error("Missing department_editor role");

const stamp = new Date().toISOString();
const results = [];

const insertAssign = db.prepare(
  "INSERT OR IGNORE INTO department_assignments (user_id, section_slug, created_by, created_at) VALUES (?, ?, ?, ?)",
);
const insertRole = db.prepare("INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)");
const insertAudit = db.prepare(
  "INSERT INTO audit_logs (id, actor_id, action, resource_type, resource_id, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
);

db.exec("BEGIN IMMEDIATE");
try {
  for (const email of CENTRAL) {
    const user = db.prepare("SELECT id, email, status FROM users WHERE email = ?").get(email);
    if (!user || user.status === "deleted") throw new Error(`Missing account ${email}`);
    insertRole.run(user.id, role.id);
    let newly = 0;
    for (const section of MANAGEABLE) {
      const info = insertAssign.run(user.id, section, admin.id, stamp);
      if (Number(info.changes || 0) > 0) newly += 1;
    }
    const total = db.prepare("SELECT COUNT(*) as c FROM department_assignments WHERE user_id = ?").get(user.id).c;
    insertAudit.run(
      crypto.randomUUID(),
      admin.id,
      "department.assign_all",
      "user",
      user.id,
      JSON.stringify({ assigned: newly, total: MANAGEABLE.length, source: "remote-centralise" }),
      stamp,
    );
    results.push({ email: user.email, newlyAssigned: newly, totalAssigned: total, coversAll: total >= MANAGEABLE.length });
  }
  db.exec("COMMIT");
} catch (error) {
  db.exec("ROLLBACK");
  throw error;
}

const coverage = MANAGEABLE.map((section) => ({
  section,
  editors: db.prepare("SELECT COUNT(*) as c FROM department_assignments WHERE section_slug = ?").get(section).c,
}));

console.log(JSON.stringify({
  backupPath,
  deskCount: MANAGEABLE.length,
  results,
  uncovered: coverage.filter((row) => row.editors === 0).map((row) => row.section),
  allCovered: coverage.every((row) => row.editors > 0),
}, null, 2));
