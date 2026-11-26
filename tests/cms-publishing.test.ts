import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { before, test } from "node:test";
import { useTestDatabase } from "../src/server/init";
import { get, run } from "../src/server/db";
import {
  archiveArticle,
  createArticle,
  departmentForCategory,
  getArticle,
  listArticles,
  listDepartmentStories,
  listManagedArticles,
  publishDueArticles,
  restoreArticle,
  reviewArticle,
  submitArticle,
  unpublishArticle,
  updateArticle,
} from "../src/server/editorial";
import { searchPlatform } from "../src/server/search";
import { grantRole } from "../src/server/permissions";
import { loadUser, registerAccount, verifyEmail, type SessionUser } from "../src/server/auth";

function person(prefix: string, roles: string[] = []): SessionUser {
  const email = `${prefix}-${Math.random().toString(16).slice(2)}@example.com`;
  const created = registerAccount({
    email,
    password: "password123",
    displayName: prefix,
    dateOfBirth: "1990-01-01",
    acceptedTerms: true,
    guardianConsent: false,
    locale: "en",
    ip: email,
  });
  verifyEmail(created.verifyToken);
  for (const role of roles) grantRole(created.userId, role);
  const user = loadUser(created.userId);
  assert.ok(user);
  return user!;
}

before(() => {
  useTestDatabase(fs.mkdtempSync(path.join(os.tmpdir(), "rt-cms-")));
});

test("category destinations route sports and education to the right departments", () => {
  assert.equal(departmentForCategory("sports"), "sports");
  assert.equal(departmentForCategory("education"), "learn");
  assert.equal(departmentForCategory("business-mining"), "business");
  assert.equal(departmentForCategory("local-news", "news"), "news");
});

test("complete CMS journey: draft, review, publish, department listing, update, unpublish, schedule, archive, restore", () => {
  const journalist = person("cms-writer", ["journalist"]);
  const editor = person("cms-editor", ["editor", "administrator"]);

  const draft = createArticle(journalist, {
    categorySlug: "sports",
    language: "en",
    title: "Platinum Stars win Bojanala derby",
    excerpt: "A late goal sealed the local derby for Platinum Stars at Olympia Park.",
    body: "Rustenburg Today covered the Bojanala derby from the stands. The winning goal came in stoppage time after a corner from the right wing.",
    tags: "football, derby, Bojanala",
    departmentSlug: "sports",
    metaTitle: "Platinum Stars derby win",
    metaDescription: "Coverage of the Bojanala derby at Olympia Park.",
  });
  assert.equal(get<{ status: string }>("SELECT status FROM articles WHERE id = ?", draft.id)?.status, "draft");
  assert.equal(get<{ department_slug: string }>("SELECT department_slug FROM articles WHERE id = ?", draft.id)?.department_slug, "sports");

  submitArticle(journalist, draft.id);
  assert.equal(get<{ status: string }>("SELECT status FROM articles WHERE id = ?", draft.id)?.status, "in_review");
  assert.throws(() => reviewArticle(journalist, draft.id, "publish"), /permission|Publish|articles/);

  reviewArticle(editor, draft.id, "publish");
  const live = getArticle(draft.slug, "en");
  assert.ok(live);
  assert.match(live!.title, /Platinum Stars/);
  assert.equal(listArticles({ locale: "en", category: "sports" }).items.some((item) => item.slug === draft.slug), true);
  assert.equal(listDepartmentStories("sports", "en").some((item) => item.slug === draft.slug), true);
  assert.ok(searchPlatform("Bojanala derby", { locale: "en" }).items.some((item) => item.entityId === draft.slug || item.title.includes("Platinum Stars")));

  const managed = listManagedArticles({ status: "published", q: "Platinum" });
  assert.ok(managed.items.some((item) => item.id === draft.id));
  assert.equal(managed.items.find((item) => item.id === draft.id)?.destination, "sports");

  updateArticle(editor, draft.id, {
    title: "Platinum Stars win Bojanala derby — updated",
    excerpt: "A late goal sealed the local derby for Platinum Stars at Olympia Park.",
    body: "Rustenburg Today covered the Bojanala derby from the stands. The winning goal came in stoppage time after a corner from the right wing. Attendance was confirmed with the club.",
    language: "en",
    keepPublished: true,
  });
  assert.match(getArticle(draft.slug, "en")!.title, /updated/);

  unpublishArticle(editor, draft.id);
  assert.equal(getArticle(draft.slug, "en"), null);
  assert.equal(listDepartmentStories("sports", "en").some((item) => item.slug === draft.slug), false);

  restoreArticle(editor, draft.id);
  reviewArticle(editor, draft.id, "publish");
  assert.ok(getArticle(draft.slug, "en"));

  const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const scheduled = createArticle(editor, {
    categorySlug: "education",
    language: "en",
    title: "Phokeng science fair opens next week",
    excerpt: "Schools across Bojanala will exhibit student projects at the civic centre.",
    body: "Rustenburg Today confirmed the Phokeng science fair dates with the education desk. Entries close on Friday afternoon.",
    departmentSlug: "learn",
  });
  reviewArticle(editor, scheduled.id, "schedule", "Hold for next week", future);
  assert.equal(get<{ status: string }>("SELECT status FROM articles WHERE id = ?", scheduled.id)?.status, "scheduled");
  assert.equal(getArticle(scheduled.slug, "en"), null);
  assert.equal(publishDueArticles(), 0);

  runPast(scheduled.id);
  assert.equal(publishDueArticles(), 1);
  assert.ok(getArticle(scheduled.slug, "en"));
  assert.equal(listDepartmentStories("learn", "en").some((item) => item.slug === scheduled.slug), true);

  archiveArticle(editor, scheduled.id);
  assert.equal(getArticle(scheduled.slug, "en"), null);
  restoreArticle(editor, scheduled.id);
  assert.equal(get<{ status: string }>("SELECT status FROM articles WHERE id = ?", scheduled.id)?.status, "draft");
});

function runPast(articleId: string): void {
  const past = new Date(Date.now() - 60_000).toISOString();
  run("UPDATE articles SET scheduled_for = ? WHERE id = ?", past, articleId);
}
