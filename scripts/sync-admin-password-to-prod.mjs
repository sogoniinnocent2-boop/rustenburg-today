/**
 * Sync local data/bootstrap-admin.txt password hash onto production admin.
 * Never prints the password — only sends the scrypt hash to Railway.
 */
import fs from "node:fs";
import path from "node:path";
import { randomBytes, scryptSync } from "node:crypto";
import { spawnSync } from "node:child_process";

const SCRYPT = { N: 16384, r: 8, p: 1 };

function railwaySsh(remoteCmd) {
  // PowerShell treats >> / | specially unless the remote command is one quoted arg.
  const wrapped = `railway ssh -- ${JSON.stringify(remoteCmd)}`;
  const run = spawnSync(wrapped, {
    encoding: "utf8",
    shell: true,
    cwd: process.cwd(),
    env: process.env,
    maxBuffer: 10 * 1024 * 1024,
  });
  if (run.error) throw run.error;
  return run;
}

const file = path.resolve("data/bootstrap-admin.txt");
const text = fs.readFileSync(file, "utf8");
const email = (text.match(/^email=(.+)$/m) || [])[1]?.trim();
const password = (text.match(/^password=(.+)$/m) || [])[1]?.trim();
if (!email || !password) throw new Error("bootstrap-admin.txt missing email/password");

const salt = randomBytes(16).toString("hex");
const hash = scryptSync(password, salt, 64, SCRYPT).toString("hex");
const stored = `scrypt$${salt}$${hash}`;
const stamp = new Date().toISOString();

const remote = [
  'const { DatabaseSync } = require("node:sqlite");',
  'const fs = require("fs");',
  "const db = new DatabaseSync('/data/rustenburg.db');",
  `const email = ${JSON.stringify(email)};`,
  `const hash = ${JSON.stringify(stored)};`,
  `const stamp = ${JSON.stringify(stamp)};`,
  "const user = db.prepare('SELECT id, status FROM users WHERE email = ?').get(email);",
  "if (!user) throw new Error('admin user missing: ' + email);",
  "fs.mkdirSync('/data/backups', { recursive: true });",
  "fs.copyFileSync('/data/rustenburg.db', '/data/backups/rustenburg-admin-pw-' + Date.now() + '.db');",
  "db.prepare(\"UPDATE users SET password_hash = ?, status = 'active', updated_at = ? WHERE id = ?\").run(hash, stamp, user.id);",
  "db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id);",
  "console.log(JSON.stringify({ ok: true, email, userId: user.id, sessionsCleared: true }));",
].join("\n");

const outDir = path.resolve("evidence/final-completion");
fs.mkdirSync(outDir, { recursive: true });
const b64 = Buffer.from(remote, "utf8").toString("base64");
fs.writeFileSync(path.join(outDir, "sync-admin.b64"), b64);

const clear = railwaySsh("rm -f /tmp/sync-admin.b64 /tmp/sync-admin.js");
if (clear.status !== 0) {
  process.stderr.write(clear.stderr || clear.stdout || "clear failed\n");
  process.exit(clear.status || 1);
}

const chunkSize = 120;
for (let i = 0; i < b64.length; i += chunkSize) {
  const chunk = b64.slice(i, i + chunkSize);
  const append = railwaySsh(`printf '%s' '${chunk}' >> /tmp/sync-admin.b64`);
  if (append.status !== 0) {
    process.stderr.write(append.stderr || append.stdout || "chunk upload failed\n");
    process.exit(append.status || 1);
  }
}

const run = railwaySsh(
  "base64 -d /tmp/sync-admin.b64 > /tmp/sync-admin.js && node /tmp/sync-admin.js && rm -f /tmp/sync-admin.js /tmp/sync-admin.b64",
);

fs.unlinkSync(path.join(outDir, "sync-admin.b64"));

if (run.stdout) process.stdout.write(run.stdout);
if (run.stderr) {
  const clean = run.stderr
    .split(/\r?\n/)
    .filter((line) => !/deprecated|Using SSH|Config as Code|New Relic|Migrate:|DeprecationWarning|trace-deprecation/i.test(line))
    .join("\n")
    .trim();
  if (clean) process.stderr.write(clean + "\n");
}
if (run.status !== 0) process.exit(run.status || 1);
