import fs from "node:fs";
import path from "node:path";
import { dataDir } from "./crypto";
import { closeDb, getDb } from "./db";
import { seedDatabase } from "./seed";
import { installOfficialWires } from "./citydesk";

let ready = false;

export function ensureReady(): void {
  fs.mkdirSync(path.join(dataDir(), "uploads"), { recursive: true });
  fs.mkdirSync(path.join(dataDir(), "backups"), { recursive: true });
  getDb();
  if (!ready) {
    ready = true;
    seedDatabase();
    installOfficialWires();
  }
}

export function useTestDatabase(dir: string): void {
  closeDb();
  ready = false;
  fs.rmSync(dir, { recursive: true, force: true });
  process.env.DATA_DIR = dir;
  process.env.SEED_DEMO = "false";
  ensureReady();
}
