const { spawnSync } = require("node:child_process");

process.env.NODE_ENV = "production";
const result = spawnSync("npx", ["next", "build"], {
  stdio: "inherit",
  env: process.env,
  shell: process.platform === "win32",
});
process.exit(result.status ?? 1);
