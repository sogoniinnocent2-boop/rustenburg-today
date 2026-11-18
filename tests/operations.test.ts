import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { before, test } from "node:test";
import { backupAlertPath, createBackup, latestBackupStatus } from "../src/server/backup";
import { useTestDatabase } from "../src/server/init";
import { requestAi } from "../src/server/ai";
import { get } from "../src/server/db";
import { paymentProviderStatus } from "../src/server/payments";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rt-backup-"));

before(() => {
  useTestDatabase(dir);
  delete process.env.BACKUP_OFFSITE_DIR;
  delete process.env.AI_PROVIDER;
  delete process.env.AI_API_KEY;
  delete process.env.PAYMENT_PROVIDER;
});

test("a backup without a different disk is a failure", () => {
  assert.throws(() => createBackup(), /BACKUP_OFFSITE_DIR is not set/);
  assert.match(fs.readFileSync(backupAlertPath(), "utf8"), /not set/);
  const sameDisk = fs.mkdtempSync(path.join(os.tmpdir(), "rt-same-disk-"));
  process.env.BACKUP_OFFSITE_DIR = sameDisk;
  assert.throws(() => createBackup(), /same disk/);
  assert.equal(latestBackupStatus().ok, false);
});

test("a verified off-site copy is the only successful backup", () => {
  const offsite = fs.mkdtempSync(path.join(os.tmpdir(), "rt-offsite-"));
  process.env.BACKUP_OFFSITE_DIR = offsite;
  const saved = createBackup({ allowSameVolume: true });
  assert.equal(saved.ok, true);
  assert.equal(saved.integrity, "ok");
  assert.equal(fs.existsSync(saved.offsiteDb), true);
  assert.equal(fs.existsSync(backupAlertPath()), false);
  for (let index = 0; index < 8; index += 1) createBackup({ allowSameVolume: true });
  const local = fs.readdirSync(path.join(dir, "backups")).filter((name) => name.endsWith(".db"));
  const remote = fs.readdirSync(offsite).filter((name) => name.endsWith(".db"));
  assert.equal(local.length, 7);
  assert.equal(remote.length, 9);
  assert.equal(latestBackupStatus().ok, true);
});

test("the assistant stays off and does not store the request text", () => {
  const secret = "private-document-should-not-be-logged";
  assert.throws(() => requestAi("user-1", secret), /No AI provider is configured/);
  const row = get<{ metadata: string }>("SELECT metadata FROM audit_logs WHERE action = 'ai.request' ORDER BY created_at DESC LIMIT 1");
  assert.equal(row?.metadata.includes(secret), false);
  assert.match(row?.metadata || "", /unconfigured/);
  process.env.AI_PROVIDER = "test";
  process.env.AI_API_KEY = "test-key";
  assert.throws(() => requestAi("user-1", "hello"), /live model test/);
  assert.equal(paymentProviderStatus().enabled, false);
});
