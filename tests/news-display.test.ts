import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { before, test } from "node:test";
import { NEWS_PUBLISHING_DEPARTMENTS } from "../src/lib/news-display";
import { useTestDatabase } from "../src/server/init";
import { get, run } from "../src/server/db";
import {
  createArticle,
  listDepartmentStories,
  reviewArticle,
  submitArticle,
  updateArticle,
} from "../src/server/editorial";
import { getMainEditorialStory, listHeadlineStories, listOfficialStories, scheduleMainEditorial } from "../src/server/newsedition";
import { grantRole } from "../src/server/permissions";
import { loadUser, type SessionUser } from "../src/server/auth";

function editor(): SessionUser {
  const id = get<{ id: string }>("SELECT id FROM users LIMIT 1")!.id;
  grantRole(id, "administrator");
  grantRole(id, "editor");
  grantRole(id, "journalist");
  const user = loadUser(id);
  assert.ok(user);
  return user!;
}

function clearArticleRate(userId: string): void {
  run("DELETE FROM rate_limits WHERE bucket = ?", `article:${userId}`);
}

before(() => {
  useTestDatabase(fs.mkdtempSync(path.join(os.tmpdir(), "rt-display-")));
});

test("migration exposes news_display_type and editorial_priority columns", () => {
  const row = get<Record<string, unknown>>(
    "SELECT news_display_type, editorial_priority, headline_expires_at FROM articles LIMIT 1",
  );
  // Empty table is fine; the SELECT proves columns exist.
  assert.equal(row, undefined);
  assert.ok(NEWS_PUBLISHING_DEPARTMENTS.length >= 12);
});

test("every publishing department can create body and headline news", () => {
  const user = editor();
  const results: Array<{ department: string; body: boolean; headline: boolean }> = [];

  for (const desk of NEWS_PUBLISHING_DEPARTMENTS) {
    clearArticleRate(user.id);
    const body = createArticle(user, {
      title: `${desk.label} body update for Rustenburg readers`,
      excerpt: `A regular ${desk.label} report for the departmental feed.`,
      body: `Rustenburg Today ${desk.label} desk published this body news item for verification across the public department page and official stories list.`,
      categorySlug: "local-news",
      language: "en",
      departmentSlug: desk.slug,
      displayType: "body",
      priority: "standard",
    });
    submitArticle(user, body.id);
    reviewArticle(user, body.id, "publish");

    const headline = createArticle(user, {
      title: `${desk.label} headline development in Bojanala`,
      excerpt: `An important ${desk.label} development selected for Headline News.`,
      body: `Rustenburg Today ${desk.label} desk classified this story as Headline News with important priority for prominent placement tests.`,
      categorySlug: "local-news",
      language: "en",
      departmentSlug: desk.slug,
      displayType: "headline",
      priority: "important",
    });
    submitArticle(user, headline.id);
    reviewArticle(user, headline.id, "publish");

    const deptBody = listDepartmentStories(desk.slug, "en", 20, { displayType: "body" });
    const deptHeadline = listDepartmentStories(desk.slug, "en", 20, { displayType: "headline" });
    const bodyOk = deptBody.some((item) => item.slug === body.slug);
    const headlineOk = deptHeadline.some((item) => item.slug === headline.slug);
    assert.equal(bodyOk, true, `${desk.slug} body missing`);
    assert.equal(headlineOk, true, `${desk.slug} headline missing`);
    assert.ok(listHeadlineStories({ department: desk.slug }).some((item) => item.key === `article:${headline.id}`));

    // Free the limited headline slot so the next department can also be verified.
    updateArticle(user, headline.id, {
      title: `${desk.label} headline development in Bojanala`,
      excerpt: `An important ${desk.label} development selected for Headline News.`,
      body: `Rustenburg Today ${desk.label} desk classified this story as Headline News with important priority for prominent placement tests.`,
      language: "en",
      departmentSlug: desk.slug,
      displayType: "body",
      priority: "standard",
      keepPublished: true,
    });

    results.push({ department: desk.slug, body: bodyOk, headline: headlineOk });
  }

  assert.equal(results.every((item) => item.body && item.headline), true);
  assert.ok(listOfficialStories({ displayType: "body", limit: 80 }).items.length >= NEWS_PUBLISHING_DEPARTMENTS.length);
});

test("headline classification can move to body and main editorial stays independent", () => {
  const user = editor();
  clearArticleRate(user.id);
  const created = createArticle(user, {
    title: "Health desk clinic roster becomes headline then body",
    excerpt: "Classification changes must update public routing.",
    body: "Rustenburg Today health desk verified the clinic roster and will reclassify this story during the editorial test.",
    categorySlug: "health",
    language: "en",
    departmentSlug: "health",
    displayType: "headline",
    priority: "top",
  });
  submitArticle(user, created.id);
  reviewArticle(user, created.id, "publish");
  assert.ok(listHeadlineStories({ department: "health" }).some((item) => item.key === `article:${created.id}`));

  const main = scheduleMainEditorial(user, { articleId: created.id });
  assert.ok(main);
  assert.equal(getMainEditorialStory(null)?.key, `article:${created.id}`);

  updateArticle(user, created.id, {
    title: "Health desk clinic roster becomes headline then body",
    excerpt: "Classification changes must update public routing.",
    body: "Rustenburg Today health desk verified the clinic roster and will reclassify this story during the editorial test.",
    language: "en",
    departmentSlug: "health",
    displayType: "body",
    priority: "standard",
    keepPublished: true,
  });

  assert.ok(!listHeadlineStories({ department: "health" }).some((item) => item.key === `article:${created.id}`));
  assert.ok(listDepartmentStories("health", "en", 20, { displayType: "body" }).some((item) => item.id === created.id));
  // Main Editorial Story remains until cleared by the manager — not auto-cleared by body reclassification.
  assert.equal(getMainEditorialStory(null)?.key, `article:${created.id}`);
});

test("headline capacity prevents unlimited homepage flooding", () => {
  const user = editor();
  clearArticleRate(user.id);
  assert.throws(() => {
    for (let index = 0; index < 5; index += 1) {
      clearArticleRate(user.id);
      const created = createArticle(user, {
        title: `Sports capacity check ${index} for headline quota`,
        excerpt: "This story tests the per-department headline limit.",
        body: "Rustenburg Today sports desk publishes successive headlines to verify the configurable department headline quota.",
        categorySlug: "sports",
        language: "en",
        departmentSlug: "sports",
        displayType: "headline",
        priority: "important",
      });
      submitArticle(user, created.id);
      reviewArticle(user, created.id, "publish");
    }
  }, /Headline News|already has/);
});
