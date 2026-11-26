import assert from "node:assert/strict";
import { test } from "node:test";
import { safeReturn } from "../src/lib/safe-return";

test("safeReturn allows homepage subscribe return and official news", () => {
  assert.equal(safeReturn("en", "/en?subscribe=1"), "/en?subscribe=1");
  assert.equal(safeReturn("en", "/en"), "/en");
  assert.equal(safeReturn("en", "/en/news/official"), "/en/news/official");
  assert.equal(safeReturn("en", "/en/account"), "/en/account");
  assert.equal(safeReturn("en", "/en/account/notifications"), "/en/account/notifications");
  assert.equal(safeReturn("en", "https://evil.example/en"), null);
  assert.equal(safeReturn("en", "/en?evil=1"), null);
  assert.equal(safeReturn("en", "//evil"), null);
});
