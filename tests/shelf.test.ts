import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { before, test } from "node:test";
import { loadUser, registerAccount, verifyEmail, type SessionUser } from "../src/server/auth";
import { createPost, embedVideo, listByTag, listPosts, toggleFollow, voteInPoll } from "../src/server/community";
import { get } from "../src/server/db";
import { useTestDatabase } from "../src/server/init";
import { listBooks, publishBook, readBook, scheduleNotice } from "../src/server/shelf";

function account(prefix: string): SessionUser {
  const email = `${prefix}-${Math.random().toString(16).slice(2)}@example.com`;
  const created = registerAccount({ email, password: "password123", displayName: prefix, dateOfBirth: "1990-01-01", acceptedTerms: true, guardianConsent: false, locale: "en", ip: email });
  verifyEmail(created.verifyToken);
  const user = loadUser(created.userId);
  if (!user) throw new Error("missing user");
  return user;
}

let author: SessionUser;
let reader: SessionUser;

before(() => {
  useTestDatabase(fs.mkdtempSync(path.join(os.tmpdir(), "rt-shelf-")));
  author = account("author");
  reader = account("reader");
});

test("a question, a hashtag and a following feed stay public", () => {
  const post = createPost(author, { body: "Which library stays open late? #study", postType: "question" });
  assert.equal(post.status, "published");
  assert.equal(listByTag("study").length, 1);
  assert.equal(listPosts(reader.id, 1, "following").items.length, 0);
  toggleFollow(reader, author.username);
  assert.equal(listPosts(reader.id, 1, "following").items.length, 1);
  assert.equal(embedVideo("https://example.com/watch"), null);
});

test("a poll records one vote", () => {
  const poll = createPost(author, { body: "Morning or evening class?", postType: "poll", pollOptions: ["Morning", "Evening"] });
  const option = get<{ id: string }>("SELECT o.id as id FROM poll_options o JOIN community_polls p ON p.id = o.poll_id WHERE p.post_id = ?", poll.id);
  if (!option) throw new Error("missing option");
  voteInPoll(reader, option.id);
  assert.throws(() => voteInPoll(reader, option.id), /already voted/);
});

test("a free book can be read and a priced book stays a sample", () => {
  const free = publishBook(author, { title: "Town notes", description: "A short public notebook.", language: "en", sample: "The first page is the sample readers can see.", body: "The first page is the sample readers can see. The rest is the full public text.", priceCents: 0, rights: true });
  assert.equal(free.status, "published");
  assert.equal(readBook(free.slug, reader.id)?.readable, true);
  const priced = publishBook(author, { title: "Workshop manual", description: "A priced sample until payment exists.", language: "en", sample: "Only this sample is public while payments are off.", body: "The paid chapters stay with the author until a signed webhook.", priceCents: 4900, rights: true });
  assert.equal(priced.status, "preview");
  const hidden = readBook(priced.slug, reader.id);
  assert.equal(hidden?.readable, false);
  assert.equal(hidden?.body, "");
  assert.equal(listBooks().some((book) => book.slug === priced.slug), true);
  const notice = scheduleNotice(author, { title: "Saturday study hour", category: "study", startsAt: "2026-11-21T09:00", note: "A notice only. The camera is not connected." });
  const row = get<{ status: string }>("SELECT status FROM live_notices WHERE id = ?", notice.id);
  assert.equal(row?.status, "scheduled");
});
