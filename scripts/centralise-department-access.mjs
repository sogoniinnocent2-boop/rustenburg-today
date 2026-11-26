/**
 * Assign every manageable department desk to the three existing central editors.
 * Uses application APIs (audit + role grant). Never prints passwords.
 *
 * Usage: npx tsx scripts/centralise-department-access.mjs
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.env.DATA_DIR = process.env.DATA_DIR || path.join(root, "data");
process.env.SEED_DEMO = process.env.SEED_DEMO || "false";

const CENTRAL_EMAILS = [
  "thabo.soke@rustenburgtoday.co.za",
  "innocent.sogoni@rustenburgtoday.co.za",
  "thato.selokwane@rustenburgtoday.co.za",
];

const { ensureReady } = await import("../src/server/init.ts");
const { loadUser } = await import("../src/server/auth.ts");
const { get } = await import("../src/server/db.ts");
const { assignAllManageableDepartments, assignedSections, manageableSections } = await import("../src/server/departments.ts");

ensureReady();

const adminRow = get(
  `SELECT u.id FROM users u
   JOIN user_roles ur ON ur.user_id = u.id
   JOIN roles r ON r.id = ur.role_id
   WHERE r.name = 'administrator' AND u.status = 'active'
   ORDER BY u.created_at LIMIT 1`,
);
if (!adminRow) throw new Error("No administrator found");
const admin = loadUser(adminRow.id);
if (!admin) throw new Error("Administrator profile missing");

const desks = manageableSections();
const results = [];
for (const email of CENTRAL_EMAILS) {
  const result = assignAllManageableDepartments(admin, { email });
  const sections = assignedSections(result.userId);
  results.push({
    email: result.email,
    newlyAssigned: result.assigned,
    totalAssigned: sections.length,
    coversAll: desks.every((slug) => sections.includes(slug)),
  });
}

const out = {
  dataDir: process.env.DATA_DIR,
  deskCount: desks.length,
  desks,
  results,
};
fs.mkdirSync(path.join(root, "evidence/dept-central"), { recursive: true });
fs.writeFileSync(path.join(root, "evidence/dept-central/local-assign.json"), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
