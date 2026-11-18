import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { before, test } from "node:test";
import { decideRoleRequest, deleteAccount, loadUser, registerAccount, requestPrivilegedRole, updateProfile, verifyEmail, type SessionUser } from "../src/server/auth";
import { createOrder, createProduct, moderateProduct, openDispute, refuseBrowserPayment } from "../src/server/commerce";
import { get } from "../src/server/db";
import { useTestDatabase } from "../src/server/init";
import { grantRole } from "../src/server/permissions";
import { saveUploadBytes } from "../src/server/uploads";

let resident: SessionUser;
let other: SessionUser;
let seller: SessionUser;
let admin: SessionUser;

function openAccount(prefix: string): SessionUser {
  const email = `${prefix}-${Math.random().toString(16).slice(2)}@example.com`;
  const created = registerAccount({ email, password: "password123", displayName: prefix, dateOfBirth: "1991-05-05", acceptedTerms: true, guardianConsent: false, locale: "en", ip: email });
  return verifyEmail(created.verifyToken);
}

before(() => {
  useTestDatabase(fs.mkdtempSync(path.join(os.tmpdir(), "rt-access-")));
  resident = openAccount("resident");
  other = openAccount("other");
  seller = openAccount("seller");
  admin = openAccount("staff");
  grantRole(admin.id, "administrator");
  admin = loadUser(admin.id)!;
  requestPrivilegedRole(seller, "seller");
  const request = get<{ id: string }>("SELECT id FROM role_requests WHERE user_id = ? AND role_name = 'seller' AND status = 'pending'", seller.id);
  decideRoleRequest(admin, request!.id, true);
  seller = loadUser(seller.id)!;
});

test("one person cannot edit, delete, publish, or dispute another person's records", () => {
  updateProfile(resident, { displayName: "Resident Kept", biography: "Own profile only." });
  assert.equal(get<{ display_name: string }>("SELECT display_name FROM profiles WHERE user_id = ?", other.id)?.display_name, "other");
  assert.throws(() => deleteAccount(other, "wrong-password", "DELETE"), /incorrect/);
  assert.throws(() => deleteAccount(other, "password123", "no"), /DELETE/);
  assert.equal(loadUser(other.id)?.status, "active");

  const product = createProduct(seller, { title: "Access test listing", description: "A test listing used to check permissions.", priceRands: "10.00", condition: "used", categorySlug: "electronics" });
  assert.throws(() => moderateProduct(resident, product.id, "publish"), /permission/);
  moderateProduct(admin, product.id, "publish");
  const order = createOrder(resident, product.id, 1, "collection");
  const stranger = openAccount("stranger");
  assert.throws(() => openDispute(stranger, order.id, "This order belongs to someone else."), /not your order/);
  assert.equal(get<{ order_status: string }>("SELECT order_status FROM marketplace_orders WHERE id = ?", order.id)?.order_status, "placed");
  assert.throws(() => refuseBrowserPayment(), /provider/);
  assert.throws(() => saveUploadBytes(resident, Buffer.from("not an image"), "notes.png", "image"), /not allowed/);
});
