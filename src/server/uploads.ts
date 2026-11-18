import fs from "node:fs";
import path from "node:path";
import { dataDir } from "./crypto";
import { get, newId, run } from "./db";
import { AppError } from "./errors";
import { ensureReady } from "./init";
import type { SessionUser } from "./auth";
import { assertActive } from "./auth";

const LIMITS: Record<string, number> = { image: 5_000_000, audio: 15_000_000, document: 8_000_000 };

function kindFor(bytes: Buffer): { mime: string; ext: string; bucket: "image" | "audio" | "document" } | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { mime: "image/jpeg", ext: "jpg", bucket: "image" };
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mime: "image/png", ext: "png", bucket: "image" };
  if (bytes.length >= 6 && (bytes.subarray(0, 6).toString("ascii") === "GIF87a" || bytes.subarray(0, 6).toString("ascii") === "GIF89a")) return { mime: "image/gif", ext: "gif", bucket: "image" };
  if (bytes.length >= 12 && bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP") return { mime: "image/webp", ext: "webp", bucket: "image" };
  if (bytes.length >= 12 && bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WAVE") return { mime: "audio/wav", ext: "wav", bucket: "audio" };
  if (bytes.length >= 3 && bytes.subarray(0, 3).toString("ascii") === "ID3") return { mime: "audio/mpeg", ext: "mp3", bucket: "audio" };
  if (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) return { mime: "audio/mpeg", ext: "mp3", bucket: "audio" };
  if (bytes.length >= 5 && bytes.subarray(0, 5).toString("ascii") === "%PDF-") return { mime: "application/pdf", ext: "pdf", bucket: "document" };
  return null;
}

function persist(userId: string, bytes: Buffer, filename: string, purpose: "image" | "audio" | "document"): { id: string; url: string; mime: string } {
  const detected = kindFor(bytes);
  if (!detected || detected.bucket !== purpose) throw new AppError(400, "That file type is not allowed");
  if (bytes.length <= 0 || bytes.length > LIMITS[purpose]) throw new AppError(400, "That file is empty or too large");
  const id = newId();
  const storage = path.join("uploads", detected.bucket, `${id}.${detected.ext}`);
  const absolute = path.join(dataDir(), storage);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, bytes);
  run(
    "INSERT INTO uploads (id, owner_id, bucket, storage_path, mime_type, size_bytes, original_name, public, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)",
    id,
    userId,
    detected.bucket,
    storage,
    detected.mime,
    bytes.length,
    filename.slice(0, 180),
    new Date().toISOString(),
  );
  return { id, url: `/api/v1/media/${id}`, mime: detected.mime };
}

export async function saveUploadFile(user: SessionUser, file: File, purpose: "image" | "audio" | "document"): Promise<{ id: string; url: string; mime: string }> {
  ensureReady();
  assertActive(user);
  if (!file || file.size <= 0) throw new AppError(400, "Choose a file");
  const bytes = Buffer.from(await file.arrayBuffer());
  return persist(user.id, bytes, file.name || "upload", purpose);
}

export function saveUploadBytes(user: SessionUser, bytes: Buffer, filename: string, purpose: "image" | "audio" | "document"): { id: string; url: string; mime: string } {
  ensureReady();
  assertActive(user);
  return persist(user.id, bytes, filename, purpose);
}

export function readUpload(id: string): { absolute: string; mime: string; public: number; ownerId: string } | null {
  ensureReady();
  const row = get<{ storage_path: string; mime_type: string; public: number; owner_id: string }>("SELECT storage_path, mime_type, public, owner_id FROM uploads WHERE id = ?", id);
  if (!row) return null;
  const root = path.join(dataDir(), "uploads");
  const absolute = path.resolve(dataDir(), row.storage_path);
  if (!absolute.startsWith(root)) return null;
  if (!fs.existsSync(absolute)) return null;
  return { absolute, mime: row.mime_type, public: row.public, ownerId: row.owner_id };
}
