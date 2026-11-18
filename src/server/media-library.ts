import { all, get, newId, run } from "./db";
import { AppError } from "./errors";
import { ensureReady } from "./init";
import type { SessionUser } from "./auth";
import { assertActive } from "./auth";
import { requirePermission } from "./permissions";
import { audit } from "./store";

const LICENCES = ["commissioned", "licensed_stock", "official_reuse", "owner_upload", "partner_feed"] as const;

export type ApprovedPhoto = {
  id: string;
  url: string;
  alt: string;
  credit: string;
  width: number | null;
  height: number | null;
};

export function imageSize(bytes: Buffer): { width: number; height: number } | null {
  if (bytes.length >= 24 && bytes[0] === 0x89 && bytes.toString("ascii", 1, 4) === "PNG") {
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }
  if (bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 8 < bytes.length) {
      if (bytes[offset] !== 0xff) break;
      const marker = bytes[offset + 1];
      const size = bytes.readUInt16BE(offset + 2);
      if (marker === 0xc0 || marker === 0xc2) return { width: bytes.readUInt16BE(offset + 7), height: bytes.readUInt16BE(offset + 5) };
      if (size < 2) break;
      offset += 2 + size;
    }
  }
  return null;
}

export function registerAsset(user: SessionUser, input: { uploadId: string; bytes: Buffer; ownerName: string; licenceBasis: string; credit: string; altText: string; sourceUrl?: string; acquiredOn: string; expiresOn?: string }): string {
  ensureReady();
  assertActive(user);
  requirePermission(user.id, "media.review");
  const owner = input.ownerName.trim();
  const credit = input.credit.trim();
  const alt = input.altText.trim();
  if (owner.length < 2 || credit.length < 2 || alt.length < 2) throw new AppError(400, "Record the owner, the credit line and a description of the photograph");
  if (!LICENCES.includes(input.licenceBasis as (typeof LICENCES)[number])) throw new AppError(400, "Record the permission basis");
  const upload = get<{ id: string; mime_type: string; bucket: string }>("SELECT id, mime_type, bucket FROM uploads WHERE id = ?", input.uploadId);
  if (!upload || upload.bucket !== "image") throw new AppError(400, "Choose an image upload");
  const size = imageSize(input.bytes);
  const id = newId();
  const stamp = new Date().toISOString();
  run("UPDATE uploads SET public = 0 WHERE id = ?", input.uploadId);
  run(
    `INSERT INTO media_assets (id, upload_id, owner_name, licence_basis, credit, alt_text, source_url, acquired_on, expires_on, width, height, status, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
    id,
    input.uploadId,
    owner.slice(0, 160),
    input.licenceBasis,
    credit.slice(0, 240),
    alt.slice(0, 240),
    input.sourceUrl?.trim().slice(0, 400) || null,
    input.acquiredOn,
    input.expiresOn || null,
    size?.width || null,
    size?.height || null,
    user.id,
    stamp,
  );
  audit(user.id, "media.register", "media_asset", id, { licence: input.licenceBasis });
  return id;
}

export function decideAsset(user: SessionUser, id: string, decision: "approve" | "reject" | "withdraw"): void {
  ensureReady();
  assertActive(user);
  requirePermission(user.id, "media.review");
  const asset = get<{ id: string; upload_id: string; status: string; owner_name: string; licence_basis: string; alt_text: string; expires_on: string | null }>("SELECT id, upload_id, status, owner_name, licence_basis, alt_text, expires_on FROM media_assets WHERE id = ?", id);
  if (!asset) throw new AppError(404, "Photograph not found");
  if (decision === "approve") {
    if (!asset.owner_name || !asset.licence_basis || !asset.alt_text) throw new AppError(400, "Approval needs an owner, a licence and a description");
    if (asset.expires_on && asset.expires_on < new Date().toISOString().slice(0, 10)) throw new AppError(400, "This permission has expired");
    run("UPDATE uploads SET public = 1 WHERE id = ?", asset.upload_id);
  } else {
    run("UPDATE uploads SET public = 0 WHERE id = ?", asset.upload_id);
    run("DELETE FROM media_placements WHERE asset_id = ?", id);
  }
  const status = decision === "approve" ? "approved" : decision === "reject" ? "rejected" : "withdrawn";
  run("UPDATE media_assets SET status = ?, reviewer_id = ?, reviewed_at = ? WHERE id = ?", status, user.id, new Date().toISOString(), id);
  audit(user.id, `media.${decision}`, "media_asset", id);
}

export function placeAsset(user: SessionUser, id: string, slot: string): void {
  ensureReady();
  assertActive(user);
  requirePermission(user.id, "media.review");
  if (slot !== "homepage_hero") throw new AppError(400, "That placement is not available");
  const asset = get<{ status: string; expires_on: string | null }>("SELECT status, expires_on FROM media_assets WHERE id = ?", id);
  if (!asset || asset.status !== "approved") throw new AppError(400, "Only an approved photograph can be placed");
  if (asset.expires_on && asset.expires_on < new Date().toISOString().slice(0, 10)) throw new AppError(400, "This permission has expired");
  run("DELETE FROM media_placements WHERE slot = ?", slot);
  run("INSERT INTO media_placements (id, asset_id, slot, created_at) VALUES (?, ?, ?, ?)", newId(), id, slot, new Date().toISOString());
  audit(user.id, "media.place", "media_asset", id, { slot });
}

export function approvedHero(): ApprovedPhoto | null {
  ensureReady();
  const today = new Date().toISOString().slice(0, 10);
  const row = get<{ id: string; upload_id: string; alt_text: string; credit: string; width: number | null; height: number | null }>(
    `SELECT a.id, a.upload_id, a.alt_text, a.credit, a.width, a.height
     FROM media_placements p
     JOIN media_assets a ON a.id = p.asset_id
     WHERE p.slot = 'homepage_hero' AND a.status = 'approved' AND (a.expires_on IS NULL OR a.expires_on >= ?)`,
    today,
  );
  if (!row) return null;
  return { id: row.id, url: `/api/v1/media/${row.upload_id}`, alt: row.alt_text, credit: row.credit, width: row.width, height: row.height };
}

export function listAssets(): Array<Record<string, unknown>> {
  ensureReady();
  return all(
    `SELECT a.id, a.owner_name, a.licence_basis, a.credit, a.alt_text, a.status, a.acquired_on, a.expires_on, a.width, a.height,
            (SELECT p.slot FROM media_placements p WHERE p.asset_id = a.id ORDER BY p.created_at DESC LIMIT 1) as placement
     FROM media_assets a ORDER BY a.created_at DESC LIMIT 40`,
  );
}
