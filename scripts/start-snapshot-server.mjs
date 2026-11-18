import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const root = process.cwd();
const envFile = fs.readFileSync(path.join(root, ".env.the-elite-crew"), "utf8");
const secret = envFile.match(/^SESSION_SECRET=(.*)$/m)?.[1];
if (!secret || secret.length < 16) throw new Error("SESSION_SECRET is missing");
const dir = path.join(process.env.TEMP || process.env.TMP || "/tmp", "rt-static-data");
fs.mkdirSync(dir, { recursive: true });
fs.copyFileSync(path.join(root, "data", "rustenburg.db"), path.join(dir, "rustenburg.db"));
const log = fs.openSync(path.join(root, "firebase-static-server.log"), "w");
const child = spawn(process.execPath, [path.join(root, "node_modules", "next", "dist", "bin", "next"), "start", "-H", "127.0.0.1", "-p", "3010"], {
  cwd: root,
  detached: true,
  stdio: ["ignore", log, log],
  env: {
    ...process.env,
    SESSION_SECRET: secret,
    DATA_DIR: dir,
    NEXT_DIST_DIR: ".next-firebase",
    SEED_DEMO: "false",
    NEXT_PUBLIC_SITE_URL: "https://rustenburg-today.web.app",
  },
});
child.unref();
fs.writeFileSync(path.join(root, "firebase-static-server.pid"), String(child.pid));
console.log(`started ${child.pid}`);
