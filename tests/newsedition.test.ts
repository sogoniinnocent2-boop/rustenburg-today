import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { before, test } from "node:test";
import { useTestDatabase } from "../src/server/init";
import { get, newId, run } from "../src/server/db";
import { createArticle, newsCategories, reviewArticle, submitArticle } from "../src/server/editorial";
import {
  cancelScheduledMainEditorial,
  clearMainEditorial,
  editorialCategoryPage,
  getMainEditorialStory,
  listBreaking,
  listEditorialSection,
  listLatest,
  listMainEditorialSlots,
  listOfficialStories,
  newsroomHomepage,
  restoreMainEditorial,
  scheduleMainEditorial,
  searchPublishedNews,
  setArticleBreaking,
} from "../src/server/newsedition";
import { listNotifications, notifyOfficialPublication, officialNewsSubscribed, subscribeOfficialNews, unsubscribeOfficialNews } from "../src/server/alerts";
import { EDITORIAL_CATEGORIES, isLocalNorthwestText } from "../src/lib/editorial-categories";
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

function publish(user: SessionUser, input: { title: string; excerpt: string; body: string; categorySlug: string; featured?: boolean }) {
  const created = createArticle(user, {
    title: input.title,
    excerpt: input.excerpt,
    body: input.body,
    categorySlug: input.categorySlug,
    language: "en",
    featured: input.featured,
  });
  submitArticle(user, created.id);
  reviewArticle(user, created.id, "publish");
  return created;
}

before(() => {
  useTestDatabase(fs.mkdtempSync(path.join(os.tmpdir(), "rt-news-")));
});

test("editorial category seeds include Master Prompt areas without removing local taxonomy", () => {
  const slugs = newsCategories().map((item) => item.slug);
  assert.ok(slugs.includes("local-news"));
  assert.ok(slugs.includes("politics"));
  assert.ok(slugs.includes("world"));
  assert.ok(slugs.includes("africa"));
  assert.ok(slugs.includes("environment"));
  assert.ok(EDITORIAL_CATEGORIES.some((item) => item.slug === "local"));
});

test("newsroom homepage uses published data and omits empty invented sections", () => {
  const user = editor();
  const created = publish(user, {
    title: "Rustenburg council opens Tlhabane clinic hours",
    excerpt: "Extended hours begin next week in Tlhabane.",
    body: "The municipal health desk confirmed extended clinic hours for Tlhabane residents. The notice is for Rustenburg Local Municipality.",
    categorySlug: "local-news",
    featured: true,
  });
  setArticleBreaking(user, created.id, true);

  const home = newsroomHomepage("en");
  assert.ok(home.breaking.some((item) => item.headline.includes("Tlhabane")));
  assert.ok(home.featured);
  assert.ok(home.sections.every((section) => section.items.length > 0));
});

test("local northwest filter rejects unrelated national labels as Rustenburg news", () => {
  assert.equal(isLocalNorthwestText("Rustenburg CBD water notice"), true);
  assert.equal(isLocalNorthwestText("Phokeng heritage walk"), true);
  assert.equal(isLocalNorthwestText("Johannesburg CBD traffic update"), false);

  const stamp = new Date().toISOString();
  const sourceId = newId();
  run(
    `INSERT INTO news_sources (id, name, kind, feed_url, homepage_url, publisher, region, category_slug, rights_note, permitted_use, auto_breaking, status, created_at)
     VALUES (?, 'Example national', 'rss', 'https://example.com/national-news-edition.xml', 'https://example.com/', 'Example Desk', 'national', 'government', 'Headline and link only for this test.', 'headline_link', 0, 'active', ?)`,
    sourceId,
    stamp,
  );
  for (const item of [
    ["Cape Town harbour schedule change", "https://example.com/cape-town-harbour", "Western Cape harbour hours."],
    ["Boitekong road repairs continue", "https://example.com/boitekong-road", "Repairs on the Boitekong connector."],
  ]) {
    const id = newId();
    run(
      `INSERT INTO news_items (id, source_id, slug, story_kind, canonical_url, url_hash, headline, summary, author_name, publisher, original_published_at, discovered_at, category_slug, region, rights_status, link_status, duplicate_of, status, breaking, sensitive, published_at, created_at, updated_at)
       VALUES (?, ?, ?, 'external_link', ?, ?, ?, ?, null, 'Example Desk', ?, ?, 'government', 'national', 'headline_only', 'unchecked', null, 'published', 0, 0, ?, ?, ?)`,
      id,
      sourceId,
      item[0].toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      item[1],
      item[1],
      item[0],
      item[2],
      stamp,
      stamp,
      stamp,
      stamp,
      stamp,
    );
  }
  const local = listEditorialSection("local", 20);
  assert.ok(local.some((item) => /boitekong/i.test(item.headline)));
  assert.ok(!local.some((item) => /cape town/i.test(item.headline)));
});

test("breaking can be cleared and unpublished articles stay out of public lists", () => {
  const user = editor();
  const draft = createArticle(user, {
    title: "Draft only politics note",
    excerpt: "Should stay unpublished.",
    body: "This draft must not appear on the public newsroom lists.",
    categorySlug: "politics",
    language: "en",
  });
  const latest = listLatest(30).items;
  assert.ok(!latest.some((item) => item.headline.includes("Draft only politics note")));
  submitArticle(user, draft.id);
  reviewArticle(user, draft.id, "publish");
  setArticleBreaking(user, draft.id, true);
  assert.ok(listBreaking().some((item) => item.headline.includes("Draft only politics note")));
  setArticleBreaking(user, draft.id, false);
  assert.ok(!listBreaking().some((item) => item.headline.includes("Draft only politics note")));
});

test("editorial category pages and search stay on published records", () => {
  const page = editorialCategoryPage("local", 1);
  assert.ok(page);
  assert.equal(page!.category.slug, "local");
  const found = searchPublishedNews("Tlhabane", {});
  assert.ok(found.total >= 1);
  assert.ok(found.items.every((item) => item.headline.length > 0));
});

test("main editorial hero accepts only original published articles", () => {
  const user = editor();
  const created = publish(user, {
    title: "Bojanala water project reaches Phokeng schools",
    excerpt: "Municipal crews completed the first phase of classroom taps.",
    body: "Rustenburg Today reporters confirmed the Phokeng school water connections with the municipal works desk.",
    categorySlug: "local-news",
  });
  const slotId = scheduleMainEditorial(user, { articleId: created.id });
  assert.ok(slotId);
  const hero = getMainEditorialStory(null);
  assert.ok(hero);
  assert.equal(hero!.original, true);
  assert.equal(hero!.external, false);
  assert.ok(hero!.headline.includes("Phokeng"));
  assert.equal(hero!.source, "Rustenburg Today");

  assert.throws(() => scheduleMainEditorial(user, { articleId: "missing-article" }), /published original/);

  clearMainEditorial(user, slotId);
  const afterClear = getMainEditorialStory(null);
  if (afterClear) {
    assert.equal(afterClear.original, true);
    assert.equal(afterClear.external, false);
  }
});

test("main editorial schedule, cancel, replace and restore persist", () => {
  const user = editor();
  const first = publish(user, {
    title: "Waterberg clinics restore weekend hours",
    excerpt: "District clinics reopen Saturday mornings after staff rotation.",
    body: "Rustenburg Today confirmed the Waterberg clinic roster with the district health desk.",
    categorySlug: "local-news",
  });
  const second = publish(user, {
    title: "Bojanala learners win science fair",
    excerpt: "Phokeng high school students placed first in the provincial fair.",
    body: "Rustenburg Today covered the Bojanala science fair finals from the exhibition hall.",
    categorySlug: "education",
  });

  const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const scheduledId = scheduleMainEditorial(user, { articleId: first.id, startsAt: future });
  assert.equal(getMainEditorialStory(null), null);
  cancelScheduledMainEditorial(user, scheduledId);
  assert.ok(listMainEditorialSlots().some((slot) => String(slot.id) === scheduledId && String(slot.status) === "cancelled"));

  const liveId = scheduleMainEditorial(user, { articleId: first.id });
  assert.equal(getMainEditorialStory(null)?.key, `article:${first.id}`);
  const replacedId = scheduleMainEditorial(user, { articleId: second.id });
  assert.equal(getMainEditorialStory(null)?.key, `article:${second.id}`);
  assert.ok(listMainEditorialSlots().some((slot) => String(slot.id) === liveId && String(slot.status) === "replaced"));

  clearMainEditorial(user, replacedId);
  assert.equal(getMainEditorialStory(null), null);
  restoreMainEditorial(user, liveId);
  assert.equal(getMainEditorialStory(null)?.key, `article:${first.id}`);
  assert.ok(get("SELECT id FROM articles WHERE id = ?", first.id));
  assert.ok(get("SELECT id FROM articles WHERE id = ?", second.id));
});

test("official stories list excludes drafts, demos and wires", () => {
  const user = editor();
  const live = publish(user, {
    title: "Official Tlhabane library hours extended",
    excerpt: "The library desk confirmed Saturday openings.",
    body: "Rustenburg Today verified the Tlhabane library schedule with the municipal facilities desk.",
    categorySlug: "local-news",
  });
  createArticle(user, {
    title: "Unpublished draft for official list",
    excerpt: "Must stay out.",
    body: "Draft body that must not appear under Latest Official Stories.",
    categorySlug: "local-news",
    language: "en",
  });
  const listed = listOfficialStories({ limit: 40 });
  assert.ok(listed.items.some((item) => item.key === `article:${live.id}`));
  assert.ok(listed.items.every((item) => item.original && !item.external && item.source === "Rustenburg Today"));
  assert.ok(!listed.items.some((item) => /Unpublished draft/i.test(item.headline)));
});

test("official news subscription notifies once per publication", () => {
  const user = editor();
  const readerId = newId();
  const stamp = new Date().toISOString();
  run(
    "INSERT INTO users (id, auth_user_id, email, password_hash, email_verified_at, status, is_minor, created_at, updated_at) VALUES (?, ?, ?, 'x', ?, 'active', 0, ?, ?)",
    readerId,
    readerId,
    `reader-${readerId.slice(0, 8)}@example.com`,
    stamp,
    stamp,
    stamp,
  );
  run(
    "INSERT INTO profiles (id, user_id, display_name, username, preferred_language, visibility, biography, created_at, updated_at) VALUES (?, ?, 'Reader', ?, 'en', 'public', '', ?, ?)",
    newId(),
    readerId,
    `reader${readerId.slice(0, 6)}`,
    stamp,
    stamp,
  );
  subscribeOfficialNews(readerId, "in_app");
  assert.equal(officialNewsSubscribed(readerId).inApp, true);

  const created = publish(user, {
    title: "Boitekong clinic vaccination day",
    excerpt: "Walk-in vaccinations open tomorrow morning.",
    body: "Rustenburg Today confirmed the Boitekong clinic vaccination roster with the health desk.",
    categorySlug: "health",
  });
  const notes = listNotifications(readerId, 50);
  assert.ok(notes.some((item) => item.title.includes("Boitekong") && String(item.target_url || "").includes(created.slug)));

  const alerts = get<{ alerts_sent: number }>("SELECT alerts_sent FROM articles WHERE id = ?", created.id);
  assert.equal(alerts?.alerts_sent, 1);

  const before = listNotifications(readerId, 50).length;
  notifyOfficialPublication({
    articleId: created.id,
    title: "Boitekong clinic vaccination day",
    body: "Walk-in vaccinations open tomorrow morning.",
    href: `/news/${created.slug}`,
  });
  assert.equal(listNotifications(readerId, 50).length, before);

  unsubscribeOfficialNews(readerId);
  assert.equal(officialNewsSubscribed(readerId).inApp, false);
});
