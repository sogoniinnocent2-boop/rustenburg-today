/** Verify admin/desk logins against production without printing secrets. */
import fs from "node:fs";
import path from "node:path";
import https from "node:https";
import { URL } from "node:url";

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
          resolve({ status: res.statusCode || 0, location: res.headers.location || "", setCookies, body: Buffer.concat(chunks).toString("utf8") });
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
  const boundary = "----RTLogin" + Date.now();
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

async function login(email, password, pagePath, afterPath, nextValue) {
  const page = await request("GET", `${BASE}${pagePath}`);
  const actionId = pickSignInActionId(page.body);
  if (!actionId) return { ok: false, reason: "no-action-id", status: page.status };
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
  const dash = hasSession
    ? await request("GET", `${BASE}${afterPath}`, { headers: { cookie: jar.join("; ") } })
    : null;
  return {
    ok: hasSession && (res.status === 303 || res.status === 302),
    status: res.status,
    location: res.location,
    hasSession,
    dashboardStatus: dash?.status ?? null,
    dashboardLooksAuthed: dash
      ? dash.status === 200 && !/sign-in|Content desk login/i.test(dash.body) && !/name="password"/i.test(dash.body)
      : false,
  };
}

const files = fs.readdirSync(DATA).filter((n) => n === "bootstrap-admin.txt" || n.startsWith("department-"));
const results = [];
for (const file of files) {
  const c = cred(file);
  if (!c.email || !c.password) continue;
  const isAdmin = file === "bootstrap-admin.txt";
  const pagePath = isAdmin ? "/en/auth/sign-in" : "/en/department";
  const afterPath = isAdmin ? "/en/admin" : "/en/department";
  const nextValue = isAdmin ? "/en/admin" : "/en/department";
  const result = await login(c.email, c.password, pagePath, afterPath, nextValue);
  results.push({
    email: c.email,
    file,
    role: isAdmin ? "administrator" : "department_editor",
    login: result.ok ? "PASS" : "FAIL",
    dashboard: result.dashboardLooksAuthed ? "PASS" : result.ok ? "PARTIAL" : "FAIL",
  });
}

console.log(JSON.stringify({ base: BASE, results }, null, 2));
fs.mkdirSync("evidence/final-completion", { recursive: true });
fs.writeFileSync("evidence/final-completion/login-verify.json", JSON.stringify({ base: BASE, results }, null, 2));
