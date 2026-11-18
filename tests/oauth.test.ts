import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { before, test } from "node:test";
import { NextRequest } from "next/server";
import { GET as aiGet } from "../src/app/api/v1/ai/route";
import { GET as appleStart } from "../src/app/api/auth/apple/route";
import { GET as facebookStart } from "../src/app/api/auth/facebook/route";
import { readAppleIdentity, signEs256Jwt } from "../src/server/apple";
import { get } from "../src/server/db";
import { useTestDatabase } from "../src/server/init";
import { acceptOAuthProfile } from "../src/server/oauth";
import { aiStatus } from "../src/server/ai";

before(() => {
  useTestDatabase(fs.mkdtempSync(path.join(os.tmpdir(), "rt-oauth-")));
  delete process.env.APPLE_CLIENT_ID;
  delete process.env.APPLE_TEAM_ID;
  delete process.env.APPLE_KEY_ID;
  delete process.env.APPLE_PRIVATE_KEY;
  delete process.env.FACEBOOK_APP_ID;
  delete process.env.FACEBOOK_APP_SECRET;
  delete process.env.AI_PROVIDER;
  delete process.env.AI_API_KEY;
});

test("apple and facebook sign-in stay closed until credentials exist", async () => {
  const apple = await appleStart(new NextRequest("http://127.0.0.1:3000/api/auth/apple?locale=en"));
  const facebook = await facebookStart(new NextRequest("http://127.0.0.1:3000/api/auth/facebook?locale=tn"));
  assert.equal(apple.status, 307);
  assert.match(decodeURIComponent(apple.headers.get("location") || ""), /Apple sign-in is not configured/);
  assert.equal(facebook.status, 307);
  assert.match(facebook.headers.get("location") || "", /\/tn\/auth\/sign-in/);
  assert.match(decodeURIComponent(facebook.headers.get("location") || ""), /Facebook sign-in is not configured/);
});

test("an Apple identity token is accepted only with a matching signature", () => {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  const jwk = publicKey.export({ format: "jwk" }) as JsonWebKey & { kid?: string };
  jwk.kid = "test-key";
  const token = signEs256Jwt(
    { alg: "ES256", kid: "test-key" },
    { iss: "https://appleid.apple.com", aud: "today.rustenburg.test", exp: Math.floor(Date.now() / 1000) + 300, sub: "apple-subject", email: "Ada@Example.com", email_verified: true },
    pem,
  );
  const identity = readAppleIdentity(token, [jwk], "today.rustenburg.test");
  assert.equal(identity.email, "ada@example.com");
  assert.equal(identity.emailVerified, true);
  const tampered = `${token.slice(0, -2)}${token.endsWith("a") ? "bb" : "aa"}`;
  assert.throws(() => readAppleIdentity(tampered, [jwk], "today.rustenburg.test"), /valid identity/);
});

test("apple and facebook link to the same account as the verified email", () => {
  const email = `oauth-${Math.random().toString(16).slice(2)}@example.com`;
  const apple = acceptOAuthProfile("apple", { sub: `apple-${email}`, email, emailVerified: true, name: "Ada Resident" }, "en");
  assert.equal(apple.next, "profile");
  const facebook = acceptOAuthProfile("facebook", { sub: `facebook-${email}`, email, emailVerified: true, name: "Ada Resident" }, "en");
  assert.equal(facebook.next, "profile");
  assert.equal(get<{ count: number }>("SELECT COUNT(*) as count FROM users WHERE email = ?", email)?.count, 1);
  assert.throws(() => acceptOAuthProfile("facebook", { sub: "no-mail", email: "plain@example.com", emailVerified: false, name: "No" }, "en"), /verified/);
});

test("the AI route stays unavailable", async () => {
  assert.equal(aiStatus().connected, false);
  const response = aiGet();
  assert.equal(response.status, 503);
  const body = await response.json() as { connected: boolean };
  assert.equal(body.connected, false);
});
