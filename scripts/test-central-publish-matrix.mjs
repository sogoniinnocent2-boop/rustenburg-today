/** Local API: 3 accounts × 32 desks canPublish + one publish/cleanup sample each. */
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.env.DATA_DIR = process.env.DATA_DIR || path.join(root, "data");
process.env.SEED_DEMO = "false";

const EMAILS = [
  "thabo.soke@rustenburgtoday.co.za",
  "innocent.sogoni@rustenburgtoday.co.za",
  "thato.selokwane@rustenburgtoday.co.za",
];

function passwordFor(email) {
  for (const name of fs.readdirSync(process.env.DATA_DIR).filter((n) => n.startsWith("department-"))) {
    const text = fs.readFileSync(path.join(process.env.DATA_DIR, name), "utf8");
    const mail = (text.match(/^email=(.+)$/m) || [])[1]?.trim();
    const password = (text.match(/^password=(.+)$/m) || [])[1]?.trim();
    if (mail?.toLowerCase() === email && password) return password;
  }
  throw new Error(`Missing password for ${email}`);
}

const { ensureReady } = await import("../src/server/init.ts");
const { loginAccount, logoutCookie, registerAccount, verifyEmail, loadUser } = await import("../src/server/auth.ts");
const { assignedSections, canPublishSection, manageableSections } = await import("../src/server/departments.ts");
const { publishDeskArticle, listDepartmentStories } = await import("../src/server/editorial.ts");
const { run } = await import("../src/server/db.ts");

ensureReady();
const desks = manageableSections();
const matrix = [];
const publishSamples = [];

for (const email of EMAILS) {
  const { user, cookie } = loginAccount(email, passwordFor(email), { ip: `central-pub-${email}` });
  const mine = assignedSections(user.id);
  for (const section of desks) {
    const ok = canPublishSection(user, section) && mine.includes(section);
    matrix.push({ email, section, canPublish: ok, result: ok ? "PASS" : "FAIL" });
  }
  const sampleSection = "sports";
  const created = publishDeskArticle(user, {
    categorySlug: "announcements",
    language: "en",
    title: `Central desk verify ${sampleSection} marker`,
    excerpt: "Temporary centralisation verification story for sports desk attribution.",
    body: "This temporary article confirms multi-desk publishing attribution for the central department access rollout. It will be archived after the check.",
    imageUrl: "/uploads/central-verify.jpg",
    departmentSlug: sampleSection,
  });
  const listed = listDepartmentStories(sampleSection, "en", 24).some((item) => item.id === created.id);
  const leaked = listDepartmentStories("news", "en", 24).some((item) => item.id === created.id);
  publishSamples.push({ email, section: sampleSection, id: created.id, listedOwn: listed, leakedToNews: leaked });
  run(
    "UPDATE articles SET deleted_at = ?, status = 'archived', updated_at = ? WHERE id = ?",
    new Date().toISOString(),
    new Date().toISOString(),
    created.id,
  );
  logoutCookie(cookie);
}

// outsider cannot publish
const outsider = registerAccount({
  email: `outsider-central-${Date.now()}@example.com`,
  password: "password123",
  displayName: "Outsider",
  dateOfBirth: "1990-01-01",
  acceptedTerms: true,
  guardianConsent: false,
  locale: "en",
  ip: "outsider-central",
});
verifyEmail(outsider.verifyToken);
const outsiderUser = loadUser(outsider.userId);
let outsiderBlocked = false;
try {
  publishDeskArticle(outsiderUser, {
    categorySlug: "local-news",
    language: "en",
    title: "Outsider should fail",
    excerpt: "This publish must be refused.",
    body: "Unauthorised account attempting a department desk publish during centralisation security checks.",
    imageUrl: "/uploads/x.jpg",
    departmentSlug: "news",
  });
} catch (err) {
  outsiderBlocked = /not assigned|permission/i.test(String(err.message || err));
}

const out = {
  combinations: matrix.length,
  pass: matrix.filter((r) => r.result === "PASS").length,
  fail: matrix.filter((r) => r.result === "FAIL").length,
  publishSamples,
  outsiderBlocked: outsiderBlocked ? "PASS" : "FAIL",
};
fs.mkdirSync(path.join(root, "evidence/dept-central"), { recursive: true });
fs.writeFileSync(path.join(root, "evidence/dept-central/publish-matrix.json"), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
