import { createHmac, randomBytes, scryptSync, timingSafeEqual, createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const SCRYPT = { N: 16384, r: 8, p: 1 } as const;

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64, SCRYPT).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password: string, stored: string | null): boolean {
  if (!stored) return false;
  const [algo, salt, hash] = stored.split("$");
  if (algo !== "scrypt" || !salt || !hash) return false;
  const next = scryptSync(password, salt, 64, SCRYPT);
  const previous = Buffer.from(hash, "hex");
  if (next.length !== previous.length) return false;
  return timingSafeEqual(next, previous);
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function cloudSnapshot(name: string): string | undefined {
  const dist = process.env.NEXT_DIST_DIR || ".next";
  const candidates = [
    path.join(process.cwd(), dist, "server", name),
    path.join(process.cwd(), ".next", "server", name),
    path.join(process.cwd(), ".next-firebase", "server", name),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate));
}

export function dataDir(): string {
  if (process.env.K_SERVICE) {
    const dir = "/tmp/rt-data";
    fs.mkdirSync(dir, { recursive: true });
    const database = path.join(dir, "rustenburg.db");
    if (!fs.existsSync(database)) {
      const snapshot = cloudSnapshot("rustenburg.db");
      if (snapshot) fs.copyFileSync(snapshot, database);
    }
    const uploads = path.join(dir, "uploads");
    if (!fs.existsSync(uploads)) {
      const snapshot = cloudSnapshot("uploads-snapshot");
      if (snapshot) fs.cpSync(snapshot, uploads, { recursive: true });
      else fs.mkdirSync(uploads, { recursive: true });
    }
    fs.mkdirSync(path.join(dir, "backups"), { recursive: true });
    return dir;
  }
  const dir = process.env.DATA_DIR || path.join(process.cwd(), "data");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function sessionSecret(): string {
  if (process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 16) {
    return process.env.SESSION_SECRET;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET must be set in production");
  }
  const file = path.join(dataDir(), "dev-secret.txt");
  if (!fs.existsSync(file)) fs.writeFileSync(file, randomToken(48), { mode: 0o600 });
  return fs.readFileSync(file, "utf8").trim();
}

export function signValue(value: string): string {
  const sig = createHmac("sha256", sessionSecret()).update(value).digest("base64url");
  return `${value}.${sig}`;
}

export function readSignedValue(signed: string | undefined | null): string | null {
  if (!signed) return null;
  const index = signed.lastIndexOf(".");
  if (index <= 0) return null;
  const value = signed.slice(0, index);
  const expected = signValue(value);
  const a = Buffer.from(expected);
  const b = Buffer.from(signed);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return value;
}

export function hmacHex(secret: string, body: string): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}
