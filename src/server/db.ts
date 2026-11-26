import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { dataDir } from "./crypto";

type SqlValue = string | number | bigint | null | Uint8Array;

function bind(params: unknown[]): SqlValue[] {
  return params.map((value) => (value === undefined ? null : value)) as SqlValue[];
}

let database: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (database) return database;
  const dir = dataDir();
  const file = path.join(dir, "rustenburg.db");
  database = new DatabaseSync(file);
  database.exec("PRAGMA foreign_keys = ON");
  database.exec("PRAGMA journal_mode = DELETE");
  database.exec("PRAGMA busy_timeout = 5000");
  const schemaFile = [
    path.join(process.cwd(), "src", "server", "schema.sql"),
    path.join(process.cwd(), process.env.NEXT_DIST_DIR || ".next", "server", "schema.sql"),
    path.join(process.cwd(), ".next", "server", "schema.sql"),
    path.join(process.cwd(), ".next-firebase", "server", "schema.sql"),
  ].find((candidate) => fs.existsSync(candidate));
  if (!schemaFile) throw new Error("Database schema file was not found");
  const schema = fs.readFileSync(schemaFile, "utf8");
  database.exec(schema);
  database
    .prepare("INSERT OR IGNORE INTO schema_migrations (id, applied_at) VALUES (?, ?)")
    .run("0001_init", new Date().toISOString());
  applyMigrations(database);
  return database;
}

function addColumn(db: DatabaseSync, table: string, column: string, definition: string): void {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!columns.some((item) => item.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

function applyMigrations(db: DatabaseSync): void {
  const applied = new Set(
    (db.prepare("SELECT id FROM schema_migrations").all() as Array<{ id: string }>).map((row) => row.id),
  );
  if (!applied.has("0002_discovery")) {
  addColumn(db, "advertising_campaigns", "campaign_kind", "TEXT NOT NULL DEFAULT 'general'");
  addColumn(db, "advertising_campaigns", "target_category", "TEXT");
  addColumn(db, "advertising_campaigns", "target_location_id", "TEXT");
  addColumn(db, "advertising_campaigns", "frequency_hours", "INTEGER NOT NULL DEFAULT 24");
  addColumn(db, "advertising_events", "viewer_key", "TEXT");
  addColumn(db, "advertising_events", "viewable", "INTEGER NOT NULL DEFAULT 0");
  addColumn(db, "advertising_events", "dedupe_key", "TEXT");
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_ad_event_dedupe ON advertising_events(dedupe_key);
    CREATE TABLE IF NOT EXISTS oauth_identities (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      subject TEXT NOT NULL,
      user_id TEXT NOT NULL REFERENCES users(id),
      email TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE (provider, subject)
    );
    CREATE TABLE IF NOT EXISTS map_reports (
      id TEXT PRIMARY KEY,
      point_id TEXT NOT NULL REFERENCES map_points(id),
      reporter_id TEXT REFERENCES users(id),
      note TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS ad_popup_log (
      id TEXT PRIMARY KEY,
      campaign_id TEXT NOT NULL REFERENCES advertising_campaigns(id),
      viewer_key TEXT NOT NULL,
      shown_at TEXT NOT NULL
    );
  `);
  const popup = db.prepare("SELECT id FROM advertising_products WHERE placement = ?").get("popup") as { id: string } | undefined;
  if (!popup) {
    db.prepare(
      "INSERT INTO advertising_products (id, name, placement, pricing_model, price_cents, currency, description, active) VALUES (?, ?, 'popup', 'flat', 180000, 'ZAR', ?, 1)",
    ).run(crypto.randomUUID(), "Eligible popup", "A dismissible promotion that is not shown on every visit.");
  }
  db.prepare("INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)").run("0002_discovery", new Date().toISOString());
  }
  applyDiscoveryFollowOn(db);
  applyCityDesk(db);
  applySafeTrack(db);
  applyMediaRights(db);
  applyCommercial(db);
  applyStudio(db);
  applyHistory(db);
  applyDesks(db);
  applyShelf(db);
  applyDepartmentDesks(db);
  applyDepartmentStories(db);
  applyArticleVideo(db);
  applyArticleReactions(db);
  applyMultiSource(db);
  applyEditorialNews(db);
  applyCommunityProfiles(db);
  applyMainEditorial(db);
  applyArticleLocation(db);
  applyNewsDisplay(db);
}

function applyArticleLocation(db: DatabaseSync): void {
  const applied = new Set((db.prepare("SELECT id FROM schema_migrations").all() as Array<{ id: string }>).map((row) => row.id));
  if (applied.has("0020_article_location")) return;
  addColumn(db, "articles", "location_id", "TEXT");
  db.exec("CREATE INDEX IF NOT EXISTS idx_articles_location ON articles(location_id, status, published_at)");
  db.prepare("INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)").run("0020_article_location", new Date().toISOString());
}

/** Headline vs body display type + editorial priority for all-department news publishing. */
function applyNewsDisplay(db: DatabaseSync): void {
  const applied = new Set((db.prepare("SELECT id FROM schema_migrations").all() as Array<{ id: string }>).map((row) => row.id));
  if (applied.has("0021_news_display")) return;
  addColumn(db, "articles", "news_display_type", "TEXT NOT NULL DEFAULT 'body'");
  addColumn(db, "articles", "editorial_priority", "TEXT NOT NULL DEFAULT 'standard'");
  addColumn(db, "articles", "headline_expires_at", "TEXT");
  db.exec(`
    UPDATE articles SET news_display_type = 'headline' WHERE is_featured = 1 AND IFNULL(news_display_type, 'body') = 'body';
    UPDATE articles SET editorial_priority = 'breaking' WHERE is_breaking = 1 AND IFNULL(editorial_priority, 'standard') = 'standard';
    CREATE INDEX IF NOT EXISTS idx_articles_display ON articles(news_display_type, status, published_at);
    CREATE INDEX IF NOT EXISTS idx_articles_priority ON articles(editorial_priority, status, published_at);
  `);
  db.prepare("INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)").run("0021_news_display", new Date().toISOString());
}

function applyCommunityProfiles(db: DatabaseSync): void {
  const applied = new Set((db.prepare("SELECT id FROM schema_migrations").all() as Array<{ id: string }>).map((row) => row.id));
  if (applied.has("0018_community_profiles")) return;
  addColumn(db, "profiles", "cover_url", "TEXT");
  addColumn(db, "profiles", "website_url", "TEXT");
  db.exec("CREATE INDEX IF NOT EXISTS idx_community_posts_location ON community_posts(location_id, status, created_at);");
  db.prepare("INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)").run("0018_community_profiles", new Date().toISOString());
}

function applyMainEditorial(db: DatabaseSync): void {
  const applied = new Set((db.prepare("SELECT id FROM schema_migrations").all() as Array<{ id: string }>).map((row) => row.id));
  if (applied.has("0019_main_editorial")) return;
  db.exec(`
    CREATE TABLE IF NOT EXISTS main_editorial_slots (
      id TEXT PRIMARY KEY,
      article_id TEXT NOT NULL REFERENCES articles(id),
      location_id TEXT REFERENCES locations(id),
      starts_at TEXT NOT NULL,
      ends_at TEXT,
      editor_id TEXT NOT NULL REFERENCES users(id),
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_main_editorial_active ON main_editorial_slots(status, starts_at, ends_at);
    CREATE INDEX IF NOT EXISTS idx_main_editorial_location ON main_editorial_slots(location_id, status);
  `);
  db.prepare("INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)").run("0019_main_editorial", new Date().toISOString());
}

function applyEditorialNews(db: DatabaseSync): void {
  const applied = new Set((db.prepare("SELECT id FROM schema_migrations").all() as Array<{ id: string }>).map((row) => row.id));
  if (applied.has("0017_editorial_news")) return;
  addColumn(db, "articles", "is_breaking", "INTEGER NOT NULL DEFAULT 0");
  db.exec("CREATE INDEX IF NOT EXISTS idx_articles_breaking ON articles(is_breaking, status);");
  db.prepare("INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)").run("0017_editorial_news", new Date().toISOString());
}

function applyMultiSource(db: DatabaseSync): void {
  const applied = new Set((db.prepare("SELECT id FROM schema_migrations").all() as Array<{ id: string }>).map((row) => row.id));
  if (applied.has("0016_multisource")) return;
  addColumn(db, "news_sources", "country", "TEXT");
  addColumn(db, "news_sources", "coverage", "TEXT");
  addColumn(db, "news_sources", "content_type", "TEXT");
  addColumn(db, "news_sources", "ingest_interval_minutes", "INTEGER NOT NULL DEFAULT 60");
  addColumn(db, "news_sources", "last_success_at", "TEXT");
  db.exec(`
    CREATE TABLE IF NOT EXISTS news_source_departments (
      source_id TEXT NOT NULL REFERENCES news_sources(id),
      section_slug TEXT NOT NULL,
      PRIMARY KEY (source_id, section_slug)
    );
    CREATE INDEX IF NOT EXISTS idx_news_source_departments_section ON news_source_departments(section_slug);
  `);
  db.prepare("INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)").run("0016_multisource", new Date().toISOString());
}

function applyDepartmentDesks(db: DatabaseSync): void {
  const applied = new Set((db.prepare("SELECT id FROM schema_migrations").all() as Array<{ id: string }>).map((row) => row.id));
  if (applied.has("0012_department_desks")) return;
  db.exec(`
    CREATE TABLE IF NOT EXISTS department_assignments (
      user_id TEXT NOT NULL REFERENCES users(id),
      section_slug TEXT NOT NULL,
      created_by TEXT NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL,
      PRIMARY KEY (user_id, section_slug)
    );
    CREATE INDEX IF NOT EXISTS idx_department_assignments_section ON department_assignments(section_slug);
  `);
  db.prepare("INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)").run("0012_department_desks", new Date().toISOString());
}

function applyDepartmentStories(db: DatabaseSync): void {
  const applied = new Set((db.prepare("SELECT id FROM schema_migrations").all() as Array<{ id: string }>).map((row) => row.id));
  if (applied.has("0013_department_stories")) return;
  addColumn(db, "articles", "department_slug", "TEXT");
  db.exec("CREATE INDEX IF NOT EXISTS idx_articles_department ON articles(department_slug, status, published_at)");
  db.prepare("INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)").run("0013_department_stories", new Date().toISOString());
}

function applyArticleVideo(db: DatabaseSync): void {
  const applied = new Set((db.prepare("SELECT id FROM schema_migrations").all() as Array<{ id: string }>).map((row) => row.id));
  if (applied.has("0014_article_video")) return;
  addColumn(db, "articles", "video_embed", "TEXT");
  db.prepare("INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)").run("0014_article_video", new Date().toISOString());
}

function applyArticleReactions(db: DatabaseSync): void {
  const applied = new Set((db.prepare("SELECT id FROM schema_migrations").all() as Array<{ id: string }>).map((row) => row.id));
  if (applied.has("0015_article_reactions")) return;
  db.exec(`
    CREATE TABLE IF NOT EXISTS article_reactions (
      id TEXT PRIMARY KEY,
      article_id TEXT NOT NULL REFERENCES articles(id),
      user_id TEXT NOT NULL REFERENCES users(id),
      reaction_type TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE (article_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_article_reactions_article ON article_reactions(article_id, reaction_type);
  `);
  db.prepare("INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)").run("0015_article_reactions", new Date().toISOString());
}

function applyShelf(db: DatabaseSync): void {
  const applied = new Set((db.prepare("SELECT id FROM schema_migrations").all() as Array<{ id: string }>).map((row) => row.id));
  if (applied.has("0011_shelf")) return;
  const columns = db.prepare("PRAGMA table_info(post_media)").all() as Array<{ name: string }>;
  if (!columns.some((column) => column.name === "alt_text")) db.exec("ALTER TABLE post_media ADD COLUMN alt_text TEXT");
  db.exec(`
    CREATE TABLE IF NOT EXISTS books (
      id TEXT PRIMARY KEY,
      author_id TEXT NOT NULL REFERENCES users(id),
      slug TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      language TEXT NOT NULL,
      price_cents INTEGER NOT NULL DEFAULT 0,
      sample TEXT NOT NULL,
      body TEXT NOT NULL,
      rights_confirmed INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS live_notices (
      id TEXT PRIMARY KEY,
      host_id TEXT NOT NULL REFERENCES users(id),
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      starts_at TEXT NOT NULL,
      note TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
  db.prepare("INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)").run("0011_shelf", new Date().toISOString());
}

function applyDiscoveryFollowOn(db: DatabaseSync): void {
  const applied = new Set((db.prepare("SELECT id FROM schema_migrations").all() as Array<{ id: string }>).map((row) => row.id));
  if (applied.has("0003_platform")) return;
  db.exec(`
    CREATE TABLE IF NOT EXISTS organisations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      owner_id TEXT NOT NULL REFERENCES users(id),
      verification_status TEXT NOT NULL DEFAULT 'unverified',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS organisation_members (
      organisation_id TEXT NOT NULL REFERENCES organisations(id),
      user_id TEXT NOT NULL REFERENCES users(id),
      member_role TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (organisation_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS community_groups (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL,
      location_id TEXT REFERENCES locations(id),
      owner_id TEXT NOT NULL REFERENCES users(id),
      visibility TEXT NOT NULL DEFAULT 'public',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS group_members (
      group_id TEXT NOT NULL REFERENCES community_groups(id),
      user_id TEXT NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL,
      PRIMARY KEY (group_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS saved_searches (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      query TEXT NOT NULL,
      location_id TEXT REFERENCES locations(id),
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS search_history (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES users(id),
      query TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS ticket_orders (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      event_id TEXT NOT NULL REFERENCES events(id),
      ticket_id TEXT NOT NULL REFERENCES event_tickets(id),
      quantity INTEGER NOT NULL,
      amount_cents INTEGER NOT NULL,
      payment_status TEXT NOT NULL DEFAULT 'unpaid',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS issued_tickets (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL REFERENCES ticket_orders(id),
      user_id TEXT NOT NULL REFERENCES users(id),
      code TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'issued',
      checked_in_at TEXT,
      checked_in_by TEXT REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS viewing_requests (
      id TEXT PRIMARY KEY,
      property_id TEXT NOT NULL REFERENCES properties(id),
      requester_id TEXT NOT NULL REFERENCES users(id),
      requested_for TEXT NOT NULL,
      note TEXT,
      status TEXT NOT NULL DEFAULT 'requested',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS accommodation_requests (
      id TEXT PRIMARY KEY,
      property_id TEXT NOT NULL REFERENCES properties(id),
      requester_id TEXT NOT NULL REFERENCES users(id),
      arrive_on TEXT NOT NULL,
      depart_on TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'requested',
      created_at TEXT NOT NULL
    );
  `);
  db.prepare("INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)").run("0003_platform", new Date().toISOString());
}

function applyCityDesk(db: DatabaseSync): void {
  const applied = new Set((db.prepare("SELECT id FROM schema_migrations").all() as Array<{ id: string }>).map((row) => row.id));
  if (applied.has("0004_citydesk")) return;
  db.exec(`
    CREATE TABLE IF NOT EXISTS news_sources (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      kind TEXT NOT NULL,
      feed_url TEXT,
      homepage_url TEXT,
      publisher TEXT NOT NULL,
      region TEXT NOT NULL,
      category_slug TEXT NOT NULL,
      rights_note TEXT NOT NULL,
      permitted_use TEXT NOT NULL,
      auto_breaking INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'paused',
      last_checked_at TEXT,
      last_error TEXT,
      last_status_code INTEGER,
      created_by TEXT REFERENCES users(id),
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS news_items (
      id TEXT PRIMARY KEY,
      source_id TEXT REFERENCES news_sources(id),
      slug TEXT NOT NULL UNIQUE,
      story_kind TEXT NOT NULL,
      canonical_url TEXT,
      url_hash TEXT UNIQUE,
      headline TEXT NOT NULL,
      summary TEXT NOT NULL,
      author_name TEXT,
      publisher TEXT NOT NULL,
      original_published_at TEXT,
      discovered_at TEXT NOT NULL,
      category_slug TEXT NOT NULL,
      region TEXT NOT NULL,
      location_label TEXT,
      rights_status TEXT NOT NULL,
      link_status TEXT NOT NULL DEFAULT 'unchecked',
      final_url TEXT,
      duplicate_of TEXT,
      status TEXT NOT NULL DEFAULT 'in_review',
      breaking INTEGER NOT NULL DEFAULT 0,
      sensitive INTEGER NOT NULL DEFAULT 0,
      sponsored INTEGER NOT NULL DEFAULT 0,
      article_id TEXT REFERENCES articles(id),
      published_at TEXT,
      withdrawn_at TEXT,
      correction_note TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS top_five_slots (
      id TEXT PRIMARY KEY,
      edition_date TEXT NOT NULL,
      position INTEGER NOT NULL,
      news_item_id TEXT REFERENCES news_items(id),
      article_id TEXT REFERENCES articles(id),
      editor_id TEXT REFERENCES users(id),
      created_at TEXT NOT NULL,
      UNIQUE (edition_date, position)
    );
    CREATE TABLE IF NOT EXISTS employer_verifications (
      id TEXT PRIMARY KEY,
      business_id TEXT REFERENCES businesses(id),
      user_id TEXT NOT NULL REFERENCES users(id),
      status TEXT NOT NULL,
      evidence_note TEXT NOT NULL,
      checked_at TEXT NOT NULL,
      checked_by TEXT NOT NULL REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS job_verifications (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL REFERENCES jobs(id),
      badge TEXT NOT NULL,
      evidence_note TEXT NOT NULL,
      destination_url TEXT,
      checked_at TEXT NOT NULL,
      checked_by TEXT NOT NULL REFERENCES users(id),
      reconfirm_by TEXT
    );
    CREATE TABLE IF NOT EXISTS job_reports (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL REFERENCES jobs(id),
      reporter_id TEXT NOT NULL REFERENCES users(id),
      reason TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS radio_licences (
      id TEXT PRIMARY KEY,
      station_id TEXT NOT NULL REFERENCES radio_stations(id),
      licence_type TEXT NOT NULL,
      holder TEXT NOT NULL,
      reference_code TEXT NOT NULL,
      territory TEXT NOT NULL,
      starts_on TEXT NOT NULL,
      ends_on TEXT NOT NULL,
      notes TEXT,
      status TEXT NOT NULL DEFAULT 'current',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS radio_messages (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      body TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS homepage_blocks (
      block_key TEXT PRIMARY KEY,
      enabled INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS ad_restrictions (
      id TEXT PRIMARY KEY,
      category TEXT NOT NULL UNIQUE,
      rule TEXT NOT NULL,
      note TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS trust_complaints (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      subject_type TEXT NOT NULL,
      subject_id TEXT,
      reporter_id TEXT REFERENCES users(id),
      body TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS business_hour_exceptions (
      id TEXT PRIMARY KEY,
      business_id TEXT NOT NULL REFERENCES businesses(id),
      on_date TEXT NOT NULL,
      closed INTEGER NOT NULL DEFAULT 1,
      opening_time TEXT,
      closing_time TEXT,
      note TEXT
    );
    CREATE TABLE IF NOT EXISTS weather_observations (
      id TEXT PRIMARY KEY,
      summary TEXT NOT NULL,
      source_name TEXT NOT NULL,
      source_url TEXT,
      observed_at TEXT NOT NULL,
      recorded_by TEXT REFERENCES users(id),
      created_at TEXT NOT NULL
    );
  `);
  const blocks = ["clock", "location", "breaking", "search", "shortcuts", "topfive", "latest", "radio", "jobs", "featured-ads", "events", "weather", "traffic", "business", "property", "marketplace", "community", "learn", "tourism", "deals", "notices", "media"];
  const insertBlock = db.prepare("INSERT OR IGNORE INTO homepage_blocks (block_key, enabled, sort_order) VALUES (?, 1, ?)");
  blocks.forEach((key, index) => insertBlock.run(key, index + 1));
  const restrict = db.prepare("INSERT OR IGNORE INTO ad_restrictions (id, category, rule, note) VALUES (?, ?, ?, ?)");
  const rules: Array<[string, string, string]> = [
    ["tobacco", "prohibited", "Tobacco advertising is not accepted."],
    ["weapons", "prohibited", "Weapons advertising is not accepted."],
    ["adult", "prohibited", "Adult sexual services are not accepted."],
    ["unlicensed-medicine", "prohibited", "Unlicensed medicine claims are not accepted."],
    ["alcohol", "restricted", "Alcohol needs an age gate and legal review before approval."],
    ["gambling", "restricted", "Gambling needs a licence record and legal review before approval."],
    ["political", "restricted", "Political advertising cannot buy editorial placement."],
    ["health", "restricted", "Health advertising cannot be presented as medical advice."],
  ];
  for (const [category, rule, note] of rules) restrict.run(crypto.randomUUID(), category, rule, note);
  db.prepare("INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)").run("0004_citydesk", new Date().toISOString());
}

function applySafeTrack(db: DatabaseSync): void {
  const applied = new Set((db.prepare("SELECT id FROM schema_migrations").all() as Array<{ id: string }>).map((row) => row.id));
  if (applied.has("0005_safetrack")) return;
  db.exec(`
    CREATE TABLE IF NOT EXISTS st_households (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_by TEXT NOT NULL REFERENCES users(id),
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS st_members (
      id TEXT PRIMARY KEY,
      household_id TEXT NOT NULL REFERENCES st_households(id),
      user_id TEXT NOT NULL REFERENCES users(id),
      relationship_type TEXT NOT NULL,
      membership_status TEXT NOT NULL,
      joined_at TEXT,
      left_at TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS st_invitations (
      id TEXT PRIMARY KEY,
      household_id TEXT NOT NULL REFERENCES st_households(id),
      email TEXT NOT NULL,
      invited_by TEXT NOT NULL REFERENCES users(id),
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS st_dependants (
      id TEXT PRIMARY KEY,
      household_id TEXT NOT NULL REFERENCES st_households(id),
      preferred_name TEXT NOT NULL,
      legal_name_sealed TEXT NOT NULL,
      dob_sealed TEXT NOT NULL,
      location_shared INTEGER NOT NULL DEFAULT 0,
      created_by TEXT NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS st_guardians (
      id TEXT PRIMARY KEY,
      dependant_id TEXT NOT NULL REFERENCES st_dependants(id),
      guardian_user_id TEXT NOT NULL REFERENCES users(id),
      relationship_type TEXT NOT NULL,
      authority_status TEXT NOT NULL,
      verification_status TEXT NOT NULL,
      evidence_note TEXT,
      reviewed_by TEXT REFERENCES users(id),
      reviewed_at TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS st_consent (
      id TEXT PRIMARY KEY,
      subject_user_id TEXT REFERENCES users(id),
      subject_dependant_id TEXT REFERENCES st_dependants(id),
      actor_user_id TEXT NOT NULL REFERENCES users(id),
      consent_type TEXT NOT NULL,
      purpose TEXT NOT NULL,
      policy_version TEXT NOT NULL,
      granted_at TEXT NOT NULL,
      withdrawn_at TEXT
    );
    CREATE TABLE IF NOT EXISTS st_grants (
      id TEXT PRIMARY KEY,
      subject_user_id TEXT REFERENCES users(id),
      subject_dependant_id TEXT REFERENCES st_dependants(id),
      grantee_user_id TEXT NOT NULL REFERENCES users(id),
      permission TEXT NOT NULL,
      legal_basis TEXT NOT NULL,
      status TEXT NOT NULL,
      starts_at TEXT NOT NULL,
      expires_at TEXT,
      revoked_at TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS st_grant_history (
      id TEXT PRIMARY KEY,
      grant_id TEXT NOT NULL REFERENCES st_grants(id),
      action TEXT NOT NULL,
      actor_user_id TEXT NOT NULL REFERENCES users(id),
      reason TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS st_contacts (
      id TEXT PRIMARY KEY,
      owner_user_id TEXT NOT NULL REFERENCES users(id),
      contact_user_id TEXT NOT NULL REFERENCES users(id),
      kind TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS st_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      status TEXT NOT NULL,
      started_at TEXT NOT NULL,
      ended_at TEXT
    );
    CREATE TABLE IF NOT EXISTS st_points (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES users(id),
      dependant_id TEXT REFERENCES st_dependants(id),
      session_id TEXT REFERENCES st_sessions(id),
      latitude_sealed TEXT NOT NULL,
      longitude_sealed TEXT NOT NULL,
      accuracy_m INTEGER NOT NULL,
      captured_at TEXT NOT NULL,
      received_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS st_zones (
      id TEXT PRIMARY KEY,
      owner_user_id TEXT NOT NULL REFERENCES users(id),
      protected_user_id TEXT REFERENCES users(id),
      protected_dependant_id TEXT REFERENCES st_dependants(id),
      name TEXT NOT NULL,
      latitude_sealed TEXT NOT NULL,
      longitude_sealed TEXT NOT NULL,
      radius_m INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS st_journeys (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      destination TEXT NOT NULL,
      expected_arrival_at TEXT NOT NULL,
      status TEXT NOT NULL,
      started_at TEXT NOT NULL,
      completed_at TEXT
    );
    CREATE TABLE IF NOT EXISTS st_journey_contacts (
      journey_id TEXT NOT NULL REFERENCES st_journeys(id),
      contact_user_id TEXT NOT NULL REFERENCES users(id),
      PRIMARY KEY (journey_id, contact_user_id)
    );
    CREATE TABLE IF NOT EXISTS st_checkins (
      id TEXT PRIMARY KEY,
      journey_id TEXT NOT NULL REFERENCES st_journeys(id),
      result TEXT NOT NULL,
      recorded_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS st_incidents (
      id TEXT PRIMARY KEY,
      reference_code TEXT NOT NULL UNIQUE,
      idempotency_key TEXT,
      subject_user_id TEXT REFERENCES users(id),
      subject_dependant_id TEXT REFERENCES st_dependants(id),
      initiated_by TEXT NOT NULL REFERENCES users(id),
      incident_type TEXT NOT NULL,
      status TEXT NOT NULL,
      note_sealed TEXT,
      created_at TEXT NOT NULL,
      resolved_at TEXT,
      UNIQUE (initiated_by, idempotency_key)
    );
    CREATE TABLE IF NOT EXISTS st_notifications (
      id TEXT PRIMARY KEY,
      incident_id TEXT NOT NULL REFERENCES st_incidents(id),
      recipient_user_id TEXT NOT NULL REFERENCES users(id),
      delivery_status TEXT NOT NULL,
      sent_at TEXT,
      acknowledged_at TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS st_missing (
      id TEXT PRIMARY KEY,
      incident_id TEXT NOT NULL UNIQUE REFERENCES st_incidents(id),
      last_seen_at TEXT,
      clothing_sealed TEXT,
      police_station TEXT,
      case_reference_sealed TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS st_agencies (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      status TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS st_access_requests (
      id TEXT PRIMARY KEY,
      incident_id TEXT REFERENCES st_incidents(id),
      organisation_name TEXT NOT NULL,
      requester_user_id TEXT NOT NULL REFERENCES users(id),
      legal_basis TEXT NOT NULL,
      reason TEXT NOT NULL,
      scope TEXT NOT NULL,
      status TEXT NOT NULL,
      denial_reason TEXT,
      requested_end TEXT,
      submitted_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS st_access_approvals (
      id TEXT PRIMARY KEY,
      request_id TEXT NOT NULL REFERENCES st_access_requests(id),
      reviewer_user_id TEXT NOT NULL REFERENCES users(id),
      decision TEXT NOT NULL,
      reason TEXT NOT NULL,
      decided_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS st_disclosures (
      id TEXT PRIMARY KEY,
      request_id TEXT NOT NULL REFERENCES st_access_requests(id),
      scope TEXT NOT NULL,
      disclosed_by TEXT NOT NULL REFERENCES users(id),
      disclosed_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      receipt TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS st_audit (
      id TEXT PRIMARY KEY,
      actor_user_id TEXT,
      action TEXT NOT NULL,
      resource_type TEXT NOT NULL,
      resource_id TEXT,
      purpose TEXT,
      outcome TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS st_concerns (
      id TEXT PRIMARY KEY,
      reporter_user_id TEXT NOT NULL REFERENCES users(id),
      body_sealed TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      created_at TEXT NOT NULL
    );
  `);
  db.prepare("INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)").run("0005_safetrack", new Date().toISOString());
}

function applyMediaRights(db: DatabaseSync): void {
  const applied = new Set((db.prepare("SELECT id FROM schema_migrations").all() as Array<{ id: string }>).map((row) => row.id));
  if (applied.has("0006_media_rights")) return;
  db.exec(`
    CREATE TABLE IF NOT EXISTS media_assets (
      id TEXT PRIMARY KEY,
      upload_id TEXT NOT NULL REFERENCES uploads(id),
      owner_name TEXT NOT NULL,
      licence_basis TEXT NOT NULL,
      credit TEXT NOT NULL,
      alt_text TEXT NOT NULL,
      source_url TEXT,
      acquired_on TEXT NOT NULL,
      expires_on TEXT,
      width INTEGER,
      height INTEGER,
      status TEXT NOT NULL DEFAULT 'pending',
      created_by TEXT NOT NULL REFERENCES users(id),
      reviewer_id TEXT REFERENCES users(id),
      reviewed_at TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS media_placements (
      id TEXT PRIMARY KEY,
      asset_id TEXT NOT NULL REFERENCES media_assets(id),
      slot TEXT NOT NULL,
      subject_type TEXT,
      subject_id TEXT,
      created_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_media_hero ON media_placements(slot) WHERE slot = 'homepage_hero';
  `);
  db.prepare("INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)").run("0006_media_rights", new Date().toISOString());
}

function applyCommercial(db: DatabaseSync): void {
  const applied = new Set((db.prepare("SELECT id FROM schema_migrations").all() as Array<{ id: string }>).map((row) => row.id));
  if (applied.has("0007_commercial")) return;
  db.exec(`
    CREATE TABLE IF NOT EXISTS commercial_plans (
      code TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      rank INTEGER NOT NULL,
      price_cents INTEGER NOT NULL,
      summary TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS business_subscriptions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      plan_code TEXT NOT NULL REFERENCES commercial_plans(code),
      amount_cents INTEGER NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      paid_at TEXT,
      cancelled_at TEXT
    );
    CREATE TABLE IF NOT EXISTS open_quotes (
      id TEXT PRIMARY KEY,
      requester_id TEXT NOT NULL REFERENCES users(id),
      category TEXT NOT NULL,
      message TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS quote_offers (
      id TEXT PRIMARY KEY,
      quote_id TEXT NOT NULL REFERENCES open_quotes(id),
      business_id TEXT NOT NULL REFERENCES businesses(id),
      owner_id TEXT NOT NULL REFERENCES users(id),
      message TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS practice_questions (
      id TEXT PRIMARY KEY,
      track TEXT NOT NULL,
      position INTEGER NOT NULL,
      prompt TEXT NOT NULL,
      options_json TEXT NOT NULL,
      correct_index INTEGER NOT NULL,
      note TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS practice_attempts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      track TEXT NOT NULL,
      correct INTEGER NOT NULL,
      total INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS focus_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      minutes INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS game_rounds (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      game TEXT NOT NULL,
      moves INTEGER NOT NULL,
      seconds INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
  const plans: Array<[string, string, number, number, string]> = [
    ["free", "Free", 0, 0, "A public business profile, news, jobs, notices, core lessons, K53 practice, games and competition entry stay free."],
    ["starter", "Starter", 1, 4900, "Respond to open quote requests. Each request stays visible to every business on an active Starter plan or above."],
    ["growth", "Growth", 2, 9900, "Starter tools, plus mark your own deal as featured. It is ordered first only after the deal is published."],
    ["professional", "Professional", 3, 19900, "The same working tools as Growth. No further tool is switched on at this test price."],
    ["business_plus", "Business Plus", 4, 39900, "The same working tools as Growth. No further tool is switched on at this test price."],
    ["enterprise", "Enterprise", 5, 0, "Negotiated. Checkout stays closed until an administrator sets a price."],
  ];
  const insertPlan = db.prepare("INSERT INTO commercial_plans (code, name, rank, price_cents, summary, active) VALUES (?, ?, ?, ?, ?, 1)");
  for (const plan of plans) insertPlan.run(...plan);
  const questions: Array<[string, string, number, string, string, number, string]> = [
    ["k53-side", "k53", 1, "Which side of the road do drivers keep in South Africa?", JSON.stringify(["The left", "The right", "Either side"]), 0, "Practice note. This is not an official learner-licence paper and it does not guarantee a pass."],
    ["k53-red", "k53", 2, "What does a red traffic light mean?", JSON.stringify(["Stop", "Go", "Speed up"]), 0, "Practice note. This is not an official learner-licence paper and it does not guarantee a pass."],
    ["k53-stop", "k53", 3, "What must you do at a stop sign?", JSON.stringify(["Stop completely", "Slow down and continue", "Hoot and continue"]), 0, "Practice note. This is not an official learner-licence paper and it does not guarantee a pass."],
    ["k53-urban", "k53", 4, "Unless a sign says otherwise, the general urban speed limit in South Africa is:", JSON.stringify(["60 km/h", "80 km/h", "120 km/h"]), 0, "Practice note. This is not an official learner-licence paper and it does not guarantee a pass."],
    ["lang-tn", "language", 1, "Which greeting is Setswana?", JSON.stringify(["Dumela", "Bonjour", "Hola"]), 0, "A common beginner greeting. This is not a full language course."],
    ["lang-af", "language", 2, "Which greeting is Afrikaans?", JSON.stringify(["Hallo", "Sawubona", "Bonjour"]), 0, "A common beginner greeting. This is not a full language course."],
    ["lang-zu", "language", 3, "Which greeting is isiZulu?", JSON.stringify(["Sawubona", "Dumela", "Hola"]), 0, "A common beginner greeting. This is not a full language course."],
  ];
  const insertQuestion = db.prepare("INSERT INTO practice_questions (id, track, position, prompt, options_json, correct_index, note) VALUES (?, ?, ?, ?, ?, ?, ?)");
  for (const question of questions) insertQuestion.run(...question);
  db.prepare("INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)").run("0007_commercial", new Date().toISOString());
}

function applyStudio(db: DatabaseSync): void {
  const applied = new Set((db.prepare("SELECT id FROM schema_migrations").all() as Array<{ id: string }>).map((row) => row.id));
  if (applied.has("0008_studio")) return;
  db.exec(`
    CREATE TABLE IF NOT EXISTS business_documents (
      id TEXT PRIMARY KEY,
      business_id TEXT NOT NULL REFERENCES businesses(id),
      owner_id TEXT NOT NULL REFERENCES users(id),
      kind TEXT NOT NULL,
      client_name TEXT NOT NULL,
      note TEXT,
      total_cents INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS business_document_lines (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL REFERENCES business_documents(id),
      description TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      unit_cents INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS appointments (
      id TEXT PRIMARY KEY,
      business_id TEXT NOT NULL REFERENCES businesses(id),
      requester_id TEXT NOT NULL REFERENCES users(id),
      starts_at TEXT NOT NULL,
      note TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'requested',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS study_blocks (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      weekday INTEGER NOT NULL,
      subject TEXT NOT NULL,
      minutes INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS loyalty_cards (
      id TEXT PRIMARY KEY,
      business_id TEXT NOT NULL REFERENCES businesses(id),
      title TEXT NOT NULL,
      stamps_required INTEGER NOT NULL,
      reward_note TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS loyalty_stamps (
      id TEXT PRIMARY KEY,
      card_id TEXT NOT NULL REFERENCES loyalty_cards(id),
      customer_id TEXT NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS deal_redemptions (
      id TEXT PRIMARY KEY,
      deal_id TEXT NOT NULL REFERENCES deals(id),
      recorded_by TEXT NOT NULL REFERENCES users(id),
      note TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
  const extra: Array<[string, string, number, string, string, number, string]> = [
    ["trivia-capital", "trivia", 1, "Which city is the executive capital of South Africa?", JSON.stringify(["Pretoria", "Cape Town", "Durban"]), 0, "Cape Town is the legislative capital. This is general knowledge, not a prize."],
    ["trivia-provinces", "trivia", 2, "How many provinces does South Africa have?", JSON.stringify(["9", "8", "10"]), 0, "General knowledge, not a prize."],
    ["trivia-currency", "trivia", 3, "What is South Africa's currency?", JSON.stringify(["Rand", "Pula", "Dollar"]), 0, "General knowledge, not a prize."],
    ["trivia-nw", "trivia", 4, "Rustenburg is in which province?", JSON.stringify(["North West", "Gauteng", "Limpopo"]), 0, "General knowledge, not a prize."],
    ["seq-evens", "sequence", 1, "What comes next: 2, 4, 6, 8, ...?", JSON.stringify(["10", "9", "12"]), 0, "A short practice sequence, not an official test."],
    ["seq-fives", "sequence", 2, "What comes next: 5, 10, 15, 20, ...?", JSON.stringify(["25", "30", "21"]), 0, "A short practice sequence, not an official test."],
    ["spell-stay", "spelling", 1, "Which spelling is correct?", JSON.stringify(["accommodation", "acommodation", "acomodation"]), 0, "A spelling check, not an official exam."],
    ["spell-receive", "spelling", 2, "Which spelling is correct?", JSON.stringify(["receive", "recieve", "receeve"]), 0, "A spelling check, not an official exam."],
  ];
  const insert = db.prepare("INSERT INTO practice_questions (id, track, position, prompt, options_json, correct_index, note) VALUES (?, ?, ?, ?, ?, ?, ?)");
  for (const row of extra) insert.run(...row);
  db.prepare("INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)").run("0008_studio", new Date().toISOString());
}

function applyHistory(db: DatabaseSync): void {
  const applied = new Set((db.prepare("SELECT id FROM schema_migrations").all() as Array<{ id: string }>).map((row) => row.id));
  if (applied.has("0009_history")) return;
  db.exec(`
    CREATE TABLE IF NOT EXISTS history_notes (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      kind TEXT NOT NULL,
      body TEXT NOT NULL,
      source_note TEXT NOT NULL,
      consent INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL
    );
  `);
  db.prepare("INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)").run("0009_history", new Date().toISOString());
}

function applyDesks(db: DatabaseSync): void {
  const applied = new Set((db.prepare("SELECT id FROM schema_migrations").all() as Array<{ id: string }>).map((row) => row.id));
  if (applied.has("0010_desks")) return;
  db.exec(`
    CREATE TABLE IF NOT EXISTS city_desks (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      author_id TEXT NOT NULL REFERENCES users(id),
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      place TEXT,
      starts_on TEXT,
      ends_on TEXT,
      source_url TEXT,
      price_cents INTEGER,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_city_desks_kind ON city_desks(kind, status, created_at);
    CREATE TABLE IF NOT EXISTS city_desk_follows (
      user_id TEXT NOT NULL REFERENCES users(id),
      kind TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (user_id, kind)
    );
  `);
  db.prepare("INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)").run("0010_desks", new Date().toISOString());
}

export function all<T>(sql: string, ...params: unknown[]): T[] {
  return getDb().prepare(sql).all(...bind(params)) as T[];
}

export function get<T>(sql: string, ...params: unknown[]): T | undefined {
  return getDb().prepare(sql).get(...bind(params)) as T | undefined;
}

export function run(sql: string, ...params: unknown[]): number {
  const result = getDb().prepare(sql).run(...bind(params));
  return Number(result.changes ?? 0);
}

export function transaction<T>(fn: () => T): T {
  const db = getDb();
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch {
      /* already closed */
    }
    throw error;
  }
}

export function newId(): string {
  return crypto.randomUUID();
}

export function closeDb(): void {
  if (database) {
    database.close();
    database = null;
  }
}

export function writeBootstrapSecret(fileName: string, contents: string): string {
  const file = path.join(dataDir(), fileName);
  if (!fs.existsSync(file)) fs.writeFileSync(file, contents, { mode: 0o600 });
  return file;
}
