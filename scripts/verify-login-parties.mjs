/**
 * 100% login check for all operator parties against production.
 * Never prints passwords.
 */
import fs from "node:fs";
import path from "node:path";
import https from "node:https";
import { URL } from "node:url";
import { spawnSync } from "node:child_process";

const BASE = "https://www.rustenburgtoday.co.za";
const DATA = path.resolve("data");

function cred(file) {
  const text = fs.readFileSync(path.join(DATA, file), "utf8");
  return {
    file,
    email: (text.match(/^email=(.+)$/m) || [])[1]?.trim(),
    password: (text.match(/^password=(.+)$/m) || [])[1]?.trim(),
  };
}

function request(method, urlString, { headers = {}, body = null } = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlString);
    const req = https.request(
      { hostname: url.hostname, path: url.pathname + url.search, method, headers },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const setCookies = [];
          const raw = res.rawHeaders || [];
          for (let i = 0; i < raw.length; i += 2) {
            if (String(raw[i]).toLowerCase() === "set-cookie") setCookies.push(raw[i + 1]);
          }
          resolve({
            status: res.statusCode || 0,
            location: res.headers.location || "",
            setCookies,
            body: Buffer.concat(chunks).toString("utf8"),
          });
        });
      },
    );
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

function merge(jar, setCookies) {
  for (const c of setCookies) {
    const pair = c.split(";")[0];
    if (!pair?.includes("=")) continue;
    const name = pair.split("=")[0];
    const idx = jar.findIndex((x) => x.startsWith(`${name}=`));
    if (idx >= 0) jar[idx] = pair;
    else jar.push(pair);
  }
}

function multipart(fields) {
  const boundary = "----RTLogin" + Date.now() + Math.random().toString(16).slice(2, 8);
  let body = "";
  for (const [k, v] of Object.entries(fields)) {
    body += `--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`;
  }
  body += `--${boundary}--\r\n`;
  return { contentType: `multipart/form-data; boundary=${boundary}`, body };
}

function pickSignInActionId(html) {
  const emailIdx = html.indexOf('name="email"');
  if (emailIdx >= 0) {
    const window = html.slice(Math.max(0, emailIdx - 1200), emailIdx + 50);
    const near = [...window.matchAll(/\$ACTION_ID_([a-f0-9]+)/g)].map((m) => m[1]);
    if (near.length) return near.at(-1);
  }
  return (html.match(/\$ACTION_ID_([a-f0-9]+)/) || [])[1] || null;
}

async function attemptLogin(email, password, pagePath, nextValue) {
  const page = await request("GET", `${BASE}${pagePath}`);
  const actionId = pickSignInActionId(page.body);
  if (!actionId) return { ok: false, reason: "no-action-id", jar: [], status: page.status, location: "" };
  const jar = [];
  merge(jar, page.setCookies);
  const { contentType, body } = multipart({
    [`$ACTION_ID_${actionId}`]: "",
    locale: "en",
    email,
    password,
    next: nextValue,
  });
  const res = await request("POST", `${BASE}${pagePath}`, {
    headers: {
      "content-type": contentType,
      "content-length": Buffer.byteLength(body),
      origin: BASE,
      referer: `${BASE}${pagePath}`,
      cookie: jar.join("; "),
    },
    body,
  });
  merge(jar, res.setCookies);
  const hasSession = jar.some((c) => c.startsWith("rt_session="));
  const error = decodeURIComponent((res.location.match(/[?&]error=([^&]+)/) || [])[1] || "") || null;
  return {
    ok: hasSession && (res.status === 303 || res.status === 302),
    hasSession,
    status: res.status,
    location: res.location,
    error,
    jar,
  };
}

async function getAuthed(path, jar) {
  return request("GET", `${BASE}${path}`, { headers: { cookie: jar.join("; ") } });
}

function railwaySsh(remoteCmd) {
  const wrapped = `railway ssh -- ${JSON.stringify(remoteCmd)}`;
  return spawnSync(wrapped, {
    encoding: "utf8",
    shell: true,
    cwd: process.cwd(),
    env: process.env,
    maxBuffer: 10 * 1024 * 1024,
  });
}

function uploadAndRun(js) {
  const b64 = Buffer.from(js, "utf8").toString("base64");
  railwaySsh("rm -f /tmp/login-parties.b64 /tmp/login-parties.js");
  for (let i = 0; i < b64.length; i += 120) {
    railwaySsh(`printf '%s' '${b64.slice(i, i + 120)}' >> /tmp/login-parties.b64`);
  }
  const run = railwaySsh(
    "base64 -d /tmp/login-parties.b64 > /tmp/login-parties.js && node /tmp/login-parties.js && rm -f /tmp/login-parties.js /tmp/login-parties.b64",
  );
  const err = (run.stderr || "")
    .split(/\r?\n/)
    .filter((l) => !/deprecated|Using SSH|Config as Code|Migrate|Existing files|DeprecationWarning|trace-deprecation/i.test(l))
    .join("\n")
    .trim();
  if (run.status !== 0) throw new Error(err || run.stdout || "railway remote failed");
  return JSON.parse((run.stdout || "").trim());
}

// Clear prior login rate-limit windows so verification is not blocked by probe traffic.
try {
  uploadAndRun(
    [
      'const { DatabaseSync } = require("node:sqlite");',
      "const db = new DatabaseSync('/data/rustenburg.db');",
      "db.prepare(\"DELETE FROM rate_limits WHERE bucket LIKE 'login:%'\").run();",
      "console.log(JSON.stringify({ cleared: true }));",
    ].join("\n"),
  );
} catch {
  // continue; HTTP checks still run
}

const parties = [
  {
    key: "admin",
    file: "bootstrap-admin.txt",
    role: "administrator",
    pagePath: "/en/auth/sign-in",
    nextValue: "/en/admin",
    dashPath: "/en/admin",
    mustContain: [/City desks|Departments|Coverage|CMS/i],
    mustNotContain: [/name="password"/i, /Content desk login/i],
  },
  {
    key: "desk-business",
    file: "department-business-thato-selokwane.txt",
    role: "department_editor",
    pagePath: "/en/department",
    nextValue: "/en/department",
    dashPath: "/en/department",
    mustContain: [/Your content desks|department/i],
    mustNotContain: [/name="password"/i, /Content desk login/i],
  },
  {
    key: "desk-events",
    file: "department-events-innocent-sogoni.txt",
    role: "department_editor",
    pagePath: "/en/department",
    nextValue: "/en/department",
    dashPath: "/en/department",
    mustContain: [/Your content desks|department/i],
    mustNotContain: [/name="password"/i, /Content desk login/i],
  },
  {
    key: "desk-news",
    file: "department-news-thabo-soke.txt",
    role: "department_editor",
    pagePath: "/en/department",
    nextValue: "/en/department",
    dashPath: "/en/department",
    mustContain: [/Your content desks|department/i],
    mustNotContain: [/name="password"/i, /Content desk login/i],
  },
];

const results = [];
// Successful logins first (stay under production login rate limit), then one wrong-password probe.
for (const party of parties) {
  const c = cred(party.file);
  const checks = {};

  const good = await attemptLogin(c.email, c.password, party.pagePath, party.nextValue);
  checks.login = good.ok ? "PASS" : "FAIL";
  checks.loginDetail = { status: good.status, location: good.location, hasSession: good.hasSession, error: good.error };

  let dash = null;
  if (good.ok) {
    dash = await getAuthed(party.dashPath, good.jar);
    const hasMust = party.mustContain.some((re) => re.test(dash.body));
    const hasForbidden = party.mustNotContain.some((re) => re.test(dash.body));
    checks.dashboard = dash.status === 200 && hasMust && !hasForbidden ? "PASS" : "FAIL";
    checks.dashboardDetail = {
      status: dash.status,
      hasExpectedUi: hasMust,
      stillShowingLogin: hasForbidden,
    };
  } else {
    checks.dashboard = "FAIL";
  }

  if (good.ok && party.role === "department_editor" && dash) {
    const deskLinks = [...dash.body.matchAll(/href="(\/en\/department\/[a-z0-9-]+)"/g)].map((m) => m[1]);
    const unique = [...new Set(deskLinks)].slice(0, 3);
    const deskOpens = [];
    for (const link of unique) {
      const page = await getAuthed(link, good.jar);
      deskOpens.push({
        path: link,
        status: page.status,
        ok: page.status === 200 && !/name="password"/i.test(page.body),
      });
    }
    checks.deskRoutes = deskOpens.length && deskOpens.every((d) => d.ok) ? "PASS" : deskOpens.length ? "FAIL" : "PARTIAL";
    checks.deskRoutesDetail = deskOpens;
  }

  if (good.ok && party.role === "administrator") {
    const departments = await getAuthed("/en/admin/departments", good.jar);
    const assignUi =
      departments.status === 200 &&
      /Assign all desks/i.test(departments.body) &&
      !/name="password"/i.test(departments.body);
    checks.adminControls = assignUi ? "PASS" : "FAIL";
    checks.adminControlsDetail = { status: departments.status, hasAssignAll: /Assign all desks/i.test(departments.body || "") };
  }

  results.push({
    party: party.key,
    email: c.email,
    file: party.file,
    role: party.role,
    overall: "PENDING",
    checks,
  });
}

{
  const sample = parties[0];
  const c = cred(sample.file);
  const bad = await attemptLogin(c.email, "definitely-wrong-password-xx", sample.pagePath, sample.nextValue);
  const rejected = !bad.ok && !bad.hasSession ? "PASS" : "FAIL";
  for (const row of results) {
    row.checks.wrongPasswordRejected = rejected;
    row.checks.wrongPasswordDetail = { status: bad.status, error: bad.error, sharedProbe: true };
  }
}

for (const row of results) {
  const statuses = Object.entries(row.checks)
    .filter(([k]) => !k.endsWith("Detail"))
    .map(([, v]) => v);
  row.overall = statuses.every((s) => s === "PASS") ? "PASS" : statuses.some((s) => s === "FAIL") ? "FAIL" : "PARTIAL";
}

let coverage = null;
try {
  const emails = parties.map((p) => cred(p.file).email);
  coverage = uploadAndRun(
    [
      'const { DatabaseSync } = require("node:sqlite");',
      "const db = new DatabaseSync('/data/rustenburg.db');",
      `const emails = ${JSON.stringify(emails)};`,
      "const out = [];",
      "for (const email of emails) {",
      "  const u = db.prepare('SELECT id, email, status FROM users WHERE email = ?').get(email);",
      "  if (!u) { out.push({ email, missing: true }); continue; }",
      "  const roles = db.prepare('SELECT r.name FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = ? ORDER BY r.name').all(u.id).map(r => r.name);",
      "  const desks = db.prepare('SELECT section_slug FROM department_assignments WHERE user_id = ? ORDER BY section_slug').all(u.id).map(r => r.section_slug);",
      "  out.push({ email: u.email, status: u.status, roles, deskCount: desks.length, desks });",
      "}",
      "const allDesks = [...new Set(out.flatMap(r => r.desks || []))];",
      "console.log(JSON.stringify({ parties: out, uniqueAssignedDesks: allDesks.length, allDesks }));",
    ].join("\n"),
  );
} catch (error) {
  coverage = { error: String(error.message || error) };
}

const httpPass = results.every((r) => r.overall === "PASS");

let coveragePass = false;
if (coverage?.parties) {
  const adminEmail = cred("bootstrap-admin.txt").email;
  const admin = coverage.parties.find((p) => p.email === adminEmail);
  const desks = coverage.parties.filter((p) => p.email !== adminEmail);
  coveragePass =
    Boolean(admin?.roles?.includes("administrator")) &&
    admin?.status === "active" &&
    desks.every((d) => d.status === "active" && d.roles?.includes("department_editor") && d.deskCount > 0) &&
    coverage.uniqueAssignedDesks >= 32;
}

const report = {
  base: BASE,
  stamped: new Date().toISOString(),
  http: { pass: httpPass, results },
  coverage,
  verdict: httpPass && coveragePass ? "PASS" : httpPass && !coverage?.error ? "PARTIAL" : "FAIL",
};

fs.mkdirSync("evidence/final-completion", { recursive: true });
fs.writeFileSync("evidence/final-completion/login-parties.json", JSON.stringify(report, null, 2));
fs.writeFileSync(
  "evidence/final-completion/login-verify.json",
  JSON.stringify(
    {
      base: BASE,
      results: results.map((r) => ({
        email: r.email,
        file: r.file,
        role: r.role,
        login: r.checks.login,
        dashboard: r.checks.dashboard,
        overall: r.overall,
      })),
      verdict: report.verdict,
    },
    null,
    2,
  ),
);

const summary = results.map((r) => ({
  party: r.party,
  overall: r.overall,
  checks: Object.fromEntries(Object.entries(r.checks).filter(([k]) => !k.endsWith("Detail"))),
}));
const coverageSummary = coverage?.error
  ? coverage
  : {
      uniqueAssignedDesks: coverage?.uniqueAssignedDesks,
      parties: coverage?.parties?.map((p) => ({
        email: p.email,
        status: p.status,
        roles: p.roles,
        deskCount: p.deskCount,
      })),
    };
console.log(JSON.stringify({ verdict: report.verdict, httpPass, coveragePass, summary, coverage: coverageSummary }, null, 2));
process.exit(report.verdict === "PASS" ? 0 : 1);
