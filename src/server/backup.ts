import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { dataDir } from "./crypto";
import { getDb } from "./db";

const LOCAL_KEEP = 7;
const OFFSITE_KEEP = 30;

export type BackupSuccess = {
  ok: true;
  localDb: string;
  offsiteDb: string;
  bytes: number;
  uploads: number;
  integrity: "ok";
};

type BackupLog = {
  at: string;
  ok: boolean;
  reason: string;
  localDb: string | null;
  offsiteDb: string | null;
  bytes: number;
  uploads: number;
};

export function backupLogPath(): string {
  return path.join(dataDir(), "backup-log.jsonl");
}

export function backupAlertPath(): string {
  return path.join(dataDir(), "backup-alert.txt");
}

function record(entry: BackupLog): void {
  fs.appendFileSync(backupLogPath(), `${JSON.stringify(entry)}\n`);
  if (entry.ok) {
    if (fs.existsSync(backupAlertPath())) fs.rmSync(backupAlertPath());
    return;
  }
  fs.writeFileSync(backupAlertPath(), `Backup failed at ${entry.at}\n${entry.reason}\n`);
}

function fail(reason: string, localDb: string | null): never {
  record({ at: new Date().toISOString(), ok: false, reason, localDb, offsiteDb: null, bytes: 0, uploads: 0 });
  throw new Error(reason);
}

function integrity(file: string): boolean {
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    const row = db.prepare("PRAGMA integrity_check").get() as { integrity_check?: string } | undefined;
    return row?.integrity_check === "ok";
  } finally {
    db.close();
  }
}

function manifest(folder: string): Array<{ file: string; sha256: string }> {
  if (!fs.existsSync(folder)) return [];
  const rows: Array<{ file: string; sha256: string }> = [];
  const walk = (current: string) => {
    for (const name of fs.readdirSync(current)) {
      const full = path.join(current, name);
      if (fs.statSync(full).isDirectory()) walk(full);
      else rows.push({ file: path.relative(folder, full).replaceAll("\\", "/"), sha256: createHash("sha256").update(fs.readFileSync(full)).digest("hex") });
    }
  };
  walk(folder);
  return rows.sort((left, right) => left.file.localeCompare(right.file));
}

function prune(folder: string, keep: number): void {
  if (!fs.existsSync(folder)) return;
  const files = fs.readdirSync(folder).filter((name) => /^rustenburg-\d+\.db$/.test(name));
  const extras = files
    .map((name) => ({ name, mtime: fs.statSync(path.join(folder, name)).mtimeMs }))
    .sort((left, right) => right.mtime - left.mtime)
    .slice(keep);
  for (const extra of extras) {
    fs.rmSync(path.join(folder, extra.name), { force: true });
    fs.rmSync(path.join(folder, extra.name.replace(/\.db$/, "-uploads")), { recursive: true, force: true });
  }
}

export function createBackup(options?: { allowSameVolume?: boolean }): BackupSuccess {
  const root = dataDir();
  const uploads = path.join(root, "uploads");
  const localFolder = path.join(root, "backups");
  fs.mkdirSync(uploads, { recursive: true });
  fs.mkdirSync(localFolder, { recursive: true });
  const stamp = Date.now();
  const localDb = path.join(localFolder, `rustenburg-${stamp}.db`);
  const localUploads = path.join(localFolder, `rustenburg-${stamp}-uploads`);
  getDb().exec("PRAGMA wal_checkpoint(FULL)");
  fs.copyFileSync(path.join(root, "rustenburg.db"), localDb);
  if (!integrity(localDb)) fail("The local backup failed the SQLite integrity check.", localDb);
  fs.cpSync(uploads, localUploads, { recursive: true });
  const files = manifest(localUploads);
  fs.writeFileSync(path.join(localFolder, `rustenburg-${stamp}-manifest.json`), JSON.stringify(files));

  const offsite = process.env.BACKUP_OFFSITE_DIR?.trim();
  if (!offsite) fail("BACKUP_OFFSITE_DIR is not set. The local copy is not an off-site backup.", localDb);
  const offsiteRoot = path.resolve(offsite);
  const dataRoot = path.resolve(root);
  if (offsiteRoot === dataRoot || offsiteRoot.startsWith(`${dataRoot}${path.sep}`) || dataRoot.startsWith(`${offsiteRoot}${path.sep}`)) {
    fail("The off-site folder must be outside the application data directory.", localDb);
  }
  if (!options?.allowSameVolume && path.parse(offsiteRoot).root.toLowerCase() === path.parse(dataRoot).root.toLowerCase()) {
    fail("The off-site folder is on the same disk as the application data. Choose a different disk.", localDb);
  }
  fs.mkdirSync(offsiteRoot, { recursive: true });
  const offsiteDb = path.join(offsiteRoot, `rustenburg-${stamp}.db`);
  const offsiteUploads = path.join(offsiteRoot, `rustenburg-${stamp}-uploads`);
  try {
    fs.copyFileSync(localDb, offsiteDb);
    fs.cpSync(localUploads, offsiteUploads, { recursive: true });
    fs.copyFileSync(path.join(localFolder, `rustenburg-${stamp}-manifest.json`), path.join(offsiteRoot, `rustenburg-${stamp}-manifest.json`));
  } catch (error) {
    fail(error instanceof Error ? `The off-site copy failed: ${error.message}` : "The off-site copy failed.", localDb);
  }
  if (!integrity(offsiteDb)) fail("The off-site backup failed the SQLite integrity check.", localDb);
  const copied = manifest(offsiteUploads);
  if (JSON.stringify(copied) !== JSON.stringify(files)) fail("The off-site upload copy does not match the local files.", localDb);
  prune(localFolder, LOCAL_KEEP);
  prune(offsiteRoot, OFFSITE_KEEP);
  const bytes = fs.statSync(offsiteDb).size;
  record({ at: new Date().toISOString(), ok: true, reason: "copied", localDb, offsiteDb, bytes, uploads: files.length });
  return { ok: true, localDb, offsiteDb, bytes, uploads: files.length, integrity: "ok" };
}

export function latestBackupStatus(): { ok: boolean; reason: string; ageHours: number | null; offsiteDb: string | null; bytes: number } {
  const log = backupLogPath();
  if (!fs.existsSync(log)) return { ok: false, reason: "No backup has been recorded.", ageHours: null, offsiteDb: null, bytes: 0 };
  const lines = fs.readFileSync(log, "utf8").trim().split(/\n/).filter(Boolean);
  const latest = JSON.parse(lines[lines.length - 1]) as BackupLog;
  if (!latest.ok || !latest.offsiteDb) return { ok: false, reason: latest.reason, ageHours: null, offsiteDb: latest.offsiteDb, bytes: latest.bytes };
  if (!fs.existsSync(latest.offsiteDb)) return { ok: false, reason: "The recorded off-site backup is missing.", ageHours: null, offsiteDb: latest.offsiteDb, bytes: 0 };
  const stat = fs.statSync(latest.offsiteDb);
  const ageHours = (Date.now() - stat.mtimeMs) / 36e5;
  const live = path.resolve(dataDir(), "rustenburg.db");
  if (stat.size < 4096) return { ok: false, reason: "The off-site backup is too small.", ageHours, offsiteDb: latest.offsiteDb, bytes: stat.size };
  if (path.resolve(latest.offsiteDb) === live) return { ok: false, reason: "The off-site path is the live database.", ageHours, offsiteDb: latest.offsiteDb, bytes: stat.size };
  if (ageHours > 26) return { ok: false, reason: "The newest off-site backup is older than 26 hours.", ageHours, offsiteDb: latest.offsiteDb, bytes: stat.size };
  if (!integrity(latest.offsiteDb)) return { ok: false, reason: "The off-site backup failed the SQLite integrity check.", ageHours, offsiteDb: latest.offsiteDb, bytes: stat.size };
  return { ok: true, reason: "current", ageHours, offsiteDb: latest.offsiteDb, bytes: stat.size };
}
