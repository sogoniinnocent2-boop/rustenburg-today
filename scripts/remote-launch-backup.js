/** Copy production DB + uploads inventory before launch changes. */
const fs = require("fs");
const path = require("path");

const stamp = Date.now();
const backupDir = "/data/backups";
fs.mkdirSync(backupDir, { recursive: true });
const dbSrc = "/data/rustenburg.db";
const dbDest = path.join(backupDir, `rustenburg-launch-${stamp}.db`);
fs.copyFileSync(dbSrc, dbDest);

const uploads = "/data/uploads";
let uploadCount = 0;
if (fs.existsSync(uploads)) {
  uploadCount = fs.readdirSync(uploads).length;
}

console.log(JSON.stringify({
  backupPath: dbDest,
  dbBytes: fs.statSync(dbDest).size,
  uploadCount,
  stamp: new Date(stamp).toISOString(),
}));
