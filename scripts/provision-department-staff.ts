/**
 * Provision department staff from environment variables.
 * Example:
 *   $env:DEPT_EMAIL="person@example.com"
 *   $env:DEPT_NAME="Person Name"
 *   $env:DEPT_SECTION="news"
 *   $env:DEPT_PASSWORD="Password123"
 *   npx tsx scripts/provision-department-staff.ts
 */
import { loadUser } from "../src/server/auth";
import { get } from "../src/server/db";
import { assignDepartment, createDepartmentStaff, listAssignments } from "../src/server/departments";
import { ensureReady } from "../src/server/init";

const email = process.env.DEPT_EMAIL?.trim().toLowerCase();
const displayName = process.env.DEPT_NAME?.trim();
const section = process.env.DEPT_SECTION?.trim().toLowerCase();
const password = process.env.DEPT_PASSWORD;

if (!email || !displayName || !section || !password) {
  console.error("Set DEPT_EMAIL, DEPT_NAME, DEPT_SECTION and DEPT_PASSWORD");
  process.exit(1);
}

function adminUser() {
  const row = get<{ id: string }>(
    `SELECT u.id FROM users u
     JOIN user_roles ur ON ur.user_id = u.id
     JOIN roles r ON r.id = ur.role_id
     WHERE r.name = 'administrator' AND u.status = 'active'
     ORDER BY u.created_at LIMIT 1`,
  );
  if (!row) throw new Error("No administrator account found. Start the app once so bootstrap admin is created.");
  const user = loadUser(row.id);
  if (!user) throw new Error("Administrator profile missing");
  return user;
}

ensureReady();
const admin = adminUser();
const existing = get<{ id: string }>("SELECT id FROM users WHERE email = ?", email);
if (existing) {
  assignDepartment(admin, { userId: existing.id, section });
  console.log(`assigned existing ${email} -> ${section}`);
} else {
  const created = createDepartmentStaff(admin, { email, displayName, section, password });
  console.log(`created ${created.email} -> ${section}`);
}

for (const row of listAssignments()) {
  console.log(`- ${row.email} · ${row.section_slug}`);
}
