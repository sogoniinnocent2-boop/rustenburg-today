import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { before, test } from "node:test";
import { decideRoleRequest, deleteAccount, loadUser, loginAccount, logoutCookie, registerAccount, requestPasswordReset, requestPrivilegedRole, resetPassword, updateProfile, userFromCookie, verifyEmail, type SessionUser } from "../src/server/auth";
import { createRecord, publishRecord } from "../src/server/city";
import { createOrder, createProduct, enquireAboutProduct, moderateProduct, refuseBrowserPayment, registerBusiness } from "../src/server/commerce";
import { commentOnPost, createPost, reactToPost, toggleFollow } from "../src/server/community";
import { get } from "../src/server/db";
import { useTestDatabase } from "../src/server/init";
import { grantRole, hasPermission } from "../src/server/permissions";
import { publishBook, readBook } from "../src/server/shelf";
import { saveUploadBytes } from "../src/server/uploads";

let person: SessionUser;
let neighbour: SessionUser;
let buyer: SessionUser;
let admin: SessionUser;
const password = "password123";

function openAccount(prefix: string): SessionUser {
  const email = `${prefix}-${Math.random().toString(16).slice(2)}@example.com`;
  const created = registerAccount({ email, password, displayName: prefix, dateOfBirth: "1991-05-05", acceptedTerms: true, guardianConsent: false, locale: "en", ip: email });
  const verified = verifyEmail(created.verifyToken);
  return verified;
}

before(() => {
  useTestDatabase(fs.mkdtempSync(path.join(os.tmpdir(), "rt-journey-")));
  person = openAccount("journey");
  neighbour = openAccount("neighbour");
  buyer = openAccount("buyer");
  admin = openAccount("staff");
  grantRole(admin.id, "administrator");
  admin = loadUser(admin.id)!;
});

test("a resident can register, recover a password, post, trade, and close the account", () => {
  const first = loginAccount(person.email, password);
  logoutCookie(first.cookie);
  assert.equal(userFromCookie(first.cookie), null);

  const reset = requestPasswordReset(person.email, "en");
  assert.ok(reset.token);
  resetPassword(reset.token!, "password456");
  assert.throws(() => loginAccount(person.email, password), /password|incorrect|sign in/i);
  const session = loginAccount(person.email, "password456");
  person = session.user;

  const photo = saveUploadBytes(person, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"), "portrait.png", "image");
  updateProfile(person, { displayName: "Journey Resident", visibility: "public", biography: "A test profile for the journey.", avatarUrl: photo.url });
  const profile = get<{ display_name: string; avatar_url: string; visibility: string }>("SELECT display_name, avatar_url, visibility FROM profiles WHERE user_id = ?", person.id);
  assert.equal(profile?.display_name, "Journey Resident");
  assert.equal(profile?.avatar_url, photo.url);
  assert.equal(profile?.visibility, "public");

  const post = createPost(person, { body: "A public test note about the Saturday market. No private reply is possible here." });
  assert.equal(post.status, "published");
  toggleFollow(neighbour, person.username);
  reactToPost(neighbour, post.id, "like");
  commentOnPost(neighbour, post.id, "Seen on the public post.");
  assert.equal(get<{ count: number }>("SELECT COUNT(*) as count FROM user_follows WHERE follower_id = ? AND followed_id = ?", neighbour.id, person.id)?.count, 1);
  toggleFollow(neighbour, person.username);
  assert.equal(get<{ count: number }>("SELECT COUNT(*) as count FROM user_follows WHERE follower_id = ? AND followed_id = ?", neighbour.id, person.id)?.count, 0);

  const sample = "This sample is long enough to publish as a free local book for the test journey.";
  const book = publishBook(person, { title: "Test market notes", description: "A free test book, not a real sale.", language: "en", sample, body: `${sample} The rest of the text stays on the server.`, priceCents: 0, rights: true });
  assert.equal(book.status, "published");
  assert.ok((readBook(book.slug, neighbour.id)?.body.length || 0) > 40);

  requestPrivilegedRole(person, "seller");
  requestPrivilegedRole(person, "service_provider");
  requestPrivilegedRole(person, "business_owner");
  for (const roleName of ["seller", "service_provider", "business_owner"]) {
    const request = get<{ id: string }>("SELECT id FROM role_requests WHERE user_id = ? AND role_name = ? AND status = 'pending'", person.id, roleName);
    decideRoleRequest(admin, request!.id, true);
  }
  person = loadUser(person.id)!;
  const business = registerBusiness(person, { name: "Journey Salon", description: "A test salon listing. It is not a real shop.", categorySlug: "salons" });
  assert.ok(business.id);
  const product = createProduct(person, { title: "Test salon cut", description: "A test service listing for a haircut. Not a real booking.", priceRands: "80.00", condition: "service", categorySlug: "salons" });
  assert.throws(() => moderateProduct(buyer, product.id, "publish"), /permission/);
  moderateProduct(admin, product.id, "publish");
  const service = createRecord(person, "service", { name: "Journey barber", service_type: "barber", description: "A test barber listing. No appointment is being sold." });
  publishRecord(admin, "service", service);
  const order = createOrder(buyer, product.id, 1, "collection", "Test order. Do not charge a card.");
  assert.equal(order.paymentStatus, "unpaid");
  assert.equal(get<{ payment_status: string }>("SELECT payment_status FROM marketplace_orders WHERE id = ?", order.id)?.payment_status, "unpaid");
  assert.throws(() => refuseBrowserPayment(), /provider/);
  const enquiry = enquireAboutProduct(buyer, product.id, "Is this test listing still available?");
  assert.ok(enquiry);

  assert.equal(hasPermission(buyer.id, "users.manage"), false);
  assert.equal(hasPermission(admin.id, "users.manage"), true);
  assert.throws(() => deleteAccount(person, "password456", "delete"), /DELETE/);
  deleteAccount(person, "password456", "DELETE");
  assert.equal(userFromCookie(session.cookie), null);
  assert.equal(loadUser(person.id), null);
  assert.equal(get<{ status: string }>("SELECT status FROM users WHERE id = ?", person.id)?.status, "deleted");
  assert.equal(get<{ display_name: string }>("SELECT display_name FROM profiles WHERE user_id = ?", person.id)?.display_name, "Deleted user");
  assert.equal(get<{ payment_status: string }>("SELECT payment_status FROM marketplace_orders WHERE id = ?", order.id)?.payment_status, "unpaid");
});
