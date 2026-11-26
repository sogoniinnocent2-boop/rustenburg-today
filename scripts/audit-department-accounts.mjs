/** Read-only department account audit using node:sqlite. Never prints secrets. */
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const dbPath = process.argv[2] || "data/rustenburg.db";
const outPath = process.argv[3] || null;
const db = new DatabaseSync(dbPath, { readOnly: true });

const MANAGEABLE = [
  "news","community","podcasts","tv","radio","music","talent","marketplace","jobs","learn",
  "events","business","advertising","property","food","sports","youth","support","transport",
  "tourism","health","voice","deals","competitions","history","services","agriculture","faith",
  "family","technology","notices","creators",
];

const DIVISIONS = {
  news: ["news","podcasts","tv","radio","music"],
  events: ["events","competitions"],
  market: ["marketplace"],
  property: ["property"],
  business: ["business","advertising","deals"],
  learn: ["learn"],
  jobs: ["jobs"],
  community: ["community"],
  discover: ["tourism","transport","services"],
  talent: ["talent","creators"],
  life: ["food","sports","youth","health","family","agriculture","faith"],
  city: ["voice","history","notices","support","technology"],
};

function divisionFor(slug) {
  for (const [id, slugs] of Object.entries(DIVISIONS)) {
    if (slugs.includes(slug)) return id;
  }
  return "other";
}

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
  GROUP BY u.id
  ORDER BY u.email
`).all();

const usersTotal = db.prepare(`SELECT count(*) as c FROM users WHERE status != 'deleted'`).get().c;
const bySection = new Map();
for (const row of assignments) {
  const list = bySection.get(row.section_slug) || [];
  list.push(row);
  bySection.set(row.section_slug, list);
}

const departments = MANAGEABLE.map((slug) => {
  const accounts = bySection.get(slug) || [];
  return {
    division: divisionFor(slug),
    department: slug,
    accountExists: accounts.length > 0,
    accounts: accounts.map((a) => ({
      email: a.email,
      status: a.status,
      displayName: a.display_name,
      roles: a.roles,
    })),
  };
});

const sharedMap = new Map();
for (const a of assignments) {
  const list = sharedMap.get(a.email) || [];
  list.push(a.section_slug);
  sharedMap.set(a.email, list);
}

const report = {
  dbPath,
  usersTotal,
  manageableCount: MANAGEABLE.length,
  assignmentCount: assignments.length,
  uniqueAssignedEmails: [...new Set(assignments.map((a) => a.email))].length,
  staffAccounts: staff.map((s) => ({
    email: s.email,
    status: s.status,
    displayName: s.display_name,
    roles: s.roles,
    assignmentCount: s.assignment_count,
  })),
  departments,
  missingDepartments: departments.filter((d) => !d.accountExists).map((d) => d.department),
  sharedAccounts: [...sharedMap.entries()]
    .filter(([, secs]) => secs.length > 1)
    .map(([email, sections]) => ({ email, sections })),
};

const text = JSON.stringify(report, null, 2);
if (outPath) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, text);
}
console.log(text);
