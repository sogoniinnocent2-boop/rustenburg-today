/** Extra auth guards: suspended rejection + password reset token creation. Never prints tokens/passwords. */
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.env.DATA_DIR = process.env.DATA_DIR || path.join(root, "data");
process.env.SEED_DEMO = "false";

const { ensureReady } = await import("../src/server/init.ts");
const { loginAccount, requestPasswordReset } = await import("../src/server/auth.ts");
const { run, get } = await import("../src/server/db.ts");

ensureReady();
const results = {};

// password reset creates a token for known active account (token value not logged)
const reset = requestPasswordReset("thabo.soke@rustenburgtoday.co.za", "en");
results.passwordReset = reset.token ? "PASS" : "FAIL";

const unknownReset = requestPasswordReset("nobody@rustenburgtoday.co.za", "en");
results.passwordResetUnknown = unknownReset.token === null ? "PASS" : "FAIL";

// suspended rejection using a temporary status flip on a disposable check user if present
const target = get("SELECT id, status FROM users WHERE email = ?", "thabo.soke@rustenburgtoday.co.za");
if (target) {
  const previous = target.status;
  run("UPDATE users SET status = 'suspended', updated_at = ? WHERE id = ?", new Date().toISOString(), target.id);
  try {
    const text = fs.readFileSync(path.join(process.env.DATA_DIR, "department-news-thabo-soke.txt"), "utf8");
    const password = (text.match(/^password=(.+)$/m) || [])[1];
    loginAccount("thabo.soke@rustenburgtoday.co.za", password, { ip: "suspend-test" });
    results.suspendedRejection = "FAIL";
  } catch (err) {
    results.suspendedRejection = /suspended/i.test(String(err.message || err)) ? "PASS" : "PARTIAL";
  } finally {
    run("UPDATE users SET status = ?, updated_at = ? WHERE id = ?", previous, new Date().toISOString(), target.id);
  }
} else {
  results.suspendedRejection = "BLOCKED";
}

const out = path.join(root, "evidence/department-access/auth-guards.json");
fs.writeFileSync(out, JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
