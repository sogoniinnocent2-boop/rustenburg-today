import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { before, test } from "node:test";
import { listSources, parseFeed, storeFeedItems } from "../src/server/citydesk";
import { useTestDatabase } from "../src/server/init";
import {
  curatedSourceCatalog,
  departmentWires,
  installCuratedSources,
  sourceDiversityReport,
  sourcesDueForPull,
} from "../src/server/multisource";
import { get, run } from "../src/server/db";

before(() => {
  useTestDatabase(fs.mkdtempSync(path.join(os.tmpdir(), "rt-multi-")));
  installCuratedSources();
});

test("curated catalog includes SAnews and independent publishers", () => {
  const catalog = curatedSourceCatalog();
  assert.ok(catalog.some((item) => item.publisher === "SAnews"));
  assert.ok(catalog.some((item) => item.publisher === "BBC News"));
  assert.ok(catalog.some((item) => item.publisher === "Al Jazeera"));
  assert.ok(catalog.some((item) => item.publisher === "World Health Organization"));
  assert.ok(catalog.filter((item) => item.departments.includes("news")).length >= 2);
});

test("installing curated sources maps multiple providers into the database", () => {
  const sources = listSources();
  assert.ok(sources.length >= 5);
  assert.ok(sources.some((row) => String(row.name) === "SAnews" && String(row.status) === "active"));
  assert.ok(sources.some((row) => String(row.name).includes("BBC")));
  const mapped = get<{ total: number }>("SELECT COUNT(*) as total FROM news_source_departments");
  assert.ok(Number(mapped?.total || 0) >= 8);
});

test("department wires stay attributed and do not invent local Rustenburg labels", () => {
  const source = get<{ id: string }>("SELECT id FROM news_sources WHERE name = 'BBC Africa'");
  assert.ok(source);
  const xml = `<?xml version="1.0"?><rss><channel>
    <item><title>Southern Africa trade talks continue this week</title><link>https://www.bbc.com/news/world-africa-example-1</link><description>Delegates meet on regional trade.</description><pubDate>Mon, 01 Jan 2024 10:00:00 GMT</pubDate></item>
  </channel></rss>`;
  const stored = storeFeedItems(source!.id, parseFeed(xml));
  assert.equal(stored.inserted, 1);
  const wires = departmentWires("news", 10);
  assert.ok(wires.some((row) => String(row.headline).includes("trade talks")));
  assert.ok(wires.every((row) => String(row.region) !== "rustenburg" || /rustenburg/i.test(String(row.headline))));
});

test("diversity report flags departments and source contribution", () => {
  const report = sourceDiversityReport();
  assert.ok(report.totals.active >= 5);
  assert.ok(report.departments.some((row) => row.section === "news" && Number(row.activeSources) >= 2));
  assert.ok(report.sources.some((row) => String(row.name) === "SAnews"));
});

test("due source selection respects ingest intervals", () => {
  const due = sourcesDueForPull(Date.now());
  assert.ok(due.length >= 1);
  const first = due[0];
  run("UPDATE news_sources SET last_checked_at = ? WHERE id = ?", new Date().toISOString(), first.id);
  const again = sourcesDueForPull(Date.now());
  assert.ok(!again.some((row) => row.id === first.id));
});
