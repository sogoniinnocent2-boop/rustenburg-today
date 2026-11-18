import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { before, test } from "node:test";
import { loadUser, registerAccount, verifyEmail, type SessionUser } from "../src/server/auth";
import { createRecord } from "../src/server/city";
import { registerBusiness } from "../src/server/commerce";
import { activePlan, cancelPlan, featureDeal, listOpenQuotes, markPractice, requestOpenQuote, respondToQuote, revenueLines, setPlanPrice, subscribe } from "../src/server/commercial";
import { createDocument, solveSudoku, solveWord, dailyLetters } from "../src/server/studio";
import { pendingHistoryNotes, submitHistoryNote } from "../src/server/heritage";
import { putSetting } from "../src/server/store";
import { useTestDatabase } from "../src/server/init";
import { applyPaymentWebhook } from "../src/server/payments";
import { grantRole } from "../src/server/permissions";

function account(prefix: string, year = "1990-01-01", guardian = false): SessionUser {
  const email = `${prefix}-${Math.random().toString(16).slice(2)}@example.com`;
  const created = registerAccount({ email, password: "password123", displayName: prefix, dateOfBirth: year, acceptedTerms: true, guardianConsent: guardian, locale: "en", ip: email });
  verifyEmail(created.verifyToken);
  const user = loadUser(created.userId);
  if (!user) throw new Error("missing user");
  return user;
}

function pay(id: string, cents: number, eventId: string): void {
  const body = JSON.stringify({ event_id: eventId, type: "payment.succeeded", reference_type: "subscription", reference_id: id, amount_cents: cents, currency: "ZAR" });
  const signature = createHmac("sha256", "test-secret").update(body).digest("hex");
  assert.equal(applyPaymentWebhook(body, signature).status, "processed");
  assert.equal(applyPaymentWebhook(body, signature).status, "duplicate");
}

let owner: SessionUser;
let customer: SessionUser;
let admin: SessionUser;

before(() => {
  useTestDatabase(fs.mkdtempSync(path.join(os.tmpdir(), "rt-commerce-")));
  process.env.PAYMENT_WEBHOOK_SECRET = "test-secret";
  owner = account("owner");
  customer = account("customer");
  admin = account("desk");
  grantRole(owner.id, "business_owner");
  grantRole(admin.id, "administrator");
  owner = loadUser(owner.id)!;
  admin = loadUser(admin.id)!;
});

test("plans stay unpaid until a signed webhook, and free tools do not invent scores", () => {
  const teen = account("teen", "2012-04-02", true);
  assert.throws(() => subscribe(teen, "starter"), /under 18/);
  const free = subscribe(owner, "free");
  assert.equal(free.status, "active");
  assert.equal(free.amountCents, 0);
  assert.throws(() => listOpenQuotes(owner), /Starter/);
  assert.throws(() => subscribe(owner, "starter"), /Cancel/);
  cancelPlan(owner);
  const starter = subscribe(owner, "starter");
  assert.equal(starter.status, "preview");
  assert.equal(starter.amountCents, 4900);
  assert.equal(activePlan(owner.id)?.code, "starter");
  const quote = requestOpenQuote(customer, "plumbing", "I need a plumber for a leaking tap this week");
  const business = registerBusiness(owner, { name: "Tap Desk", description: "A test plumbing business for the suite." });
  respondToQuote(owner, quote, business.id, "Call-out is R450, parts extra.");
  assert.equal(listOpenQuotes(owner).length, 1);
  const document = createDocument(owner, { businessId: business.id, kind: "quotation", clientName: "Lebo", lines: [{ description: "Call-out", quantity: 2, unitCents: 45000 }] });
  assert.equal(document.totalCents, 90000);
  assert.throws(() => featureDeal(owner, "missing"), /Growth/);
  cancelPlan(owner);
  const growth = subscribe(owner, "growth");
  assert.equal(growth.status, "preview");
  const deal = createRecord(owner, "deal", { title: "Tap special", description: "A test offer for the suite only.", deal_type: "daily", price: "50.00" });
  featureDeal(owner, deal);
  assert.equal(revenueLines().some((line) => line.reference_type === "subscription"), false);
  putSetting("payment_mode", "enabled");
  cancelPlan(owner);
  const billed = subscribe(owner, "starter");
  assert.equal(billed.status, "unpaid");
  const wrong = JSON.stringify({ event_id: "sub-wrong", type: "payment.succeeded", reference_type: "subscription", reference_id: billed.id, amount_cents: 100, currency: "ZAR" });
  assert.throws(() => applyPaymentWebhook(wrong, createHmac("sha256", "test-secret").update(wrong).digest("hex")), /does not match/);
  pay(billed.id, 4900, "sub-starter");
  assert.throws(() => subscribe(owner, "enterprise"), /closed/);
  assert.throws(() => setPlanPrice(customer, "enterprise", 50000), /permission/);
  setPlanPrice(admin, "enterprise", 50000);
  assert.equal(markPractice(customer, "k53", [0, 0, 0, 0]).correct, 4);
  assert.equal(markPractice(customer, "k53", [-1, -1, -1, -1]).correct, 0);
  assert.equal(markPractice(customer, "trivia", [0, 0, 0, 0]).correct, 4);
  const puzzle = dailyLetters();
  assert.equal(solveWord(customer, puzzle.token, "not-the-word"), false);
  assert.equal(solveSudoku(customer, [1, 2, 3, 4, 3, 4, 1, 2, 2, 1, 4, 3, 4, 3, 2, 1]), true);
  assert.equal(revenueLines().find((line) => line.reference_type === "subscription")?.cents, 4900);
});

test("a history note stays unpublished until review", () => {
  assert.throws(() => submitHistoryNote(customer, { kind: "correction", body: "The siege date needs a source note in the margin.", source: "Family copy of a church minute", consent: false }), /Consent/);
  submitHistoryNote(customer, { kind: "correction", body: "The siege date needs a source note in the margin.", source: "Family copy of a church minute", consent: true });
  assert.equal(pendingHistoryNotes().length, 1);
});
