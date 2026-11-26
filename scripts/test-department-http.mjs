/**
 * HTTP login tests against a live base URL.
 * Credentials from DATA_DIR secret files; never logged.
 */
import fs from "node:fs";
import path from "node:path";
import https from "node:https";
import http from "node:http";
import { URL } from "node:url";

const BASE = (process.argv[2] || "https://www.rustenburgtoday.co.za").replace(/\/$/, "");
const DATA_DIR = process.env.DATA_DIR || path.resolve("data");
const OUT = path.resolve("evidence/department-access/http-login-results.json");

function parseSecretFile(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  return {
    email: (text.match(/^email=(.+)$/m) || [])[1]?.trim(),
    password: (text.match(/^password=(.+)$/m) || [])[1]?.trim(),
    file: path.basename(filePath),
  };
}

function loadCreds() {
  return fs
    .readdirSync(DATA_DIR)
    .filter((n) => n.startsWith("department-") || n === "bootstrap-admin.txt")
    .map((n) => parseSecretFile(path.join(DATA_DIR, n)))
    .filter((c) => c.email && c.password);
}

function request(method, urlString, { headers = {}, body = null, maxRedirects = 0 } = {}) {
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
          const rawHeaders = res.rawHeaders || [];
          const setCookies = [];
          for (let i = 0; i < rawHeaders.length; i += 2) {
            if (String(rawHeaders[i]).toLowerCase() === "set-cookie") setCookies.push(rawHeaders[i + 1]);
          }
          resolve({
            status: res.statusCode || 0,
            headers: res.headers,
            setCookies,
            location: res.headers.location || "",
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
    if (!pair || !pair.includes("=")) continue;
    const name = pair.split("=")[0];
    const idx = jar.findIndex((x) => x.startsWith(`${name}=`));
    if (idx >= 0) jar[idx] = pair;
    else jar.push(pair);
  }
}

function multipartBody(fields) {
  const boundary = "----RTDeptBoundary" + Date.now();
  const parts = [];
  for (const [name, value] of Object.entries(fields)) {
    parts.push(
      `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="${name}"\r\n\r\n` +
        `${value}\r\n`,
    );
  }
  parts.push(`--${boundary}--\r\n`);
  return {
    contentType: `multipart/form-data; boundary=${boundary}`,
    body: parts.join(""),
  };
}

async function fetchLoginPage() {
  const res = await request("GET", `${BASE}/en/department`);
  const actionId = (res.body.match(/name="\$ACTION_ID_([a-f0-9]+)"/) || [])[1] || null;
  const jar = [];
  mergeCookies(jar, res.setCookies);
  return { status: res.status, actionId, jar, html: res.body };
}

async function postSignIn(email, password, actionId, jar) {
  const fields = {
    [`$ACTION_ID_${actionId}`]: "",
    locale: "en",
    email,
    password,
    next: "/en/department",
  };
  const { contentType, body } = multipartBody(fields);
  const res = await request("POST", `${BASE}/en/department`, {
    headers: {
      "content-type": contentType,
      "content-length": Buffer.byteLength(body),
      origin: BASE,
      referer: `${BASE}/en/department`,
      cookie: jar.join("; "),
      accept: "text/html,application/xhtml+xml",
    },
    body,
  });
  mergeCookies(jar, res.setCookies);
  return {
    status: res.status,
    location: res.location,
    hasSession: jar.some((c) => c.startsWith("rt_session=")),
    bodySnippet: res.body.slice(0, 200).replace(/\s+/g, " "),
  };
}

async function getAuthed(pathName, jar) {
  const res = await request("GET", `${BASE}${pathName}`, {
    headers: {
      cookie: jar.join("; "),
      accept: "text/html",
    },
  });
  return {
    status: res.status,
    location: res.location,
    html: res.body,
    loginForm: /Content desk login|name="password"/i.test(res.body),
    desks: /Your content desks|content desk/i.test(res.body),
    notAssigned: /not assigned to a department/i.test(res.body),
    hasDisplay: /Thabo Soke|Innocent Sogoni|Thato Selokwane|Rustenburg Today Desk/i.test(res.body),
  };
}

function ownSlugFor(email) {
  if (/thabo\.soke/i.test(email)) return "news";
  if (/innocent\.sogoni/i.test(email)) return "events";
  if (/thato\.selokwane/i.test(email)) return "business";
  if (/admin@/i.test(email)) return null;
  return null;
}

async function main() {
  const page = await fetchLoginPage();
  if (!page.actionId) throw new Error("Could not find server action id on department login page");

  const rows = [];

  // invalid password
  {
    const jar = [...page.jar];
    const bad = await postSignIn("thabo.soke@rustenburgtoday.co.za", "DefinitelyWrongPassword99!", page.actionId, jar);
    rows.push({
      kind: "guard",
      test: "invalid_password",
      status: bad.status,
      location: bad.location,
      hasSession: bad.hasSession,
      result: !bad.hasSession && /error=Email%20or%20password%20is%20incorrect|error=Email or password is incorrect/i.test(bad.location) ? "PASS" : bad.hasSession ? "FAIL" : "PARTIAL",
    });
  }

  // unknown account
  {
    const jar = [...page.jar];
    const unknown = await postSignIn("missing.dept@rustenburgtoday.co.za", "Password12345x", page.actionId, jar);
    rows.push({
      kind: "guard",
      test: "unknown_account",
      status: unknown.status,
      location: unknown.location,
      hasSession: unknown.hasSession,
      result: !unknown.hasSession && /incorrect/i.test(decodeURIComponent(unknown.location)) ? "PASS" : "PARTIAL",
    });
  }

  for (const c of loadCreds()) {
    const fresh = await fetchLoginPage();
    const jar = [...fresh.jar];
    const login = await postSignIn(c.email, c.password, fresh.actionId, jar);
    const desk = await getAuthed("/en/department", jar);
    const ownSlug = ownSlugFor(c.email);
    const own = ownSlug ? await getAuthed(`/en/department/${ownSlug}`, jar) : null;
    const foreign = /admin@/i.test(c.email) ? null : await getAuthed("/en/department/sports", jar);

    // save dashboard HTML evidence without secrets
    if (own && own.status === 200 && !own.loginForm) {
      const safeName = c.email.replace(/[^a-z0-9.@-]/gi, "_");
      fs.writeFileSync(
        path.resolve(`evidence/department-access/dashboard-${safeName}.html`),
        own.html.replace(/rt_session=[^;"\s]+/g, "rt_session=REDACTED"),
      );
    }

    const loginOk = login.hasSession && (login.status === 303 || login.status === 302) && /\/en\/department/.test(login.location);
    const deskOk = desk.status === 200 && !desk.loginForm && (desk.desks || desk.hasDisplay);
    const ownOk = ownSlug ? Boolean(own && own.status === 200 && !own.loginForm && /content desk/i.test(own.html)) : deskOk;
    const foreignBlocked = foreign ? foreign.status === 404 || foreign.loginForm || !/Sports content desk/i.test(foreign.html) : true;

    rows.push({
      kind: "account",
      email: c.email,
      loginStatus: login.status,
      loginLocation: login.location,
      hasSession: login.hasSession,
      deskStatus: desk.status,
      deskShowsLogin: desk.loginForm,
      deskShowsDesks: desk.desks,
      hasDisplay: desk.hasDisplay,
      ownDesk: ownSlug,
      ownStatus: own?.status ?? null,
      ownOk,
      foreignSportsStatus: foreign?.status ?? null,
      foreignBlocked,
      result: loginOk && deskOk && ownOk && foreignBlocked ? "PASS" : loginOk ? "PARTIAL" : "FAIL",
    });
  }

  const report = {
    base: BASE,
    fetchedLoginPage: page.status,
    actionIdFound: Boolean(page.actionId),
    rows,
    summary: {
      pass: rows.filter((r) => r.result === "PASS").length,
      partial: rows.filter((r) => r.result === "PARTIAL").length,
      fail: rows.filter((r) => r.result === "FAIL").length,
    },
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(String(err.stack || err));
  process.exit(1);
});
