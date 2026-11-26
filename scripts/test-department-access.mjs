/**
 * Department login + permission tests against the local DATA_DIR database.
 * Passwords are read from data/department-*.txt / bootstrap-admin.txt and never printed.
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

process.env.DATA_DIR = process.env.DATA_DIR || path.resolve("data");
process.env.SEED_DEMO = process.env.SEED_DEMO || "false";

function parseSecretFile(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  const email = (text.match(/^email=(.+)$/m) || [])[1]?.trim();
  const password = (text.match(/^password=(.+)$/m) || [])[1]?.trim();
  return { email, password, file: path.basename(filePath) };
}

function loadCreds() {
  const dir = process.env.DATA_DIR;
  const files = fs.readdirSync(dir).filter((n) => n.startsWith("department-") || n === "bootstrap-admin.txt");
  return files.map((n) => parseSecretFile(path.join(dir, n))).filter((c) => c.email && c.password);
}

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

async function main() {
  const { ensureReady } = await import("../src/server/init.ts");
  const { loginAccount, logoutCookie, loadUser } = await import("../src/server/auth.ts");
  const { assignedSections, canPublishSection, listAssignments, manageableSections } = await import("../src/server/departments.ts");
  const { hasPermission } = await import("../src/server/permissions.ts");
  const { get, all } = await import("../src/server/db.ts");

  ensureReady();
  const creds = loadCreds();
  const results = [];
  const bugs = [];

  // Invalid / unknown account checks (no secrets)
  let invalidPassword = "FAIL";
  let unknownAccount = "FAIL";
  try {
    loginAccount("thabo.soke@rustenburgtoday.co.za", "DefinitelyWrongPassword99!", { ip: "dept-test-bad" });
    invalidPassword = "FAIL";
    bugs.push("invalid password was accepted");
  } catch (err) {
    invalidPassword = String(err.message || err).match(/incorrect|401/i) || err.status === 401 ? "PASS" : "PARTIAL";
  }
  try {
    loginAccount("no-such-dept@rustenburgtoday.co.za", "Password12345", { ip: "dept-test-unknown" });
    unknownAccount = "FAIL";
    bugs.push("unknown account was accepted");
  } catch (err) {
    unknownAccount = String(err.message || err).match(/incorrect|401/i) || err.status === 401 ? "PASS" : "PARTIAL";
  }

  const assignments = listAssignments();
  const bySection = new Map();
  for (const row of assignments) {
    const list = bySection.get(row.section_slug) || [];
    list.push(row);
    bySection.set(row.section_slug, list);
  }

  const loginByEmail = new Map();
  for (const c of creds) {
    const entry = { email: c.email, file: c.file, login: "FAIL", roles: [], sections: [], errors: [] };
    try {
      const { user, cookie } = loginAccount(c.email, c.password, { ip: `dept-test-${c.email}` });
      entry.login = "PASS";
      entry.roles = user.roles;
      entry.displayName = user.displayName;
      entry.status = user.status;
      entry.sections = assignedSections(user.id);
      entry.adminOrEditor = user.roles.includes("administrator") || user.roles.includes("editor");
      entry.canPublishOwn = entry.sections.every((s) => canPublishSection(user, s));
      entry.cannotPublishForeign = MANAGEABLE.filter((s) => !entry.sections.includes(s) && !entry.adminOrEditor)
        .every((s) => !canPublishSection(user, s));
      entry.hasDeptPublish = hasPermission(user.id, "departments.publish") || entry.adminOrEditor;
      entry.usersManage = hasPermission(user.id, "users.manage");
      // session cookie present
      entry.sessionCookie = Boolean(cookie && cookie.length > 10);
      logoutCookie(cookie);
      entry.logout = "PASS";
    } catch (err) {
      entry.login = "FAIL";
      entry.errors.push(String(err.message || err).slice(0, 120));
    }
    loginByEmail.set(c.email.toLowerCase(), entry);
    results.push(entry);
  }

  const table = MANAGEABLE.map((slug) => {
    const accounts = bySection.get(slug) || [];
    const account = accounts[0];
    const login = account ? loginByEmail.get(account.email.toLowerCase()) : null;
    let loginStatus = "BLOCKED";
    let dashboard = "NOT TESTED";
    let permissions = "NOT TESTED";
    let result = "BLOCKED";

    if (!account) {
      return {
        division: divisionFor(slug),
        department: slug,
        accountExists: "FAIL",
        login: "BLOCKED",
        dashboard: "BLOCKED",
        permissions: "BLOCKED",
        result: "BLOCKED",
        note: "No department account assigned",
      };
    }

    if (!login) {
      loginStatus = "BLOCKED";
      result = "BLOCKED";
      dashboard = "BLOCKED";
      permissions = "PARTIAL";
      // still can check assignment exists
      return {
        division: divisionFor(slug),
        department: slug,
        accountExists: "PASS",
        email: account.email,
        login: loginStatus,
        dashboard,
        permissions,
        result,
        note: "Account exists but one-time password file missing locally",
      };
    }

    loginStatus = login.login;
    if (login.login === "PASS") {
      const ownsDesk = login.adminOrEditor || login.sections.includes(slug);
      dashboard = ownsDesk ? "PASS" : "FAIL";
      permissions =
        login.canPublishOwn && login.cannotPublishForeign && login.hasDeptPublish ? "PASS" : "FAIL";
      if (!login.canPublishOwn) bugs.push(`${login.email} cannot publish own sections`);
      if (!login.cannotPublishForeign) bugs.push(`${login.email} can publish foreign sections`);
      result = loginStatus === "PASS" && dashboard === "PASS" && permissions === "PASS" ? "PASS" : "PARTIAL";
    } else {
      dashboard = "FAIL";
      permissions = "FAIL";
      result = "FAIL";
    }

    return {
      division: divisionFor(slug),
      department: slug,
      accountExists: "PASS",
      email: account.email,
      displayName: login.displayName,
      roles: login.roles,
      login: loginStatus,
      dashboard,
      permissions,
      result,
      sessionCookie: login.sessionCookie,
      logout: login.logout,
    };
  });

  // Admin checks
  const adminLogin = [...loginByEmail.values()].find((r) => r.roles?.includes("administrator"));
  const adminChecks = {
    login: adminLogin?.login || "BLOCKED",
    usersManage: adminLogin?.usersManage === true ? "PASS" : adminLogin ? "FAIL" : "BLOCKED",
    allDesks: adminLogin?.login === "PASS" ? (manageableSections().length === MANAGEABLE.length ? "PASS" : "PARTIAL") : "BLOCKED",
  };

  const summary = {
    totals: {
      departments: MANAGEABLE.length,
      accountsExist: table.filter((r) => r.accountExists === "PASS").length,
      missingAccounts: table.filter((r) => r.accountExists === "FAIL").length,
      loginPass: table.filter((r) => r.login === "PASS").length,
      loginFail: table.filter((r) => r.login === "FAIL").length,
      loginBlocked: table.filter((r) => r.login === "BLOCKED").length,
      dashboardPass: table.filter((r) => r.dashboard === "PASS").length,
      dashboardFail: table.filter((r) => r.dashboard === "FAIL").length,
      permissionsPass: table.filter((r) => r.permissions === "PASS").length,
      permissionsFail: table.filter((r) => r.permissions === "FAIL").length,
      overallPass: table.filter((r) => r.result === "PASS").length,
    },
    authGuards: { invalidPassword, unknownAccount },
    adminChecks,
    credentialFilesFound: creds.map((c) => ({ email: c.email, file: c.file })),
    bugs,
    table,
  };

  const out = path.resolve("evidence/department-access/local-login-results.json");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(summary, null, 2));
  console.log(JSON.stringify({
    totals: summary.totals,
    authGuards: summary.authGuards,
    adminChecks: summary.adminChecks,
    bugs: summary.bugs,
    testedEmails: summary.credentialFilesFound.map((c) => c.email),
    passRows: summary.table.filter((r) => r.result === "PASS"),
    blockedMissing: summary.table.filter((r) => r.accountExists === "FAIL").map((r) => r.department),
  }, null, 2));
}

main().catch((err) => {
  console.error(String(err.stack || err));
  process.exit(1);
});
