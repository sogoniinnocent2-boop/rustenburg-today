/** Run on Railway container: node /tmp/remote-dept-audit.js */
const { DatabaseSync } = require("node:sqlite");
const fs = require("node:fs");
const db = new DatabaseSync("/data/rustenburg.db", { readOnly: true });
const MANAGEABLE = [
  "news","community","podcasts","tv","radio","music","talent","marketplace","jobs","learn",
  "events","business","advertising","property","food","sports","youth","support","transport",
  "tourism","health","voice","deals","competitions","history","services","agriculture","faith",
  "family","technology","notices","creators",
];
const assignments = db.prepare(`
  SELECT a.section_slug, u.email, u.status, p.display_name,
         group_concat(DISTINCT r.name) as roles
  FROM department_assignments a
  JOIN users u ON u.id = a.user_id
  JOIN profiles p ON p.user_id = u.id
  LEFT JOIN user_roles ur ON ur.user_id = u.id
  LEFT JOIN roles r ON r.id = ur.role_id
  WHERE u.status != 'deleted'
  GROUP BY a.user_id, a.section_slug
  ORDER BY a.section_slug, u.email
`).all();
const staff = db.prepare(`
  SELECT u.email, u.status, p.display_name, group_concat(DISTINCT r.name) as roles,
         (SELECT count(*) FROM department_assignments da WHERE da.user_id = u.id) as assignment_count
  FROM users u
  JOIN profiles p ON p.user_id = u.id
  JOIN user_roles ur ON ur.user_id = u.id
  JOIN roles r ON r.id = ur.role_id
  WHERE r.name IN ('department_editor','editor','administrator','journalist')
  GROUP BY u.id ORDER BY u.email
`).all();
const by = new Map();
for (const a of assignments) {
  const list = by.get(a.section_slug) || [];
  list.push({ email: a.email, status: a.status, displayName: a.display_name, roles: a.roles });
  by.set(a.section_slug, list);
}
const out = {
  usersTotal: db.prepare("SELECT count(*) as c FROM users WHERE status != 'deleted'").get().c,
  assignmentCount: assignments.length,
  staffAccounts: staff,
  departments: MANAGEABLE.map((slug) => ({
    department: slug,
    accountExists: by.has(slug),
    accounts: by.get(slug) || [],
  })),
  missing: MANAGEABLE.filter((s) => !by.has(s)),
  deptFiles: fs.existsSync("/data")
    ? fs.readdirSync("/data").filter((n) => n.startsWith("department-") || n === "bootstrap-admin.txt")
    : [],
};
console.log(JSON.stringify(out));
