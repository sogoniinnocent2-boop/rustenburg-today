import { containsSensitiveIdentity, randsToCents } from "@/lib/text";
import type { SessionUser } from "./auth";
import { assertActive } from "./auth";
import { fanout, notify } from "./alerts";
import { all, get, newId, run } from "./db";
import { AppError } from "./errors";
import { ensureReady } from "./init";
import { rejectRecruitmentFee } from "./citydesk";
import { canPublishSection, sectionForModule } from "./departments";
import { hasPermission, requirePermission } from "./permissions";
import { audit, indexDocument, locationBySlug, removeIndex } from "./store";
import { uniqueSlug } from "./editorial";

type Field = { column: string; type: "text" | "textarea" | "money" | "select" | "int" | "date" | "location"; required?: boolean; options?: string[] };
type Spec = { key: string; table: string; owner: string; title: string; permission: string; search: string; fields: Field[]; currency?: boolean; consent?: boolean };

const text = (column: string, required = true): Field => ({ column, type: "text", required });
const area = (column: string, required = true): Field => ({ column, type: "textarea", required });
const choice = (column: string, options: string[]): Field => ({ column, type: "select", required: true, options });

export const modules: Spec[] = [
  { key: "property", table: "properties", owner: "owner_id", title: "title", permission: "directory.create", search: "property", currency: true, fields: [text("title"), choice("listing_type", ["sale", "rent", "room", "apartment", "student", "commercial", "industrial", "land", "farm", "hotel", "guest-house", "lodge"]), text("property_type"), area("description"), { column: "price_cents", type: "money", required: true }, { column: "location_id", type: "location" }, text("area_label", false), { column: "bedrooms", type: "int" }, { column: "bathrooms", type: "int" }] },
  { key: "food", table: "food_places", owner: "owner_id", title: "name", permission: "directory.create", search: "food", fields: [text("name"), choice("kind", ["restaurant", "takeaway", "bakery", "caterer", "chef"]), area("description"), text("phone", false), { column: "location_id", type: "location" }] },
  { key: "recipe", table: "recipes", owner: "author_id", title: "title", permission: "community.post", search: "recipe", fields: [text("title"), area("description"), area("ingredients"), area("method")] },
  { key: "team", table: "sports_teams", owner: "owner_id", title: "name", permission: "directory.create", search: "team", fields: [text("name"), text("sport"), area("description"), { column: "location_id", type: "location" }] },
  { key: "youth", table: "youth_opportunities", owner: "owner_id", title: "title", permission: "directory.create", search: "youth", fields: [text("title"), text("category"), area("description"), { column: "location_id", type: "location" }, { column: "closes_at", type: "date" }] },
  { key: "campaign", table: "support_campaigns", owner: "organiser_id", title: "title", permission: "campaigns.create", search: "campaign", fields: [text("title"), area("description"), text("category"), { column: "goal_cents", type: "money", required: true }, { column: "location_id", type: "location" }] },
  { key: "volunteer", table: "volunteer_opportunities", owner: "organiser_id", title: "title", permission: "campaigns.create", search: "volunteer", fields: [text("title"), area("description"), { column: "location_id", type: "location" }, { column: "slots", type: "int", required: true }] },
  { key: "traffic", table: "traffic_reports", owner: "author_id", title: "title", permission: "community.post", search: "traffic", fields: [text("title"), area("description"), choice("report_kind", ["traffic", "closure", "condition", "hazard"]), choice("severity", ["info", "warning"]), { column: "location_id", type: "location" }] },
  { key: "transport", table: "transport_services", owner: "owner_id", title: "name", permission: "directory.create", search: "transport", fields: [text("name"), choice("service_type", ["taxi", "bus", "shuttle", "rental", "long-distance", "roadside"]), area("description"), text("phone", false), { column: "location_id", type: "location" }] },
  { key: "tourism", table: "tourism_listings", owner: "owner_id", title: "name", permission: "directory.create", search: "tourism", fields: [text("name"), text("category"), area("description"), { column: "location_id", type: "location" }, text("area_label", false)] },
  { key: "health", table: "health_providers", owner: "owner_id", title: "name", permission: "directory.create", search: "health", fields: [text("name"), choice("provider_type", ["clinic", "hospital", "pharmacy", "dentist", "optometrist", "fitness", "wellness"]), area("description"), text("phone", false), { column: "location_id", type: "location" }] },
  { key: "petition", table: "petitions", owner: "author_id", title: "title", permission: "community.post", search: "petition", fields: [text("title"), area("description"), text("target"), { column: "location_id", type: "location" }] },
  { key: "civic", table: "civic_reports", owner: "author_id", title: "title", permission: "community.post", search: "civic", fields: [choice("report_type", ["water", "electricity", "roads", "refuse", "project", "question"]), text("title"), area("description"), { column: "location_id", type: "location" }] },
  { key: "deal", table: "deals", owner: "owner_id", title: "title", permission: "business.create", search: "deal", fields: [text("title"), area("description"), choice("deal_type", ["daily", "restaurant", "retail", "weekend", "voucher"]), { column: "price_cents", type: "money" }, text("code", false), { column: "ends_at", type: "date" }] },
  { key: "competition", table: "competitions", owner: "organiser_id", title: "title", permission: "events.create", search: "competition", fields: [text("title"), area("description"), area("rules"), text("prize"), choice("kind", ["business", "music", "photo", "school", "talent", "quiz", "giveaway"]), { column: "starts_at", type: "date", required: true }, { column: "ends_at", type: "date", required: true }] },
  { key: "heritage", table: "heritage_items", owner: "author_id", title: "title", permission: "community.post", search: "heritage", fields: [text("title"), area("description"), text("period", false), { column: "location_id", type: "location" }] },
  { key: "service", table: "service_providers", owner: "owner_id", title: "name", permission: "directory.create", search: "service", fields: [text("name"), choice("service_type", ["cleaning", "gardening", "plumbing", "electrical", "painting", "building", "photography", "catering", "tutoring", "driving-school", "mechanic", "computers", "design", "events", "salon", "barber", "beauty", "clothing", "electronics", "appliances", "repairs"]), area("description"), text("phone", false), { column: "location_id", type: "location" }, text("availability", false)] },
  { key: "agriculture", table: "agriculture_listings", owner: "owner_id", title: "title", permission: "directory.create", search: "agriculture", currency: true, fields: [text("title"), choice("listing_kind", ["produce", "livestock", "equipment", "job", "training", "market", "service", "supplier"]), area("description"), { column: "price_cents", type: "money" }, { column: "location_id", type: "location" }] },
  { key: "faith", table: "faith_organisations", owner: "owner_id", title: "name", permission: "directory.create", search: "faith", fields: [text("name"), text("tradition"), area("description"), { column: "location_id", type: "location" }, text("service_times", false)] },
  { key: "family", table: "family_resources", owner: "author_id", title: "title", permission: "community.post", search: "family", fields: [text("title"), choice("resource_type", ["parenting", "childcare", "school", "activity", "support"]), area("description")] },
  { key: "childcare", table: "childcare_listings", owner: "owner_id", title: "name", permission: "directory.create", search: "childcare", fields: [text("name"), area("description"), { column: "location_id", type: "location" }, text("phone", false)] },
  { key: "technology", table: "technology_organisations", owner: "owner_id", title: "name", permission: "directory.create", search: "technology", fields: [text("name"), text("focus"), area("description"), { column: "location_id", type: "location" }, text("website", false)] },
  { key: "notice", table: "public_notices", owner: "author_id", title: "title", permission: "notices.create", search: "notice", consent: true, fields: [choice("notice_type", ["lost_document", "found_property", "missing_pet", "meeting", "road_maintenance", "school", "tender", "participation", "funeral", "safety", "missing_person"]), text("title"), area("description"), { column: "location_id", type: "location" }, { column: "expires_at", type: "date" }] },
];

const SECTION_MODULE: Record<string, string> = {
  property: "property", food: "food", sports: "team", youth: "youth", support: "campaign", transport: "traffic",
  tourism: "tourism", health: "health", voice: "petition", deals: "deal", competitions: "competition", history: "heritage",
  services: "service", agriculture: "agriculture", faith: "faith", family: "family", technology: "technology", notices: "notice",
};

export function moduleKeyForSection(section: string): string | null {
  return SECTION_MODULE[section] ?? null;
}

export function moduleByKey(key: string): Spec {
  const spec = modules.find((item) => item.key === key);
  if (!spec) throw new AppError(404, "Unknown department record");
  return spec;
}

function valueFor(field: Field, raw: string | undefined): string | number | null {
  const value = (raw ?? "").trim();
  if (!value) {
    if (field.required) throw new AppError(400, `Add ${field.column.replaceAll("_", " ")}`);
    return null;
  }
  if (field.type === "select" && !field.options?.includes(value)) throw new AppError(400, "Choose a valid option");
  if (field.type === "money") {
    try { return randsToCents(value); } catch (error) { throw new AppError(400, error instanceof Error ? error.message : "Invalid amount"); }
  }
  if (field.type === "int") {
    const number = Number(value);
    if (!Number.isInteger(number) || number < 0 || number > 100000) throw new AppError(400, "Enter a whole number");
    return number;
  }
  if (field.type === "location") return locationBySlug(value)?.id || null;
  if (field.type === "date" && !/^\d{4}-\d{2}-\d{2}/.test(value)) throw new AppError(400, "Use a date");
  if ((field.type === "text" || field.type === "textarea") && containsSensitiveIdentity(value)) throw new AppError(400, "Remove identity numbers before saving");
  return value.slice(0, field.type === "textarea" ? 5000 : 180);
}

export function createRecord(user: SessionUser, key: string, input: Record<string, string>, options: { publish?: boolean } = {}): string {
  ensureReady();
  assertActive(user);
  const spec = moduleByKey(key);
  requirePermission(user.id, spec.permission);
  if (spec.consent && ["funeral", "missing_person"].includes(input.notice_type || "") && input.consent !== "yes") {
    throw new AppError(400, "This notice needs explicit consent before it can be submitted");
  }
  const section = sectionForModule(key);
  const goLive = Boolean(options.publish && section && canPublishSection(user, section));
  const columns = ["id", spec.owner, "status", "created_at", "updated_at"];
  const stamp = new Date().toISOString();
  const id = newId();
  const values: Array<string | number | null> = [id, user.id, goLive ? "published" : "pending", stamp, stamp];
  for (const field of spec.fields) {
    const value = valueFor(field, input[field.column] ?? input[field.column.replace("_cents", "")]);
    if (value === null && !field.required) continue;
    columns.push(field.column);
    values.push(value);
  }
  if (spec.currency) {
    columns.push("currency");
    values.push("ZAR");
  }
  if (spec.consent) {
    columns.push("consent_confirmed");
    values.push(input.consent === "yes" ? 1 : 0);
  }
  run(`INSERT INTO ${spec.table} (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`, ...values);
  if (goLive) {
    if (spec.table === "health_providers") run("UPDATE health_providers SET review_status = 'approved' WHERE id = ?", id);
    if (spec.table === "traffic_reports" || spec.table === "civic_reports") run(`UPDATE ${spec.table} SET verification_status = 'verified' WHERE id = ?`, id);
    const title = String(input[spec.title] || input.title || input.name || "Listing");
    const body = String(input.description || title);
    indexDocument({ entityType: spec.search, entityId: id, language: "en", title, body, publishedAt: stamp });
  }
  audit(user.id, goLive ? `${key}.publish` : `${key}.create`, key, id);
  return id;
}

export function publishRecord(user: SessionUser, key: string, id: string): void {
  ensureReady();
  assertActive(user);
  const section = sectionForModule(key);
  if (!hasPermission(user.id, "directory.moderate") && !(section && canPublishSection(user, section))) {
    throw new AppError(403, "You do not have permission to do that");
  }
  const spec = moduleByKey(key);
  const row = get<Record<string, unknown>>(`SELECT * FROM ${spec.table} WHERE id = ?`, id);
  if (!row) throw new AppError(404, "Record not found");
  if (section && canPublishSection(user, section) && !hasPermission(user.id, "directory.moderate") && String(row[spec.owner]) !== user.id) {
    throw new AppError(403, "You can only publish your own department records");
  }
  const stamp = new Date().toISOString();
  if (spec.table === "health_providers") run("UPDATE health_providers SET status = 'published', review_status = 'approved', updated_at = ? WHERE id = ?", stamp, id);
  else if (spec.table === "traffic_reports") run("UPDATE traffic_reports SET status = 'published', verification_status = 'verified', updated_at = ? WHERE id = ?", stamp, id);
  else if (spec.table === "civic_reports") run("UPDATE civic_reports SET status = 'published', verification_status = 'verified', updated_at = ? WHERE id = ?", stamp, id);
  else run(`UPDATE ${spec.table} SET status = 'published', updated_at = ? WHERE id = ?`, stamp, id);
  const title = String(row[spec.title] || "Listing");
  const body = String(row.description || title);
  indexDocument({ entityType: spec.search, entityId: id, language: "en", title, body, publishedAt: stamp });
  if ((key === "traffic" || key === "tourism") && row.location_id) {
    const place = get<{ latitude: number | null; longitude: number | null }>("SELECT latitude, longitude FROM locations WHERE id = ?", String(row.location_id));
    if (place?.latitude && place.longitude) {
      run(
        `INSERT INTO map_points (id, source_type, source_id, title, summary, category, latitude, longitude, location_id, author_id, source_name, verification_status, moderation_status, sensitive, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Rustenburg Today review', 'verified', 'approved', 0, ?, ?)`,
        newId(), key, id, title, body.slice(0, 240), key, place.latitude, place.longitude, row.location_id, user.id, stamp, stamp,
      );
    }
  }
  if (key === "deal") fanout("deals", title, body.slice(0, 180), `/deals/${id}`);
  if (key === "traffic") fanout("traffic", title, body.slice(0, 180), `/transport/${id}`, row.location_id ? String(row.location_id) : null);
  audit(user.id, `${key}.publish`, key, id);
}

export function listRecords(key: string): Array<Record<string, unknown>> {
  ensureReady();
  const spec = moduleByKey(key);
  const health = spec.table === "health_providers" ? " AND review_status = 'approved'" : "";
  return all(`SELECT * FROM ${spec.table} WHERE status = 'published'${health} AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 60`);
}

export function getRecord(key: string, id: string): Record<string, unknown> | null {
  ensureReady();
  const spec = moduleByKey(key);
  return get<Record<string, unknown>>(`SELECT * FROM ${spec.table} WHERE id = ? AND status = 'published' AND deleted_at IS NULL`, id) ?? null;
}

export function addMenuItem(user: SessionUser, placeId: string, input: { name: string; description?: string; priceRands: string }): string {
  ensureReady();
  assertActive(user);
  const place = get<{ owner_id: string }>("SELECT owner_id FROM food_places WHERE id = ? AND deleted_at IS NULL", placeId);
  if (!place || place.owner_id !== user.id) throw new AppError(403, "Only the owner can edit this menu");
  if (input.name.trim().length < 2) throw new AppError(400, "Name the dish");
  const id = newId();
  run("INSERT INTO food_menu_items (id, place_id, name, description, price_cents, available) VALUES (?, ?, ?, ?, ?, 1)", id, placeId, input.name.trim().slice(0, 120), input.description?.trim().slice(0, 500) || null, randsToCents(input.priceRands));
  return id;
}

export function listMenu(placeId: string): Array<Record<string, unknown>> {
  ensureReady();
  return all("SELECT id, name, description, price_cents FROM food_menu_items WHERE place_id = ? AND available = 1 ORDER BY name", placeId);
}

export function addPlayer(user: SessionUser, teamId: string, input: { name: string; position?: string; biography?: string }): string {
  ensureReady();
  assertActive(user);
  const team = get<{ owner_id: string }>("SELECT owner_id FROM sports_teams WHERE id = ? AND deleted_at IS NULL", teamId);
  if (!team || team.owner_id !== user.id) throw new AppError(403, "Only the club can add players");
  if (containsSensitiveIdentity(input.name) || (input.biography && containsSensitiveIdentity(input.biography))) throw new AppError(400, "Remove identity numbers before saving");
  const id = newId();
  run("INSERT INTO sports_players (id, team_id, name, position, biography, status) VALUES (?, ?, ?, ?, ?, 'published')", id, teamId, input.name.trim().slice(0, 80), input.position?.trim().slice(0, 40) || null, input.biography?.trim().slice(0, 500) || null);
  return id;
}

export function addFixture(user: SessionUser, input: { homeTeamId: string; awayTeamId: string; start: string; venue?: string }): string {
  ensureReady();
  assertActive(user);
  if (input.homeTeamId === input.awayTeamId) throw new AppError(400, "Choose two different clubs");
  const home = get<{ owner_id: string; sport: string; status: string }>("SELECT owner_id, sport, status FROM sports_teams WHERE id = ? AND deleted_at IS NULL", input.homeTeamId);
  const away = get<{ status: string }>("SELECT status FROM sports_teams WHERE id = ? AND deleted_at IS NULL", input.awayTeamId);
  if (!home || !away || home.status !== "published" || away.status !== "published") throw new AppError(400, "Both clubs must be published");
  if (home.owner_id !== user.id) throw new AppError(403, "The home club arranges the fixture");
  if (!/^\d{4}-\d{2}-\d{2}/.test(input.start)) throw new AppError(400, "Use a date");
  const id = newId();
  run("INSERT INTO sports_fixtures (id, sport, home_team_id, away_team_id, venue, start_at, status, created_at) VALUES (?, ?, ?, ?, ?, ?, 'scheduled', ?)", id, home.sport, input.homeTeamId, input.awayTeamId, input.venue?.trim().slice(0, 120) || null, input.start, new Date().toISOString());
  return id;
}

export function recordResult(user: SessionUser, fixtureId: string, homeScore: number, awayScore: number, summary?: string): void {
  ensureReady();
  assertActive(user);
  if (!Number.isInteger(homeScore) || !Number.isInteger(awayScore) || homeScore < 0 || awayScore < 0 || homeScore > 999 || awayScore > 999) throw new AppError(400, "Scores must be whole numbers");
  const fixture = get<{ home_owner: string }>(
    `SELECT t.owner_id as home_owner FROM sports_fixtures f JOIN sports_teams t ON t.id = f.home_team_id WHERE f.id = ?`,
    fixtureId,
  );
  if (!fixture || fixture.home_owner !== user.id) throw new AppError(403, "The home club records the result");
  if (summary && containsSensitiveIdentity(summary)) throw new AppError(400, "Remove identity numbers before saving");
  const stamp = new Date().toISOString();
  try {
    run("INSERT INTO sports_results (id, fixture_id, home_score, away_score, summary, recorded_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)", newId(), fixtureId, homeScore, awayScore, summary?.trim().slice(0, 500) || null, user.id, stamp);
  } catch {
    throw new AppError(409, "This result is already recorded");
  }
  run("UPDATE sports_fixtures SET status = 'played' WHERE id = ?", fixtureId);
}

export function listFixtures(): Array<Record<string, unknown>> {
  ensureReady();
  return all(
    `SELECT f.id, f.sport, f.start_at, f.venue, f.status, h.name as home_name, a.name as away_name, r.home_score, r.away_score
     FROM sports_fixtures f
     JOIN sports_teams h ON h.id = f.home_team_id
     JOIN sports_teams a ON a.id = f.away_team_id
     LEFT JOIN sports_results r ON r.fixture_id = f.id
     ORDER BY f.start_at DESC LIMIT 40`,
  );
}

export function standings(): Array<Record<string, unknown>> {
  ensureReady();
  return all(
    `SELECT t.id, t.name, t.sport,
        SUM(CASE WHEN r.id IS NULL THEN 0 WHEN (f.home_team_id = t.id AND r.home_score > r.away_score) OR (f.away_team_id = t.id AND r.away_score > r.home_score) THEN 1 ELSE 0 END) as wins,
        SUM(CASE WHEN r.id IS NULL THEN 0 WHEN r.home_score = r.away_score THEN 1 ELSE 0 END) as draws,
        SUM(CASE WHEN r.id IS NULL THEN 0 WHEN (f.home_team_id = t.id AND r.home_score < r.away_score) OR (f.away_team_id = t.id AND r.away_score < r.home_score) THEN 1 ELSE 0 END) as losses
     FROM sports_teams t
     LEFT JOIN sports_fixtures f ON f.home_team_id = t.id OR f.away_team_id = t.id
     LEFT JOIN sports_results r ON r.fixture_id = f.id
     WHERE t.status = 'published' AND t.deleted_at IS NULL
     GROUP BY t.id
     ORDER BY wins DESC, t.name`,
  );
}

export function listPlayers(teamId: string): Array<Record<string, unknown>> {
  ensureReady();
  return all("SELECT id, name, position, biography FROM sports_players WHERE team_id = ? AND status = 'published' ORDER BY name", teamId);
}

export function createCreatorPost(user: SessionUser, input: { title: string; body: string; contentType: string; sponsored?: boolean; sponsorLabel?: string }): string {
  ensureReady();
  assertActive(user);
  const creator = get<{ id: string }>("SELECT id FROM creator_profiles WHERE user_id = ? AND status = 'active'", user.id);
  if (!creator) throw new AppError(403, "Enable the creator role before publishing");
  if (input.title.trim().length < 3 || input.body.trim().length < 10) throw new AppError(400, "Add a title and a body");
  if (containsSensitiveIdentity(input.title) || containsSensitiveIdentity(input.body)) throw new AppError(400, "Remove identity numbers before saving");
  const types = ["article", "photo", "video", "note"];
  if (!types.includes(input.contentType)) throw new AppError(400, "Choose a content type");
  if (input.sponsored && (input.sponsorLabel || "").trim().length < 3) throw new AppError(400, "Name the sponsor");
  const id = newId();
  const stamp = new Date().toISOString();
  run(
    "INSERT INTO creator_posts (id, creator_id, title, body, content_type, sponsored, sponsor_label, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)",
    id, creator.id, input.title.trim().slice(0, 160), input.body.trim().slice(0, 8000), input.contentType, input.sponsored ? 1 : 0, input.sponsored ? input.sponsorLabel!.trim().slice(0, 120) : null, stamp, stamp,
  );
  return id;
}

export function publishCreatorPost(user: SessionUser, id: string): void {
  ensureReady();
  assertActive(user);
  requirePermission(user.id, "media.moderate");
  const post = get<{ title: string; body: string; creator_id: string }>("SELECT title, body, creator_id FROM creator_posts WHERE id = ? AND status = 'pending'", id);
  if (!post) throw new AppError(404, "Creator post not found");
  const stamp = new Date().toISOString();
  run("UPDATE creator_posts SET status = 'published', updated_at = ? WHERE id = ?", stamp, id);
  indexDocument({ entityType: "creator", entityId: id, language: "en", title: post.title, body: post.body, publishedAt: stamp });
  const owner = get<{ user_id: string }>("SELECT user_id FROM creator_profiles WHERE id = ?", post.creator_id);
  if (owner) notify(owner.user_id, "creator", "Your post is published", post.title, `/creators/${id}`);
  audit(user.id, "creator.publish", "creator_post", id);
}

export function listCreatorPosts(): Array<Record<string, unknown>> {
  ensureReady();
  return all(
    `SELECT p.id, p.title, p.body, p.content_type, p.sponsored, p.sponsor_label, p.created_at, c.display_name, c.channel_slug
     FROM creator_posts p JOIN creator_profiles c ON c.id = p.creator_id
     WHERE p.status = 'published' AND p.deleted_at IS NULL ORDER BY p.created_at DESC LIMIT 40`,
  );
}

export function getCreatorPost(id: string): Record<string, unknown> | null {
  ensureReady();
  return get<Record<string, unknown>>(
    `SELECT p.*, c.display_name, c.channel_slug, c.user_id as owner_id FROM creator_posts p JOIN creator_profiles c ON c.id = p.creator_id
     WHERE p.id = ? AND p.status = 'published' AND p.deleted_at IS NULL`,
    id,
  ) ?? null;
}

export function subscribeCreator(user: SessionUser, creatorProfileId: string): void {
  ensureReady();
  assertActive(user);
  const creator = get("SELECT id FROM creator_profiles WHERE id = ? AND status = 'active'", creatorProfileId);
  if (!creator) throw new AppError(404, "Creator not found");
  run("INSERT INTO creator_subscriptions (id, subscriber_id, creator_id, status, created_at) VALUES (?, ?, ?, 'active', ?) ON CONFLICT(subscriber_id, creator_id) DO UPDATE SET status = 'active'", newId(), user.id, creatorProfileId, new Date().toISOString());
}

export function createRewardOffer(user: SessionUser, input: { businessId: string; title: string; description: string; points: number }): string {
  ensureReady();
  assertActive(user);
  const business = get<{ owner_id: string; status: string }>("SELECT owner_id, status FROM businesses WHERE id = ?", input.businessId);
  if (!business || business.owner_id !== user.id || business.status !== "published") throw new AppError(403, "Publish the business before offering rewards");
  if (!Number.isInteger(input.points) || input.points < 1 || input.points > 100000) throw new AppError(400, "Points must be a whole number");
  if (input.title.trim().length < 3) throw new AppError(400, "Name the offer");
  const id = newId();
  run("INSERT INTO rewards_offers (id, business_id, title, description, points_cost, status, created_at) VALUES (?, ?, ?, ?, ?, 'pending', ?)", id, input.businessId, input.title.trim().slice(0, 120), input.description.trim().slice(0, 500), input.points, new Date().toISOString());
  return id;
}

export function publishRewardOffer(user: SessionUser, id: string): void {
  ensureReady();
  assertActive(user);
  requirePermission(user.id, "directory.moderate");
  if (!get("SELECT id FROM rewards_offers WHERE id = ? AND status = 'pending'", id)) throw new AppError(404, "Offer not found");
  run("UPDATE rewards_offers SET status = 'published' WHERE id = ?", id);
  audit(user.id, "rewards.publish", "rewards_offer", id);
}

export function listRewardOffers(): Array<Record<string, unknown>> {
  ensureReady();
  return all(
    `SELECT o.id, o.title, o.description, o.points_cost, b.name as business_name
     FROM rewards_offers o LEFT JOIN businesses b ON b.id = o.business_id
     WHERE o.status = 'published' ORDER BY o.created_at DESC`,
  );
}

export function removeRecord(user: SessionUser, key: string, id: string): void {
  ensureReady();
  assertActive(user);
  requirePermission(user.id, "directory.moderate");
  const spec = moduleByKey(key);
  const stamp = new Date().toISOString();
  run(`UPDATE ${spec.table} SET status = 'removed', deleted_at = ?, updated_at = ? WHERE id = ?`, stamp, stamp, id);
  removeIndex(spec.search, id);
  audit(user.id, `${key}.remove`, key, id);
}

export function signPetition(user: SessionUser, petitionId: string): number {
  ensureReady();
  assertActive(user);
  if (!get("SELECT id FROM petitions WHERE id = ? AND status = 'published'", petitionId)) throw new AppError(404, "Petition not found");
  try { run("INSERT INTO petition_signatures (id, petition_id, user_id, created_at) VALUES (?, ?, ?, ?)", newId(), petitionId, user.id, new Date().toISOString()); }
  catch { throw new AppError(409, "You have already signed"); }
  return get<{ count: number }>("SELECT COUNT(*) as count FROM petition_signatures WHERE petition_id = ?", petitionId)?.count ?? 0;
}

export function pledgeDonation(user: SessionUser, campaignId: string, rands: string): void {
  ensureReady();
  assertActive(user);
  if (!get("SELECT id FROM support_campaigns WHERE id = ? AND status = 'published'", campaignId)) throw new AppError(404, "Campaign not found");
  let amount = 0;
  try { amount = randsToCents(rands); } catch { throw new AppError(400, "Enter a pledge amount"); }
  run("INSERT INTO donations (id, campaign_id, donor_id, amount_cents, status, created_at) VALUES (?, ?, ?, ?, 'pledged', ?)", newId(), campaignId, user.id, amount, new Date().toISOString());
}

export function confirmDonation(user: SessionUser, donationId: string): void {
  ensureReady();
  assertActive(user);
  requirePermission(user.id, "payments.reconcile");
  run("UPDATE donations SET status = 'confirmed' WHERE id = ? AND status = 'pledged'", donationId);
  audit(user.id, "donation.confirm", "donation", donationId);
}

export function confirmedTotal(campaignId: string): number {
  ensureReady();
  return get<{ total: number }>("SELECT COALESCE(SUM(amount_cents), 0) as total FROM donations WHERE campaign_id = ? AND status = 'confirmed'", campaignId)?.total ?? 0;
}

export function requestQuote(user: SessionUser, providerId: string, message: string): void {
  ensureReady();
  assertActive(user);
  if (user.isMinor) throw new AppError(403, "Quotation requests are not available on accounts under 18");
  if (message.trim().length < 8) throw new AppError(400, "Describe the work");
  run("INSERT INTO quotation_requests (id, provider_id, requester_id, message, status, created_at) VALUES (?, ?, ?, ?, 'open', ?)", newId(), providerId, user.id, message.trim(), new Date().toISOString());
}

export function enterCompetition(user: SessionUser, competitionId: string, answer?: string): void {
  ensureReady();
  assertActive(user);
  const today = new Date().toISOString().slice(0, 10);
  const contest = get<{ status: string; ends_at: string; starts_at: string }>("SELECT status, ends_at, starts_at FROM competitions WHERE id = ?", competitionId);
  if (!contest || contest.status !== "published" || contest.ends_at < today || contest.starts_at > today) throw new AppError(400, "Entries are closed");
  try { run("INSERT INTO giveaway_entries (id, competition_id, user_id, answer, status, created_at) VALUES (?, ?, ?, ?, 'entered', ?)", newId(), competitionId, user.id, answer?.slice(0, 500) || null, new Date().toISOString()); }
  catch { throw new AppError(409, "You have already entered"); }
}

export function saveDeal(user: SessionUser, dealId: string): void {
  ensureReady();
  assertActive(user);
  const existing = get("SELECT 1 as ok FROM saved_deals WHERE user_id = ? AND deal_id = ?", user.id, dealId);
  if (existing) run("DELETE FROM saved_deals WHERE user_id = ? AND deal_id = ?", user.id, dealId);
  else run("INSERT INTO saved_deals (user_id, deal_id, created_at) VALUES (?, ?, ?)", user.id, dealId, new Date().toISOString());
}

export function createJob(user: SessionUser, input: { title: string; description: string; jobType: string; locationId?: string | null; closing?: string; applicationFee?: number | null }, options: { publish?: boolean } = {}): string {
  ensureReady();
  assertActive(user);
  requirePermission(user.id, "jobs.create");
  rejectRecruitmentFee(input.applicationFee);
  const goLive = Boolean(options.publish && canPublishSection(user, "jobs"));
  const id = newId();
  const stamp = new Date().toISOString();
  run("INSERT INTO jobs (id, employer_id, title, description, job_type, location_id, closing_date, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", id, user.id, input.title.trim(), input.description.trim(), input.jobType, input.locationId || null, input.closing || null, goLive ? "published" : "pending", stamp, stamp);
  if (goLive) {
    indexDocument({ entityType: "job", entityId: id, language: "en", title: input.title.trim(), body: input.description.trim(), publishedAt: stamp });
    fanout("jobs", input.title.trim(), input.description.trim().slice(0, 180), `/jobs/${id}`, input.locationId || null);
  }
  return id;
}

export function publishJob(user: SessionUser, id: string): void {
  ensureReady();
  assertActive(user);
  const job = get<{ title: string; description: string; location_id: string | null; employer_id: string }>("SELECT title, description, location_id, employer_id FROM jobs WHERE id = ?", id);
  if (!job) throw new AppError(404, "Job not found");
  if (!hasPermission(user.id, "jobs.manage") && !(canPublishSection(user, "jobs") && job.employer_id === user.id)) {
    throw new AppError(403, "You do not have permission to do that");
  }
  run("UPDATE jobs SET status = 'published', updated_at = ? WHERE id = ?", new Date().toISOString(), id);
  indexDocument({ entityType: "job", entityId: id, language: "en", title: job.title, body: job.description, publishedAt: new Date().toISOString() });
  fanout("jobs", job.title, job.description.slice(0, 180), `/jobs/${id}`, job.location_id);
}

export function applyToJob(user: SessionUser, jobId: string, coverLetter: string, cvUrl?: string): void {
  ensureReady();
  assertActive(user);
  requirePermission(user.id, "jobs.apply");
  if (coverLetter.trim().length < 20) throw new AppError(400, "Write a short cover letter");
  if (!get("SELECT id FROM jobs WHERE id = ? AND status = 'published'", jobId)) throw new AppError(404, "Vacancy not found");
  try { run("INSERT INTO job_applications (id, job_id, applicant_id, cv_url, cover_letter, application_status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'submitted', ?, ?)", newId(), jobId, user.id, cvUrl || null, coverLetter.trim(), new Date().toISOString(), new Date().toISOString()); }
  catch { throw new AppError(409, "You have already applied"); }
}

export function saveCandidate(user: SessionUser, input: { headline?: string; skills?: string; experience?: string; education?: string; cvUrl?: string }): void {
  ensureReady();
  assertActive(user);
  run(
    `INSERT INTO candidate_profiles (id, user_id, headline, skills, experience, education, cv_url, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET headline = excluded.headline, skills = excluded.skills, experience = excluded.experience, education = excluded.education, cv_url = excluded.cv_url, updated_at = excluded.updated_at`,
    newId(), user.id, input.headline || null, input.skills || null, input.experience || null, input.education || null, input.cvUrl || null, new Date().toISOString(),
  );
}

export function listJobs(options: { withinDays?: number } = {}): Array<Record<string, unknown>> {
  ensureReady();
  const today = new Date().toISOString().slice(0, 10);
  if (options.withinDays && options.withinDays > 0) {
    const until = new Date(Date.now() + options.withinDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    return all("SELECT id, title, description, job_type, salary_min_cents, salary_max_cents, closing_date, location_id, employer_id FROM jobs WHERE status = 'published' AND deleted_at IS NULL AND closing_date IS NOT NULL AND closing_date >= ? AND closing_date <= ? ORDER BY closing_date", today, until);
  }
  return all("SELECT id, title, description, job_type, salary_min_cents, salary_max_cents, closing_date, location_id, employer_id FROM jobs WHERE status = 'published' AND deleted_at IS NULL AND (closing_date IS NULL OR closing_date >= ?) ORDER BY created_at DESC", today);
}

export function listApplications(userId: string): Array<Record<string, unknown>> {
  ensureReady();
  return all(
    `SELECT a.id, a.application_status as status, a.created_at, j.title, j.closing_date, j.id as job_id, j.status as job_status
     FROM job_applications a JOIN jobs j ON j.id = a.job_id
     WHERE a.applicant_id = ? ORDER BY a.created_at DESC`,
    userId,
  );
}

export function createCourse(user: SessionUser, input: { title: string; description: string; priceRands?: string }): { id: string; slug: string } {
  ensureReady();
  assertActive(user);
  requirePermission(user.id, "courses.create");
  const id = newId();
  const slug = uniqueSlug("courses", input.title);
  const stamp = new Date().toISOString();
  run("INSERT INTO courses (id, instructor_id, title, slug, description, price_cents, status, accredited, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'draft', 0, ?, ?)", id, user.id, input.title.trim(), slug, input.description.trim(), input.priceRands ? randsToCents(input.priceRands) : 0, stamp, stamp);
  return { id, slug };
}

export function addLesson(user: SessionUser, courseId: string, title: string, content: string): string {
  ensureReady();
  assertActive(user);
  const course = get<{ instructor_id: string }>("SELECT instructor_id FROM courses WHERE id = ?", courseId);
  if (!course || course.instructor_id !== user.id) throw new AppError(403, "Only the instructor can add lessons");
  const position = get<{ count: number }>("SELECT COUNT(*) as count FROM course_lessons WHERE course_id = ?", courseId)?.count ?? 0;
  const id = newId();
  run("INSERT INTO course_lessons (id, course_id, title, content_type, content_text, position) VALUES (?, ?, ?, 'text', ?, ?)", id, courseId, title.trim(), content.trim(), position);
  return id;
}

export function addQuiz(user: SessionUser, courseId: string, title: string, questions: Array<{ prompt: string; options: string[]; correctIndex: number }>): string {
  ensureReady();
  assertActive(user);
  const course = get<{ instructor_id: string }>("SELECT instructor_id FROM courses WHERE id = ?", courseId);
  if (!course || course.instructor_id !== user.id) throw new AppError(403, "Only the instructor can add a quiz");
  const id = newId();
  run("INSERT INTO course_assessments (id, course_id, title, pass_mark, position) VALUES (?, ?, ?, 70, 0)", id, courseId, title.trim());
  questions.forEach((question, index) => {
    run("INSERT INTO assessment_questions (id, assessment_id, prompt, options_json, correct_index, position) VALUES (?, ?, ?, ?, ?, ?)", newId(), id, question.prompt, JSON.stringify(question.options), question.correctIndex, index);
  });
  return id;
}

export function publishCourse(user: SessionUser, courseId: string): void {
  ensureReady();
  assertActive(user);
  const course = get<{ instructor_id: string; title: string; description: string; slug: string }>("SELECT instructor_id, title, description, slug FROM courses WHERE id = ?", courseId);
  if (!course || course.instructor_id !== user.id) throw new AppError(403, "Only the instructor can publish this course");
  if (!get("SELECT id FROM course_lessons WHERE course_id = ?", courseId)) throw new AppError(400, "Add at least one lesson");
  const stamp = new Date().toISOString();
  run("UPDATE courses SET status = 'published', updated_at = ? WHERE id = ?", stamp, courseId);
  indexDocument({ entityType: "course", entityId: course.slug, language: "en", title: course.title, body: course.description, publishedAt: stamp });
}

export function enrol(user: SessionUser, courseId: string): { enrolmentId: string; status: string } {
  ensureReady();
  assertActive(user);
  requirePermission(user.id, "courses.enrol");
  const course = get<{ price_cents: number }>("SELECT price_cents FROM courses WHERE id = ? AND status = 'published'", courseId);
  if (!course) throw new AppError(404, "Course not found");
  const existing = get<{ id: string; enrolment_status: string }>("SELECT id, enrolment_status FROM course_enrolments WHERE course_id = ? AND user_id = ?", courseId, user.id);
  if (existing) return { enrolmentId: existing.id, status: existing.enrolment_status };
  const id = newId();
  const status = course.price_cents > 0 ? "pending_payment" : "active";
  run("INSERT INTO course_enrolments (id, course_id, user_id, enrolment_status, progress, created_at) VALUES (?, ?, ?, ?, 0, ?)", id, courseId, user.id, status, new Date().toISOString());
  return { enrolmentId: id, status };
}

export function completeLesson(user: SessionUser, lessonId: string): number {
  ensureReady();
  assertActive(user);
  const lesson = get<{ course_id: string }>("SELECT course_id FROM course_lessons WHERE id = ?", lessonId);
  if (!lesson) throw new AppError(404, "Lesson not found");
  const enrolment = get<{ id: string; enrolment_status: string }>("SELECT id, enrolment_status FROM course_enrolments WHERE course_id = ? AND user_id = ?", lesson.course_id, user.id);
  if (!enrolment || enrolment.enrolment_status !== "active") throw new AppError(403, "Enrol before opening lessons");
  run("INSERT OR IGNORE INTO course_progress (id, enrolment_id, lesson_id, completed_at) VALUES (?, ?, ?, ?)", newId(), enrolment.id, lessonId, new Date().toISOString());
  const total = get<{ count: number }>("SELECT COUNT(*) as count FROM course_lessons WHERE course_id = ?", lesson.course_id)?.count ?? 1;
  const done = get<{ count: number }>("SELECT COUNT(*) as count FROM course_progress WHERE enrolment_id = ?", enrolment.id)?.count ?? 0;
  const progress = Math.round((done / total) * 100);
  run("UPDATE course_enrolments SET progress = ? WHERE id = ?", progress, enrolment.id);
  return progress;
}

export function submitQuiz(user: SessionUser, assessmentId: string, answers: number[]): { score: number; passed: boolean } {
  ensureReady();
  assertActive(user);
  const questions = all<{ correct_index: number }>("SELECT correct_index FROM assessment_questions WHERE assessment_id = ? ORDER BY position", assessmentId);
  const assessment = get<{ pass_mark: number; course_id: string }>("SELECT pass_mark, course_id FROM course_assessments WHERE id = ?", assessmentId);
  if (!assessment || !questions.length) throw new AppError(404, "Quiz not found");
  if (!get("SELECT id FROM course_enrolments WHERE course_id = ? AND user_id = ? AND enrolment_status = 'active'", assessment.course_id, user.id)) throw new AppError(403, "Enrol before taking the quiz");
  const correct = questions.filter((question, index) => answers[index] === question.correct_index).length;
  const score = Math.round((correct / questions.length) * 100);
  const passed = score >= assessment.pass_mark;
  run("INSERT INTO course_results (id, assessment_id, user_id, score, passed, created_at) VALUES (?, ?, ?, ?, ?, ?)", newId(), assessmentId, user.id, score, passed ? 1 : 0, new Date().toISOString());
  return { score, passed };
}

export function issueCertificate(user: SessionUser, courseId: string): { number: string } {
  ensureReady();
  assertActive(user);
  const enrolment = get<{ progress: number; enrolment_status: string }>("SELECT progress, enrolment_status FROM course_enrolments WHERE course_id = ? AND user_id = ?", courseId, user.id);
  if (!enrolment || enrolment.enrolment_status !== "active" || enrolment.progress < 100) throw new AppError(400, "Finish every lesson first");
  const quizzes = all<{ id: string }>("SELECT id FROM course_assessments WHERE course_id = ?", courseId);
  for (const quiz of quizzes) {
    if (!get("SELECT id FROM course_results WHERE assessment_id = ? AND user_id = ? AND passed = 1", quiz.id, user.id)) throw new AppError(400, "Pass the quiz before a completion record is issued");
  }
  const existing = get<{ certificate_number: string }>("SELECT certificate_number FROM course_certificates WHERE course_id = ? AND user_id = ?", courseId, user.id);
  if (existing) return { number: existing.certificate_number };
  const number = `RT-${new Date().getFullYear()}-${newId().slice(0, 8).toUpperCase()}`;
  run("INSERT INTO course_certificates (id, course_id, user_id, certificate_number, issued_at) VALUES (?, ?, ?, ?, ?)", newId(), courseId, user.id, number, new Date().toISOString());
  return { number };
}

export function listCourses(): Array<Record<string, unknown>> {
  ensureReady();
  return all("SELECT id, title, slug, description, price_cents, accredited FROM courses WHERE status = 'published' AND deleted_at IS NULL ORDER BY created_at DESC");
}

export function getCourse(slug: string, userId?: string | null): Record<string, unknown> | null {
  ensureReady();
  const course = get<Record<string, unknown>>("SELECT * FROM courses WHERE (slug = ? OR id = ?) AND status = 'published'", slug, slug);
  if (!course) return null;
  const enrolled = userId ? get<Record<string, unknown>>("SELECT id, enrolment_status, progress FROM course_enrolments WHERE course_id = ? AND user_id = ? AND enrolment_status = 'active'", course.id, userId) : null;
  const lessons = enrolled
    ? all("SELECT id, title, content_text, position FROM course_lessons WHERE course_id = ? ORDER BY position", course.id)
    : all("SELECT id, title, position FROM course_lessons WHERE course_id = ? ORDER BY position", course.id);
  return { ...course, lessons, quizzes: all("SELECT id, title, pass_mark FROM course_assessments WHERE course_id = ?", course.id), enrolment: enrolled };
}

export function publicQuiz(assessmentId: string): Array<{ id: string; prompt: string; options: string[] }> {
  ensureReady();
  return all<{ id: string; prompt: string; options_json: string }>("SELECT id, prompt, options_json FROM assessment_questions WHERE assessment_id = ? ORDER BY position", assessmentId).map((row) => ({ id: row.id, prompt: row.prompt, options: JSON.parse(row.options_json) as string[] }));
}

export function createEvent(user: SessionUser, input: { title: string; description: string; category: string; start: string; venue?: string; locationId?: string | null }, options: { publish?: boolean } = {}): { id: string; slug: string } {
  ensureReady();
  assertActive(user);
  requirePermission(user.id, "events.create");
  const goLive = Boolean(options.publish && canPublishSection(user, "events"));
  const id = newId();
  const slug = uniqueSlug("events", input.title);
  const stamp = new Date().toISOString();
  run("INSERT INTO events (id, organiser_id, title, slug, description, category, location_id, venue, start_at, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", id, user.id, input.title.trim(), slug, input.description.trim(), input.category, input.locationId || null, input.venue || null, input.start, goLive ? "published" : "pending", stamp, stamp);
  if (goLive) {
    indexDocument({ entityType: "event", entityId: slug, language: "en", title: input.title.trim(), body: input.description.trim(), publishedAt: input.start });
    fanout("events", input.title.trim(), input.description.trim().slice(0, 180), `/events/${slug}`, input.locationId || null);
  }
  return { id, slug };
}

export function publishEvent(user: SessionUser, id: string): void {
  ensureReady();
  assertActive(user);
  const event = get<{ title: string; description: string; slug: string; location_id: string | null; start_at: string; organiser_id: string }>("SELECT title, description, slug, location_id, start_at, organiser_id FROM events WHERE id = ?", id);
  if (!event) throw new AppError(404, "Event not found");
  if (!hasPermission(user.id, "events.manage") && !(canPublishSection(user, "events") && event.organiser_id === user.id)) {
    throw new AppError(403, "You do not have permission to do that");
  }
  run("UPDATE events SET status = 'published', updated_at = ? WHERE id = ?", new Date().toISOString(), id);
  indexDocument({ entityType: "event", entityId: event.slug, language: "en", title: event.title, body: event.description, publishedAt: event.start_at });
  fanout("events", event.title, event.description.slice(0, 180), `/events/${event.slug}`, event.location_id);
}

export function registerForEvent(user: SessionUser, eventId: string): void {
  ensureReady();
  assertActive(user);
  if (!get("SELECT id FROM events WHERE id = ? AND status = 'published'", eventId)) throw new AppError(404, "Event not found");
  try { run("INSERT INTO event_registrations (id, event_id, user_id, registration_status, created_at) VALUES (?, ?, ?, 'registered', ?)", newId(), eventId, user.id, new Date().toISOString()); }
  catch { throw new AppError(409, "You are already registered"); }
}

export function listEvents(): Array<Record<string, unknown>> {
  ensureReady();
  return all("SELECT id, title, slug, description, category, venue, start_at, location_id FROM events WHERE status = 'published' AND deleted_at IS NULL ORDER BY start_at");
}

export function publicMap(): Array<Record<string, unknown>> {
  ensureReady();
  return all(
    `SELECT id, title, summary, category, latitude, longitude, source_name, source_type, source_id, verification_status, created_at, expires_at
     FROM map_points WHERE verification_status = 'verified' AND moderation_status = 'approved' AND sensitive = 0
       AND (expires_at IS NULL OR expires_at > ?) ORDER BY created_at DESC`,
    new Date().toISOString(),
  );
}

export function reportMapPoint(user: SessionUser, pointId: string, note: string): void {
  ensureReady();
  assertActive(user);
  const clean = note.trim();
  if (clean.length < 8 || clean.length > 500) throw new AppError(400, "Describe what is incorrect");
  if (!get("SELECT id FROM map_points WHERE id = ?", pointId)) throw new AppError(404, "Place not found");
  run("INSERT INTO map_reports (id, point_id, reporter_id, note, status, created_at) VALUES (?, ?, ?, ?, 'open', ?)", newId(), pointId, user.id, clean, new Date().toISOString());
  audit(user.id, "map.report", "map_point", pointId);
}
