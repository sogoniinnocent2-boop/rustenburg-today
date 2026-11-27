import fs from "node:fs";
import path from "node:path";

const BASE = "https://www.rustenburgtoday.co.za";
const file = path.resolve("data/department-news-thabo-soke.txt");
const text = fs.readFileSync(file, "utf8");
const email = (text.match(/^email=(.+)$/m) || [])[1].trim();
const password = (text.match(/^password=(.+)$/m) || [])[1].trim();

const page = await fetch(`${BASE}/en/department`);
const html = await page.text();
const id = (html.match(/name="\$ACTION_ID_([a-f0-9]+)"/) || [])[1];
console.log(JSON.stringify({ actionId: id, pageStatus: page.status }));

async function attempt(label, opts) {
  const form = new FormData();
  form.set(`$ACTION_ID_${id}`, "");
  form.set("locale", "en");
  form.set("email", email);
  form.set("password", opts.wrong ? "DefinitelyWrongPassword99!" : password);
  form.set("next", "/en/department");
  const headers = {
    origin: BASE,
    referer: `${BASE}/en/department`,
  };
  if (opts.nextAction) {
    headers["next-action"] = id;
    headers.accept = "text/x-component";
  }
  const res = await fetch(`${BASE}/en/department`, {
    method: "POST",
    headers,
    body: form,
    redirect: "manual",
  });
  const body = await res.text();
  console.log(JSON.stringify({
    label,
    status: res.status,
    location: res.headers.get("location"),
    setCookie: (res.headers.get("set-cookie") || "").slice(0, 60),
    body: body.slice(0, 400).replace(/\s+/g, " "),
  }));
}

await attempt("multipart-no-header", { wrong: false, nextAction: false });
await attempt("multipart-next-action", { wrong: false, nextAction: true });
await attempt("wrong-password", { wrong: true, nextAction: false });
