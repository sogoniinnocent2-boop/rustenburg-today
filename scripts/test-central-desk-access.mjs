/**
 * Production HTTP verification: 3 central accounts × 32 desks = 96 access checks.
 * Credentials from DATA_DIR department-*.txt only; never logged.
 */
import fs from "node:fs";
import path from "node:path";
import https from "node:https";
import http from "node:http";
import { URL } from "node:url";

const BASE = (process.argv[2] || "https://www.rustenburgtoday.co.za").replace(/\/$/, "");
const DATA_DIR = process.env.DATA_DIR || path.resolve("data");
const OUT = path.resolve("evidence/dept-central/prod-96-access.json");

const MANAGEABLE = [
  "news","community","podcasts","tv","radio","music","talent","marketplace","jobs","learn",
  "events","business","advertising","property","food","sports","youth","support","transport",
  "tourism","health","voice","deals","competitions","history","services","agriculture","faith",
  "family","technology","notices","creators",
];

const ACCOUNTS = [
  { email: "thabo.soke@rustenburgtoday.co.za", filePrefix: "department-news" },
  { email: "innocent.sogoni@rustenburgtoday.co.za", filePrefix: "department-events" },
  { email: "thato.selokwane@rustenburgtoday.co.za", filePrefix: "department-business" },
];

function loadPassword(email, filePrefix) {
  const files = fs.readdirSync(DATA_DIR).filter((n) => n.startsWith(filePrefix) || n.includes(email.split("@")[0].replace(/\./g, "-")));
  for (const name of files) {
    const text = fs.readFileSync(path.join(DATA_DIR, name), "utf8");
    const mail = (text.match(/^email=(.+)$/m) || [])[1]?.trim();
    const password = (text.match(/^password=(.+)$/m) || [])[1]?.trim();
    if (mail?.toLowerCase() === email.toLowerCase() && password) return password;
  }
  // fallback: any department file matching email
  for (const name of fs.readdirSync(DATA_DIR).filter((n) => n.startsWith("department-"))) {
    const text = fs.readFileSync(path.join(DATA_DIR, name), "utf8");
    const mail = (text.match(/^email=(.+)$/m) || [])[1]?.trim();
    const password = (text.match(/^password=(.+)$/m) || [])[1]?.trim();
    if (mail?.toLowerCase() === email.toLowerCase() && password) return password;
  }
  throw new Error(`No password file for ${email}`);
}

function request(method, urlString, { headers = {}, body = null } = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlString);
    const lib = url.protocol === "https:" ? https : http;
    const req = lib.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || (url.protocol === "https:" ? 443 : 80),
        path: url.pathname + url.search,
        method,
        headers,
      },
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

function mergeCookies(jar, setCookies) {
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
  const boundary = "----RTCentral" + Date.now();
  let body = "";
  for (const [name, value] of Object.entries(fields)) {
    body += `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`;
  }
  body += `--${boundary}--\r\n`;
  return { contentType: `multipart/form-data; boundary=${boundary}`, body };
}

async function login(email, password) {
  const page = await request("GET", `${BASE}/en/department`);
  const actionId = (page.body.match(/\$ACTION_ID_([a-f0-9]+)/) || page.body.match(/ACTION_ID_([a-f0-9]+)/) || [])[1];
  if (!actionId) throw new Error(`Missing action id (status ${page.status}, len ${page.body.length})`);
  const jar = [];
  mergeCookies(jar, page.setCookies);
  const { contentType, body } = multipart({
    [`$ACTION_ID_${actionId}`]: "",
    locale: "en",
    email,
    password,
    next: "/en/department",
  });
  const res = await request("POST", `${BASE}/en/department`, {
    headers: {
      "content-type": contentType,
      "content-length": Buffer.byteLength(body),
      origin: BASE,
      referer: `${BASE}/en/department`,
      cookie: jar.join("; "),
    },
    body,
  });
  mergeCookies(jar, res.setCookies);
  return {
    jar,
    ok: jar.some((c) => c.startsWith("rt_session=")) && /\/en\/department/.test(res.location),
    status: res.status,
    location: res.location,
  };
}

async function getDesk(jar, slug) {
  const res = await request("GET", `${BASE}/en/department/${slug}`, {
    headers: { cookie: jar.join("; "), accept: "text/html" },
  });
  const hasSwitcher = /Switch department desk|Department desk switcher|All content desks/i.test(res.body);
  const hasLogin = /Content desk login/i.test(res.body) && /name="password"/i.test(res.body);
  const deskWorkspace = /content desk/i.test(res.body) && !hasLogin;
  const titleOk = new RegExp(`${slug}|content desk`, "i").test(res.body);
  return {
    slug,
    status: res.status,
    hasSwitcher,
    hasLogin,
    deskWorkspace,
    titleOk,
    ok: res.status === 200 && deskWorkspace,
  };
}

async function main() {
  const accountRows = [];
  const matrix = [];

  for (const account of ACCOUNTS) {
    const password = loadPassword(account.email, account.filePrefix);
    const session = await login(account.email, password);
    if (!session.ok) {
      accountRows.push({ email: account.email, login: "FAIL", accessible: 0, details: session });
      continue;
    }
    const hub = await request("GET", `${BASE}/en/department`, {
      headers: { cookie: session.jar.join("; "), accept: "text/html" },
    });
    const hubOk = hub.status === 200 && /Your content desks/i.test(hub.body) && !/Content desk login/i.test(hub.body);
    const deskResults = [];
    for (const slug of MANAGEABLE) {
      const desk = await getDesk(session.jar, slug);
      deskResults.push(desk);
      matrix.push({ email: account.email, slug, ...desk, result: desk.ok ? "PASS" : "FAIL" });
    }
    const accessible = deskResults.filter((d) => d.ok).length;
    accountRows.push({
      email: account.email,
      login: "PASS",
      hubOk,
      departmentsAssigned: MANAGEABLE.length,
      departmentsAccessible: accessible,
      publishing: "NOT TESTED",
      permissionSecurity: accessible === MANAGEABLE.length ? "PASS" : "FAIL",
      sampleSwitcher: deskResults.find((d) => d.ok)?.hasSwitcher || false,
    });

    // save one workspace HTML evidence
    const sample = await request("GET", `${BASE}/en/department/sports`, {
      headers: { cookie: session.jar.join("; ") },
    });
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(
      path.resolve(`evidence/dept-central/workspace-${account.email.replace(/[^a-z0-9.@-]/gi, "_")}-sports.html`),
      sample.body.replace(/rt_session=[^;"\s]+/g, "rt_session=REDACTED"),
    );
  }

  // outsider / unauthenticated sports desk should not show switcher workspace
  const anon = await request("GET", `${BASE}/en/department/sports`);
  const outsiderBlocked = anon.status === 200 && /Content desk login|name="password"/i.test(anon.body);

  const report = {
    base: BASE,
    deskCount: MANAGEABLE.length,
    accountCount: ACCOUNTS.length,
    combinations: matrix.length,
    pass: matrix.filter((r) => r.result === "PASS").length,
    fail: matrix.filter((r) => r.result === "FAIL").length,
    outsiderBlocked: outsiderBlocked ? "PASS" : "FAIL",
    accounts: accountRows,
    failures: matrix.filter((r) => r.result === "FAIL"),
  };
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    combinations: report.combinations,
    pass: report.pass,
    fail: report.fail,
    outsiderBlocked: report.outsiderBlocked,
    accounts: report.accounts,
  }, null, 2));
}

main().catch((err) => {
  console.error(String(err.stack || err));
  process.exit(1);
});
