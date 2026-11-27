import { spawnSync } from "node:child_process";

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

const js = [
  'const fs = require("fs");',
  'const path = require("path");',
  "const stamp = Date.now();",
  'const backupDir = "/data/backups";',
  "fs.mkdirSync(backupDir, { recursive: true });",
  'const dbSrc = "/data/rustenburg.db";',
  "const dbDest = path.join(backupDir, `rustenburg-safe-${stamp}.db`);",
  "fs.copyFileSync(dbSrc, dbDest);",
  'const uploads = "/data/uploads";',
  "let uploadCount = 0;",
  "if (fs.existsSync(uploads)) uploadCount = fs.readdirSync(uploads).length;",
  "const backups = fs.readdirSync(backupDir).filter((n) => n.endsWith('.db')).sort().slice(-8);",
  "console.log(JSON.stringify({ ok: true, backupPath: dbDest, dbBytes: fs.statSync(dbDest).size, uploadCount, recentBackups: backups, stamp: new Date(stamp).toISOString() }));",
].join("\n");

const b64 = Buffer.from(js, "utf8").toString("base64");
railwaySsh("rm -f /tmp/safe-backup.b64 /tmp/safe-backup.js");
for (let i = 0; i < b64.length; i += 120) {
  railwaySsh(`printf '%s' '${b64.slice(i, i + 120)}' >> /tmp/safe-backup.b64`);
}
const run = railwaySsh(
  "base64 -d /tmp/safe-backup.b64 > /tmp/safe-backup.js && node /tmp/safe-backup.js && rm -f /tmp/safe-backup.js /tmp/safe-backup.b64",
);
process.stdout.write(run.stdout || "");
const err = (run.stderr || "")
  .split(/\r?\n/)
  .filter((l) => !/deprecated|Using SSH|Config as Code|Migrate|Existing files|DeprecationWarning/i.test(l))
  .join("\n")
  .trim();
if (err) process.stderr.write(err + "\n");
process.exit(run.status || 0);
