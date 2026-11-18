import { hashPassword, randomToken } from "./crypto";
import { all, get, newId, run, writeBootstrapSecret } from "./db";
import { syncAccessCatalog, grantRole } from "./permissions";
import { indexDocument, putSetting } from "./store";

const NEWS = [
  ["Breaking news", "breaking-news"],
  ["Local news", "local-news"],
  ["Municipal", "municipal"],
  ["Crime and safety", "crime-safety"],
  ["Traffic", "traffic"],
  ["Business and mining", "business-mining"],
  ["Education", "education"],
  ["Sports", "sports"],
  ["Health", "health"],
  ["Politics", "politics"],
  ["Investigations", "investigations"],
  ["Opinion", "opinion"],
  ["Community", "community"],
  ["Announcements", "announcements"],
];

const PLACES: Array<[string, string, string, number, number]> = [
  ["Rustenburg", "rustenburg", "city", -25.6544, 27.2429],
  ["CBD", "cbd", "neighbourhood", -25.6705, 27.242],
  ["Tlhabane", "tlhabane", "neighbourhood", -25.651, 27.215],
  ["Boitekong", "boitekong", "neighbourhood", -25.62, 27.29],
  ["Phokeng", "phokeng", "neighbourhood", -25.58, 27.16],
  ["Geelhoutpark", "geelhoutpark", "neighbourhood", -25.69, 27.25],
  ["Cashan", "cashan", "neighbourhood", -25.685, 27.255],
  ["Protea Park", "protea-park", "neighbourhood", -25.675, 27.23],
  ["Zinniaville", "zinniaville", "neighbourhood", -25.66, 27.21],
  ["Karlienpark", "karlienpark", "neighbourhood", -25.688, 27.235],
  ["Freedom Park", "freedom-park", "neighbourhood", -25.64, 27.27],
  ["Meriting", "meriting", "neighbourhood", -25.63, 27.22],
  ["Paardekraal", "paardekraal", "neighbourhood", -25.66, 27.26],
  ["Lefaragatlhe", "lefaragatlhe", "neighbourhood", -25.595, 27.18],
];

function seedCountry(): void {
  const country = locate("South Africa", "south-africa", "country", null, -29, 24);
  const provinces: Array<[string, string, number, number]> = [
    ["Eastern Cape", "eastern-cape", -32.2, 26.4],
    ["Free State", "free-state", -28.5, 26.8],
    ["Gauteng", "gauteng", -26.2, 28.0],
    ["KwaZulu-Natal", "kwazulu-natal", -29.0, 30.5],
    ["Limpopo", "limpopo", -23.9, 29.4],
    ["Mpumalanga", "mpumalanga", -25.6, 30.5],
    ["Northern Cape", "northern-cape", -29.0, 21.8],
    ["North West", "north-west", -26.6, 25.3],
    ["Western Cape", "western-cape", -33.2, 21.9],
  ];
  const ids = new Map(provinces.map(([name, slug, lat, lng]) => [slug, locate(name, slug, "province", country, lat, lng)]));
  const cities: Array<[string, string, string, number, number]> = [
    ["eastern-cape", "Gqeberha", "gqeberha", -33.96, 25.6],
    ["free-state", "Bloemfontein", "bloemfontein", -29.12, 26.21],
    ["gauteng", "Johannesburg", "johannesburg", -26.2, 28.04],
    ["gauteng", "Pretoria", "pretoria", -25.75, 28.19],
    ["kwazulu-natal", "Durban", "durban", -29.86, 31.02],
    ["limpopo", "Polokwane", "polokwane", -23.9, 29.45],
    ["mpumalanga", "Mbombela", "mbombela", -25.47, 30.97],
    ["northern-cape", "Kimberley", "kimberley", -28.73, 24.76],
    ["north-west", "Mahikeng", "mahikeng", -25.86, 25.64],
    ["western-cape", "Cape Town", "cape-town", -33.92, 18.42],
  ];
  for (const [province, name, slug, lat, lng] of cities) locate(name, slug, "city", ids.get(province) || null, lat, lng);
  const municipality = locate("Bojanala Platinum", "bojanala-platinum", "municipality", ids.get("north-west") || null, -25.6, 27.2);
  const city = get<{ id: string }>("SELECT id FROM locations WHERE slug = 'rustenburg'");
  if (city) run("UPDATE locations SET parent_location_id = ?, location_type = 'city' WHERE id = ? AND parent_location_id IS NULL", municipality, city.id);
}

function locate(name: string, slug: string, kind: string, parent: string | null, lat: number, lng: number): string {
  const existing = get<{ id: string }>("SELECT id FROM locations WHERE slug = ?", slug);
  if (existing) return existing.id;
  const id = newId();
  run("INSERT INTO locations (id, name, slug, location_type, parent_location_id, latitude, longitude, active) VALUES (?, ?, ?, ?, ?, ?, ?, 1)", id, name, slug, kind, parent, lat, lng);
  return id;
}

function ensureNamed(table: string, name: string, slug: string, extraSql = "", extra: Array<string | number | null> = []): string {
  const existing = get<{ id: string }>(`SELECT id FROM ${table} WHERE slug = ?`, slug);
  if (existing) return existing.id;
  const id = newId();
  run(`INSERT INTO ${table} (id, name, slug${extraSql}) VALUES (?, ?, ?${extra.length ? `, ${extra.map(() => "?").join(", ")}` : ""})`, id, name, slug, ...extra);
  return id;
}

export function seedDatabase(): void {
  syncAccessCatalog();
  const cityId = (() => {
    const existing = get<{ id: string }>("SELECT id FROM locations WHERE slug = 'rustenburg'");
    if (existing) return existing.id;
    const id = newId();
    run("INSERT INTO locations (id, name, slug, location_type, latitude, longitude, active) VALUES (?, 'Rustenburg', 'rustenburg', 'city', -25.6544, 27.2429, 1)", id);
    return id;
  })();
  for (const [name, slug, kind, lat, lng] of PLACES) {
    if (slug === "rustenburg") continue;
    if (get("SELECT id FROM locations WHERE slug = ?", slug)) continue;
    run("INSERT INTO locations (id, name, slug, location_type, parent_location_id, latitude, longitude, active) VALUES (?, ?, ?, ?, ?, ?, ?, 1)", newId(), name, slug, kind, cityId, lat, lng);
  }
  seedCountry();
  for (const [name, slug] of NEWS) {
    if (!get("SELECT id FROM article_categories WHERE slug = ?", slug)) run("INSERT INTO article_categories (id, name, slug, description) VALUES (?, ?, ?, ?)", newId(), name, slug, name);
  }
  const businessCats = ["Retail", "Mining", "Food", "Professional services", "Health", "Trades", "Education", "Hospitality", "Salons and barbers", "Beauty", "Repairs"];
  for (const name of businessCats) {
    const slug = name.toLowerCase().replace(/[^a-z]+/g, "-");
    if (!get("SELECT id FROM business_categories WHERE slug = ?", slug)) run("INSERT INTO business_categories (id, name, slug) VALUES (?, ?, ?)", newId(), name, slug);
  }
  const market = ["Electronics", "Phones", "Computers", "Appliances", "Clothing", "Shoes", "Furniture", "Home", "Vehicles", "Property", "Food", "Bakers", "Catering", "Handmade", "Second-hand", "Agriculture", "Books", "Salons", "Barbers", "Beauty", "Repairs", "Services"];
  for (const name of market) {
    const slug = name.toLowerCase();
    if (!get("SELECT id FROM marketplace_categories WHERE slug = ?", slug)) run("INSERT INTO marketplace_categories (id, name, slug) VALUES (?, ?, ?)", newId(), name, slug);
  }
  const courses = ["Computer literacy", "Coding", "Entrepreneurship", "CV writing", "Languages", "Financial literacy"];
  for (const name of courses) {
    const slug = name.toLowerCase().replace(/[^a-z]+/g, "-");
    if (!get("SELECT id FROM course_categories WHERE slug = ?", slug)) run("INSERT INTO course_categories (id, name, slug) VALUES (?, ?, ?)", newId(), name, slug);
  }
  const products: Array<[string, string, number, string]> = [
    ["Homepage banner", "homepage-banner", 250000, "A banner on the homepage."],
    ["Category banner", "category-banner", 150000, "A banner on a category page."],
    ["Sponsored article", "sponsored-article", 350000, "A clearly labelled sponsored article."],
    ["Sponsored business", "sponsored-business", 200000, "A featured business profile."],
    ["Video advertising", "video-advertising", 400000, "A placement beside video."],
    ["Podcast sponsorship", "podcast-sponsorship", 300000, "A mention or placement on a podcast."],
    ["Job advertising", "job-advertising", 80000, "Extra placement for a vacancy."],
    ["Event advertising", "event-advertising", 80000, "Extra placement for an event."],
    ["Marketplace promotion", "marketplace-promotion", 60000, "A featured listing."],
    ["Newsletter sponsorship", "newsletter-sponsorship", 180000, "A placement in the daily briefing email."],
    ["Sponsored community", "sponsored-community", 50000, "A clearly labelled community placement."],
  ];
  for (const [name, placement, price, description] of products) {
    if (!get("SELECT id FROM advertising_products WHERE placement = ?", placement)) {
      run("INSERT INTO advertising_products (id, name, placement, pricing_model, price_cents, currency, description, active) VALUES (?, ?, ?, 'flat', ?, 'ZAR', ?, 1)", newId(), name, placement, price, description);
    }
  }
  if (!get("SELECT id FROM radio_stations LIMIT 1")) {
    run(
      "INSERT INTO radio_stations (id, name, description, stream_url, status, rights_note) VALUES (?, 'Rustenburg Today Radio', 'The city station. A live stream plays only after a licensed address is saved by an administrator.', NULL, 'offline', 'Do not broadcast music or programmes you do not have the rights to use.')",
      newId(),
    );
  }
  putSetting("registration_open", "true");
  putSetting("site_name", "Rustenburg Today");
  putSetting("payment_mode", "disabled");

  if (!get("SELECT u.id FROM users u JOIN user_roles ur ON ur.user_id = u.id JOIN roles r ON r.id = ur.role_id WHERE r.name = 'administrator' AND u.status != 'deleted'")) {
    const email = (process.env.ADMIN_EMAIL || "admin@rustenburg.today").toLowerCase();
    const password = process.env.ADMIN_PASSWORD || randomToken(18);
    const userId = newId();
    const stamp = new Date().toISOString();
    run("INSERT INTO users (id, auth_user_id, email, password_hash, email_verified_at, status, is_minor, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'active', 0, ?, ?)", userId, userId, email, hashPassword(password), stamp, stamp, stamp);
    run("INSERT INTO profiles (id, user_id, display_name, username, preferred_language, visibility, biography, created_at, updated_at) VALUES (?, ?, 'Rustenburg Today Desk', 'citydesk', 'en', 'public', 'Editorial desk for Rustenburg Today.', ?, ?)", newId(), userId, stamp, stamp);
    run("INSERT INTO user_preferences (user_id, theme, language, notification_settings, privacy_settings) VALUES (?, 'light', 'en', '{}', '{\"messagePolicy\":\"connections\"}')", userId);
    run("INSERT INTO rewards_accounts (user_id, balance, updated_at) VALUES (?, 0, ?)", userId, stamp);
    grantRole(userId, "administrator");
    if (!process.env.ADMIN_PASSWORD && process.env.NODE_ENV !== "test") {
      writeBootstrapSecret("bootstrap-admin.txt", `email=${email}\npassword=${password}\nThis file is created once. Change the password after signing in.\n`);
    }
    if (process.env.SEED_DEMO !== "false" && process.env.NODE_ENV !== "test") seedDemo(userId);
  }
  void all;
  void ensureNamed;
}

function seedDemo(authorId: string): void {
  if (get("SELECT id FROM articles WHERE slug = 'how-the-digital-city-works'")) return;
  const category = get<{ id: string }>("SELECT id FROM article_categories WHERE slug = 'local-news'");
  if (!category) return;
  const id = newId();
  const stamp = new Date().toISOString();
  run(
    "INSERT INTO articles (id, author_id, category_id, slug, status, editorial_review_status, published_at, is_featured, is_demo, reading_minutes, created_at, updated_at) VALUES (?, ?, ?, 'how-the-digital-city-works', 'published', 'approved', ?, 1, 1, 2, ?, ?)",
    id,
    authorId,
    category.id,
    stamp,
    stamp,
    stamp,
  );
  const versions: Array<[string, string, string, string]> = [
    ["en", "How the digital city works (demonstration)", "A labelled demonstration story about using Rustenburg Today. It is not a news report.", "This is demonstration copy, written so the newsroom, search and language fallback can be tried. It is not a report of something that happened in the city. Rustenburg Today keeps one account for news, community, work, learning and local trade. Listings stay unpublished until a person with the right permission reviews them. Orders stay unpaid until a payment provider confirms them to the server."],
    ["af", "Hoe die digitale stad werk (demonstrasie)", "’n Gemerkte demonstrasiestorie oor die gebruik van Rustenburg Today. Dit is nie ’n nuusberig nie.", "Hierdie is demonstrasie-teks, geskryf sodat die nuuskamer, soektog en taal-terugval getoets kan word. Dit is nie ’n berig oor iets wat in die stad gebeur het nie. Rustenburg Today hou een rekening vir nuus, gemeenskap, werk, leer en plaaslike handel."],
    ["tn", "Ka fa toropo ya dijithale e dirang ka teng (pontsho)", "Kanego ya pontsho ka go dirisa Rustenburg Today. Ga se pegelo ya dikgang.", "Se ke mokwalo wa pontsho, o o kwadilweng gore phaposi ya dikgang, patlo le puo di ka lekilwe. Ga se pegelo ya selo se se diragetseng mo toropong. Rustenburg Today e tshwara akhaonto e le nngwe ya dikgang, setšhaba, ditiro, thuto le kgwebo ya selegae."],
  ];
  for (const [language, title, excerpt, body] of versions) {
    run("INSERT INTO article_translations (id, article_id, language_code, title, excerpt, body, meta_title, meta_description, review_status, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'approved', ?)", newId(), id, language, title, excerpt, body, title, excerpt, stamp);
    indexDocument({ entityType: "article", entityId: "how-the-digital-city-works", language, title, body: `${excerpt}\n${body}`, publishedAt: stamp, popularity: 2 });
  }
  run("INSERT INTO article_sources (id, article_id, source_name, source_url, attribution) VALUES (?, ?, 'Rustenburg Today desk', NULL, 'Demonstration copy, not an external report')", newId(), id);
  const podcastId = newId();
  run("INSERT INTO podcasts (id, creator_id, title, slug, description, programme_key, status, is_demo, created_at, updated_at) VALUES (?, ?, 'The Rustenburg Talk', 'the-rustenburg-talk', 'A demonstration programme shell. Replace it with a real episode when you have the rights.', 'the-rustenburg-talk', 'published', 1, ?, ?)", podcastId, authorId, stamp, stamp);
  run("INSERT INTO podcast_episodes (id, podcast_id, title, slug, description, audio_url, transcript, duration_seconds, download_allowed, published_at, status, is_demo, created_at, updated_at) VALUES (?, ?, 'Demonstration tone', 'demonstration-tone', 'A short generated tone so the player can be tested offline. It is not a broadcast.', '/audio/demo-tone.wav', 'Demonstration. This is a generated tone, not a programme.', 1, 1, ?, 'published', 1, ?, ?)", newId(), podcastId, stamp, stamp, stamp);
}
