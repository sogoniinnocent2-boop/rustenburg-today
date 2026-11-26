/**
 * Cross-department publish isolation using local DATA_DIR accounts.
 * Never prints passwords.
 */
import fs from "node:fs";
import path from "node:path";

process.env.DATA_DIR = process.env.DATA_DIR || path.resolve("data");
process.env.SEED_DEMO = process.env.SEED_DEMO || "false";

function parseSecretFile(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  return {
    email: (text.match(/^email=(.+)$/m) || [])[1]?.trim(),
    password: (text.match(/^password=(.+)$/m) || [])[1]?.trim(),
  };
}

async function main() {
  const { ensureReady } = await import("../src/server/init.ts");
  const { loginAccount, logoutCookie } = await import("../src/server/auth.ts");
  const { canPublishSection, assignedSections } = await import("../src/server/departments.ts");
  const { publishDeskArticle, listDepartmentStories } = await import("../src/server/editorial.ts");
  const { AppError } = await import("../src/server/errors.ts");

  ensureReady();
  const files = fs.readdirSync(process.env.DATA_DIR).filter((n) => n.startsWith("department-"));
  const results = [];

  for (const file of files) {
    const cred = parseSecretFile(path.join(process.env.DATA_DIR, file));
    const { user, cookie } = loginAccount(cred.email, cred.password, { ip: `publish-test-${cred.email}` });
    const mine = assignedSections(user.id);
    const own = mine[0];
    const foreign = ["news", "events", "business", "sports", "learn"].find((s) => !mine.includes(s));

    const row = {
      email: cred.email,
      own,
      foreign,
      canOwn: canPublishSection(user, own),
      canForeign: canPublishSection(user, foreign),
      publishOwn: "NOT TESTED",
      publishForeignBlocked: "NOT TESTED",
      listedOwn: "NOT TESTED",
    };

    try {
      const created = publishDeskArticle(user, {
        categorySlug: own === "news" ? "local-news" : "announcements",
        language: "en",
        title: `Desk access test ${own} marker`,
        excerpt: "Automated department access verification story for workspace isolation testing.",
        body: "This temporary article confirms that an assigned department editor can create and publish a desk story for their own department only during access testing.",
        imageUrl: "/uploads/desk-access-test.jpg",
        departmentSlug: own,
      });
      row.publishOwn = created?.id ? "PASS" : "FAIL";
      // listDepartmentStories only returns published rows; publishDeskArticle publishes live.
      const items = listDepartmentStories(own, "en", 24);
      row.listedOwn = items.some((i) => i.id === created.id) ? "PASS" : "PARTIAL";
    } catch (err) {
      row.publishOwn = "FAIL";
      row.publishOwnError = String(err.message || err).slice(0, 160);
    }

    try {
      publishDeskArticle(user, {
        categorySlug: "local-news",
        language: "en",
        title: "Foreign desk attempt marker",
        excerpt: "This must be refused by assignment checks.",
        body: "Cross-department publish attempt that should fail because this account is not assigned to the foreign desk.",
        imageUrl: "/uploads/desk-access-test.jpg",
        departmentSlug: foreign,
      });
      row.publishForeignBlocked = "FAIL";
    } catch (err) {
      const msg = String(err.message || err);
      row.publishForeignBlocked = /not assigned|permission|403/i.test(msg) || err instanceof AppError || err.status === 403 ? "PASS" : "PARTIAL";
      row.foreignError = msg.slice(0, 120);
    }

    logoutCookie(cookie);
    row.result =
      row.canOwn && !row.canForeign && row.publishOwn === "PASS" && row.publishForeignBlocked === "PASS" ? "PASS" : "PARTIAL";
    results.push(row);
  }

  const out = path.resolve("evidence/department-access/publish-isolation.json");
  fs.writeFileSync(out, JSON.stringify({ results }, null, 2));
  console.log(JSON.stringify({ results }, null, 2));
}

main().catch((err) => {
  console.error(String(err.stack || err));
  process.exit(1);
});
