import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { before, test } from "node:test";
import { loadUser, registerAccount, verifyEmail, type SessionUser } from "../src/server/auth";
import { createRecord, listJobs, listRecords, publishRecord } from "../src/server/city";
import { assignAllManageableDepartments, assignDepartment, canPublishSection, createDepartmentStaff, deskItems, deskStoryReport, deskStoryReportCsv, manageableSections, revokeDepartment } from "../src/server/departments";
import { articleReactions, listArticles, listDepartmentStories, publishDeskArticle, reactToArticle, rememberView } from "../src/server/editorial";
import { useTestDatabase } from "../src/server/init";
import { grantRole } from "../src/server/permissions";
import { createJob } from "../src/server/city";

let admin: SessionUser;
let healthDesk: SessionUser;
let outsider: SessionUser;

function account(prefix: string): SessionUser {
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
  return loadUser(created.userId)!;
}

before(() => {
  useTestDatabase(fs.mkdtempSync(path.join(os.tmpdir(), "rt-dept-")));
  admin = account("dept-admin");
  healthDesk = account("health-desk");
  outsider = account("outsider");
  grantRole(admin.id, "administrator");
  admin = loadUser(admin.id)!;
  assignDepartment(admin, { userId: healthDesk.id, section: "health" });
  healthDesk = loadUser(healthDesk.id)!;
});

test("assigned health desk publishes live on the health page", () => {
  assert.equal(canPublishSection(healthDesk, "health"), true);
  assert.equal(canPublishSection(healthDesk, "news"), false);
  const id = createRecord(healthDesk, "health", {
    name: "Tlhabane Clinic hours",
    provider_type: "clinic",
    description: "Walk-in hours for the week, published by the health desk.",
  }, { publish: true });
  const rows = listRecords("health");
  assert.ok(rows.some((row) => String(row.id) === id));
});

test("unassigned account cannot publish a health record", () => {
  grantRole(outsider.id, "department_editor");
  const outsiderLoaded = loadUser(outsider.id)!;
  assert.equal(canPublishSection(outsiderLoaded, "health"), false);
  const id = createRecord(outsiderLoaded, "health", {
    name: "Unassigned clinic",
    provider_type: "clinic",
    description: "This should stay pending without a department assignment.",
  }, { publish: true });
  assert.ok(!listRecords("health").some((row) => String(row.id) === id));
  assert.throws(() => publishRecord(outsiderLoaded, "health", id), /permission/i);
});

test("health desk cannot publish news; news desk can with picture", () => {
  assert.throws(
    () => publishDeskArticle(healthDesk, {
      categorySlug: "local-news",
      language: "en",
      title: "Health desk tries the news page",
      excerpt: "This should be refused by assignment checks.",
      body: "A fuller body that is long enough for the editorial validation rules to accept the copy.",
      imageUrl: "/uploads/test.jpg",
    }),
    /not assigned/i,
  );
  assignDepartment(admin, { userId: healthDesk.id, section: "news" });
  const newsUser = loadUser(healthDesk.id)!;
  assert.throws(
    () => publishDeskArticle(newsUser, {
      categorySlug: "local-news",
      language: "en",
      title: "City desk story without a picture",
      excerpt: "A story update needs a picture before it can go live.",
      body: "This article is refused because the department desk requires a picture with every story update.",
    }),
    /picture/i,
  );
  assert.throws(
    () => publishDeskArticle(newsUser, {
      categorySlug: "local-news",
      language: "en",
      title: "Bad video link story",
      excerpt: "A story with an invalid video address should be refused.",
      body: "This checks that only YouTube or Vimeo https links are accepted for department video updates.",
      imageUrl: "/uploads/desk-story.jpg",
      videoUrl: "https://example.com/not-allowed",
      departmentSlug: "news",
    }),
    /YouTube or Vimeo/i,
  );
  const created = publishDeskArticle(newsUser, {
    categorySlug: "local-news",
    language: "en",
    title: "City desk story beside SAnews",
    excerpt: "An original update from the local news department desk.",
    body: "This article is published from the department desk and should appear on the news page with official wires.",
    imageUrl: "/uploads/desk-story.jpg",
    videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    departmentSlug: "news",
  });
  const listed = listArticles({ locale: "en", pageSize: 20 });
  assert.ok(listed.items.some((item) => item.id === created.id && item.image === "/uploads/desk-story.jpg" && item.video?.includes("youtube-nocookie.com/embed/")));
  revokeDepartment(admin, healthDesk.id, "news");
});

test("jobs desk publish lands on the jobs list", () => {
  const staff = createDepartmentStaff(admin, {
    email: `jobs-${Math.random().toString(16).slice(2)}@example.com`,
    displayName: "Jobs Desk",
    section: "jobs",
  });
  const desk = loadUser(staff.userId)!;
  const id = createJob(desk, {
    title: "Municipal internship",
    description: "A real vacancy published by the jobs department desk for the public jobs page.",
    jobType: "internship",
  }, { publish: true });
  assert.ok(listJobs().some((job) => String(job.id) === id));
  assert.throws(
    () => publishDeskArticle(desk, {
      categorySlug: "local-news",
      language: "en",
      title: "Jobs desk news attempt",
      excerpt: "Live news publish needs a news assignment.",
      body: "Department editors hold articles.create, but live news publish needs a news assignment on the desk.",
      imageUrl: "/uploads/jobs.jpg",
      departmentSlug: "news",
    }),
    /not assigned/i,
  );

  const story = publishDeskArticle(desk, {
    categorySlug: "announcements",
    language: "en",
    title: "Jobs desk story update with picture",
    excerpt: "A headline and picture from the jobs department.",
    body: "This story update is published by the jobs desk and should appear under the jobs department page.",
    imageUrl: "/uploads/jobs-story.jpg",
    departmentSlug: "jobs",
  });
  assert.ok(listDepartmentStories("jobs", "en").some((item) => item.id === story.id && item.image === "/uploads/jobs-story.jpg"));
});

test("readers can react to department stories like on Facebook", () => {
  assignDepartment(admin, { userId: healthDesk.id, section: "news" });
  const newsUser = loadUser(healthDesk.id)!;
  const story = publishDeskArticle(newsUser, {
    categorySlug: "local-news",
    language: "en",
    title: "Reaction check on a desk story",
    excerpt: "Readers should be able to leave Facebook-style reactions on this update.",
    body: "This published department story is used to verify Like, Love and the rest of the reaction set.",
    imageUrl: "/uploads/react-story.jpg",
    departmentSlug: "news",
  });
  assert.equal(reactToArticle(outsider, story.id, "love"), "love");
  let state = articleReactions(story.id, outsider.id);
  assert.equal(state.mine, "love");
  assert.equal(state.counts.love, 1);
  assert.equal(state.total, 1);
  assert.equal(reactToArticle(outsider, story.id, "haha"), "haha");
  state = articleReactions(story.id, outsider.id);
  assert.equal(state.mine, "haha");
  assert.equal(state.counts.love, 0);
  assert.equal(state.counts.haha, 1);
  assert.equal(reactToArticle(outsider, story.id, "haha"), null);
  state = articleReactions(story.id, outsider.id);
  assert.equal(state.mine, "");
  assert.equal(state.total, 0);
  revokeDepartment(admin, healthDesk.id, "news");
});

test("one staff member can hold several departments and download a story report", () => {
  assignDepartment(admin, { userId: healthDesk.id, section: "news" });
  assignDepartment(admin, { userId: healthDesk.id, section: "events" });
  const multi = loadUser(healthDesk.id)!;
  assert.equal(canPublishSection(multi, "news"), true);
  assert.equal(canPublishSection(multi, "events"), true);
  assert.equal(canPublishSection(multi, "business"), false);

  const story = publishDeskArticle(multi, {
    categorySlug: "local-news",
    language: "en",
    title: "Desk report story with views",
    excerpt: "Department dashboards need view and reaction totals they can download.",
    body: "This story proves the desk report counts page views and Facebook-style reactions for the assigned department.",
    imageUrl: "/uploads/report-story.jpg",
    departmentSlug: "news",
  });
  rememberView(story.slug, outsider.id);
  rememberView(story.slug, outsider.id);
  reactToArticle(outsider, story.id, "love");
  reactToArticle(admin, story.id, "wow");

  const report = deskStoryReport(multi, "news");
  const row = report.find((item) => item.id === story.id);
  assert.ok(row);
  assert.equal(row!.views, 2);
  assert.equal(row!.reactions, 2);
  assert.equal(row!.counts.love, 1);
  assert.equal(row!.counts.wow, 1);

  const csv = deskStoryReportCsv(multi, "news");
  assert.match(csv, /title,slug,status,published_at,author,views,reactions_total,like,love/);
  assert.match(csv, /Desk report story with views/);
  assert.match(csv, /,2,2,/);

  assert.throws(() => deskStoryReport(outsider, "news"), /not assigned/i);
  revokeDepartment(admin, healthDesk.id, "news");
  revokeDepartment(admin, healthDesk.id, "events");
});

test("assign all manageable desks to one account without creating a new login", () => {
  const desks = manageableSections();
  assert.ok(desks.length >= 30);
  const result = assignAllManageableDepartments(admin, { userId: healthDesk.id });
  assert.equal(result.total, desks.length);
  assert.ok(result.assigned >= desks.length - 1);
  const multi = loadUser(healthDesk.id)!;
  for (const section of desks) {
    assert.equal(canPublishSection(multi, section), true, section);
  }
  assert.equal(canPublishSection(outsider, "news"), false);
  assert.doesNotThrow(() => deskItems(multi.id, "tv"));
  assert.doesNotThrow(() => deskItems(multi.id, "podcasts"));
  for (const section of desks) {
    revokeDepartment(admin, healthDesk.id, section);
  }
  const cleared = loadUser(healthDesk.id)!;
  assert.equal(canPublishSection(cleared, "news"), false);
});
