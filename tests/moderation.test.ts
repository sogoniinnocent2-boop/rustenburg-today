import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { before, test } from "node:test";
import { decideRoleRequest, loadUser, registerAccount, requestPrivilegedRole, verifyEmail, type SessionUser } from "../src/server/auth";
import { cancelUnpaidOrder, createOrder, createProduct, getProduct, moderateProduct } from "../src/server/commerce";
import { get, run } from "../src/server/db";
import { useTestDatabase } from "../src/server/init";
import { grantRole, hasPermission } from "../src/server/permissions";
import { readUpload, saveUploadBytes } from "../src/server/uploads";

let admin: SessionUser;
let seller: SessionUser;
let other: SessionUser;
let buyer: SessionUser;
let stranger: SessionUser;

function open(name: string): SessionUser {
  const created = registerAccount({ email: `${name}@example.com`, password: "password123", displayName: name, dateOfBirth: "1991-05-05", acceptedTerms: true, guardianConsent: false, locale: "en", ip: name });
  return verifyEmail(created.verifyToken);
}

function pending(user: SessionUser, role: string): string {
  requestPrivilegedRole(user, role);
  return get<{ id: string }>("SELECT id FROM role_requests WHERE user_id = ? AND role_name = ? AND status = 'pending' ORDER BY created_at DESC", user.id, role)!.id;
}

before(() => {
  useTestDatabase(fs.mkdtempSync(path.join(os.tmpdir(), "rt-moderation-")));
  admin = open("mod-admin");
  grantRole(admin.id, "administrator");
  admin = loadUser(admin.id)!;
  seller = open("mod-seller");
  other = open("mod-other");
  buyer = open("mod-buyer");
  stranger = open("mod-stranger");
});

test("approve and decline stay separate for seller, employer and advertiser", () => {
  decideRoleRequest(admin, pending(seller, "seller"), true);
  seller = loadUser(seller.id)!;
  assert.equal(hasPermission(seller.id, "marketplace.sell"), true);
  const declinedSeller = pending(other, "seller");
  decideRoleRequest(admin, declinedSeller, false);
  assert.equal(hasPermission(other.id, "marketplace.sell"), false);
  assert.equal(get<{ status: string }>("SELECT status FROM role_requests WHERE id = ?", declinedSeller)?.status, "rejected");

  decideRoleRequest(admin, pending(seller, "employer"), true);
  assert.equal(hasPermission(seller.id, "jobs.create"), true);
  const declinedEmployer = pending(other, "employer");
  decideRoleRequest(admin, declinedEmployer, false);
  assert.equal(hasPermission(other.id, "jobs.create"), false);

  decideRoleRequest(admin, pending(seller, "advertiser"), true);
  const declinedAdvertiser = pending(other, "advertiser");
  decideRoleRequest(admin, declinedAdvertiser, false);
  assert.equal(get<{ status: string }>("SELECT status FROM role_requests WHERE id = ?", declinedAdvertiser)?.status, "rejected");
  assert.throws(() => decideRoleRequest(admin, declinedAdvertiser, true), /not found/);
});

test("a missing listing decision does not publish, and unpublish or remove leaves public discovery", () => {
  const product = createProduct(seller, { title: "Moderation chair", description: "A chair used only in the moderation test.", priceRands: "80.00", condition: "new", categorySlug: "barbers" });
  assert.throws(() => moderateProduct(admin, product.id, "later" as "publish"), /publish, unpublish, or remove/);
  assert.equal(get<{ listing_status: string }>("SELECT listing_status FROM products WHERE id = ?", product.id)?.listing_status, "pending");
  moderateProduct(admin, product.id, "publish");
  assert.ok(getProduct(product.slug));
  moderateProduct(admin, product.id, "unpublish");
  assert.equal(getProduct(product.slug), null);
  assert.equal(get<{ listing_status: string }>("SELECT listing_status FROM products WHERE id = ?", product.id)?.listing_status, "unpublished");
  assert.throws(() => createOrder(buyer, product.id, 1, "collection"), /not found/);
  assert.equal(get("SELECT entity_id FROM search_documents WHERE entity_type = 'product' AND entity_id = ?", product.slug), undefined);
  moderateProduct(admin, product.id, "publish");
  moderateProduct(admin, product.id, "remove");
  assert.equal(get<{ listing_status: string }>("SELECT listing_status FROM products WHERE id = ?", product.id)?.listing_status, "removed");
  assert.equal(get("SELECT entity_id FROM search_documents WHERE entity_type = 'product' AND entity_id = ?", product.slug), undefined);
});

test("an order stays unpaid and can be cancelled once by the buyer or the seller", () => {
  const product = createProduct(seller, { title: "Order chair", description: "A second chair used only to test an unpaid order.", priceRands: "90.00", condition: "new", categorySlug: "barbers" });
  moderateProduct(admin, product.id, "publish");
  const order = createOrder(buyer, product.id, 1, "collection");
  assert.equal(order.paymentStatus, "unpaid");
  assert.equal(get<{ seller_id: string; order_status: string; payment_status: string }>("SELECT seller_id, order_status, payment_status FROM marketplace_orders WHERE id = ?", order.id)?.seller_id, seller.id);
  assert.throws(() => cancelUnpaidOrder(stranger, order.id), /not your order/);
  assert.equal(get<{ order_status: string }>("SELECT order_status FROM marketplace_orders WHERE id = ?", order.id)?.order_status, "placed");
  cancelUnpaidOrder(buyer, order.id);
  const cancelled = get<{ order_status: string; payment_status: string }>("SELECT order_status, payment_status FROM marketplace_orders WHERE id = ?", order.id);
  assert.equal(cancelled?.order_status, "cancelled");
  assert.equal(cancelled?.payment_status, "unpaid");
  assert.throws(() => cancelUnpaidOrder(buyer, order.id), /unpaid placed/);
  assert.throws(() => cancelUnpaidOrder(seller, order.id), /unpaid placed/);

  const second = createOrder(buyer, product.id, 1, "collection");
  cancelUnpaidOrder(seller, second.id);
  assert.equal(get<{ order_status: string; payment_status: string }>("SELECT order_status, payment_status FROM marketplace_orders WHERE id = ?", second.id)?.payment_status, "unpaid");
});

test("image uploads accept known pictures and refuse the rest", () => {
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x01]);
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
  const gif = Buffer.from("GIF89aok");
  const webp = Buffer.concat([Buffer.from("RIFF"), Buffer.from([0x0c, 0x00, 0x00, 0x00]), Buffer.from("WEBP")]);
  for (const [name, bytes] of [["a.jpg", jpeg], ["a.png", png], ["a.gif", gif], ["a.webp", webp]] as const) {
    const saved = saveUploadBytes(buyer, bytes, name, "image");
    const file = readUpload(saved.id);
    assert.equal(file?.public, 1);
    assert.ok(file?.absolute.includes(`${path.sep}uploads${path.sep}`));
  }
  assert.throws(() => saveUploadBytes(buyer, Buffer.from("hello"), "notes.txt", "image"), /not allowed/);
  assert.throws(() => saveUploadBytes(buyer, Buffer.alloc(0), "empty.jpg", "image"), /not allowed|empty/);
  const huge = Buffer.alloc(5_000_001);
  huge[0] = 0xff; huge[1] = 0xd8; huge[2] = 0xff;
  assert.throws(() => saveUploadBytes(buyer, huge, "big.jpg", "image"), /too large/);
  const saved = saveUploadBytes(buyer, jpeg, "again.jpg", "image");
  run("UPDATE uploads SET public = 0 WHERE id = ?", saved.id);
  assert.equal(readUpload(saved.id)?.public, 0);
  run("UPDATE uploads SET storage_path = ? WHERE id = ?", "../rustenburg.db", saved.id);
  assert.equal(readUpload(saved.id), null);
});
