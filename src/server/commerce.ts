import { randsToCents, slugify } from "@/lib/text";
import type { SessionUser } from "./auth";
import { assertActive } from "./auth";
import { sha256 } from "./crypto";
import { all, get, newId, run, transaction } from "./db";
import { AppError } from "./errors";
import { ensureReady } from "./init";
import { canPublishSection } from "./departments";
import { requirePermission } from "./permissions";
import { audit, indexDocument, removeIndex, track } from "./store";
import { uniqueSlug } from "./editorial";
import { notify } from "./alerts";
import { openEnquiry } from "./engage";

function cents(value: string): number {
  try {
    return randsToCents(value);
  } catch (error) {
    throw new AppError(400, error instanceof Error ? error.message : "Invalid amount");
  }
}

export function registerBusiness(user: SessionUser, input: { name: string; description: string; categorySlug?: string; locationId?: string | null; phone?: string; address?: string; website?: string }, options: { publish?: boolean } = {}): { id: string; slug: string } {
  ensureReady();
  assertActive(user);
  requirePermission(user.id, "business.create");
  if (input.name.trim().length < 2 || input.description.trim().length < 12) throw new AppError(400, "Add the business name and what it does");
  const category = input.categorySlug ? get<{ id: string }>("SELECT id FROM business_categories WHERE slug = ?", input.categorySlug) : undefined;
  const goLive = Boolean(options.publish && canPublishSection(user, "business"));
  const id = newId();
  const slug = uniqueSlug("businesses", input.name);
  const stamp = new Date().toISOString();
  run(
    `INSERT INTO businesses (id, owner_id, name, slug, description, category_id, location_id, address, phone, website, verification_status, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    user.id,
    input.name.trim(),
    slug,
    input.description.trim(),
    category?.id || null,
    input.locationId || null,
    input.address || null,
    input.phone || null,
    input.website || null,
    goLive ? "verified" : "unverified",
    goLive ? "published" : "pending",
    stamp,
    stamp,
  );
  if (goLive) indexDocument({ entityType: "business", entityId: slug, language: "en", title: input.name.trim(), body: input.description.trim(), publishedAt: stamp });
  audit(user.id, goLive ? "business.publish" : "business.create", "business", id);
  return { id, slug };
}

export function verifyBusiness(user: SessionUser, id: string, approve: boolean): void {
  ensureReady();
  assertActive(user);
  requirePermission(user.id, "business.verify");
  const business = get<{ name: string; description: string; slug: string }>("SELECT name, description, slug FROM businesses WHERE id = ?", id);
  if (!business) throw new AppError(404, "Business not found");
  const stamp = new Date().toISOString();
  run("UPDATE businesses SET verification_status = ?, status = ?, updated_at = ? WHERE id = ?", approve ? "verified" : "rejected", approve ? "published" : "rejected", stamp, id);
  if (approve) indexDocument({ entityType: "business", entityId: business.slug, language: "en", title: business.name, body: business.description, publishedAt: stamp });
  audit(user.id, approve ? "business.verify" : "business.reject", "business", id);
}

export function setBusinessHours(user: SessionUser, businessId: string, weekday: number, open: string, close: string): void {
  ensureReady();
  assertActive(user);
  const business = get<{ owner_id: string }>("SELECT owner_id FROM businesses WHERE id = ?", businessId);
  if (!business) throw new AppError(404, "Business not found");
  if (business.owner_id !== user.id) requirePermission(user.id, "business.verify");
  run(
    `INSERT INTO business_hours (id, business_id, weekday, opening_time, closing_time) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(business_id, weekday) DO UPDATE SET opening_time = excluded.opening_time, closing_time = excluded.closing_time`,
    newId(),
    businessId,
    weekday,
    open,
    close,
  );
}

export function reviewBusiness(user: SessionUser, businessId: string, rating: number, body: string): void {
  ensureReady();
  assertActive(user);
  if (rating < 1 || rating > 5) throw new AppError(400, "Rate from 1 to 5");
  const business = get<{ owner_id: string }>("SELECT owner_id FROM businesses WHERE id = ? AND status = 'published'", businessId);
  if (!business) throw new AppError(404, "Business not found");
  if (business.owner_id === user.id) throw new AppError(400, "You cannot review your own business");
  run(
    `INSERT INTO business_reviews (id, business_id, user_id, rating, body, status, created_at) VALUES (?, ?, ?, ?, ?, 'published', ?)
     ON CONFLICT(business_id, user_id) DO UPDATE SET rating = excluded.rating, body = excluded.body`,
    newId(),
    businessId,
    user.id,
    rating,
    body.trim().slice(0, 1000),
    new Date().toISOString(),
  );
  const summary = get<{ avg: number; count: number }>("SELECT AVG(rating) as avg, COUNT(*) as count FROM business_reviews WHERE business_id = ? AND status = 'published'", businessId);
  run("UPDATE businesses SET rating_avg = ?, rating_count = ? WHERE id = ?", summary?.avg || 0, summary?.count || 0, businessId);
}

export function listBusinesses(category?: string): Array<Record<string, unknown>> {
  ensureReady();
  if (!category) return all("SELECT id, name, slug, description, phone, verification_status, rating_avg, rating_count, featured FROM businesses WHERE status = 'published' AND deleted_at IS NULL ORDER BY featured DESC, name");
  return all(
    `SELECT b.id, b.name, b.slug, b.description, b.phone, b.verification_status, b.rating_avg, b.rating_count, b.featured
     FROM businesses b JOIN business_categories c ON c.id = b.category_id
     WHERE b.status = 'published' AND b.deleted_at IS NULL AND c.slug = ? ORDER BY b.name`,
    category,
  );
}

export function getBusiness(slug: string): Record<string, unknown> | null {
  ensureReady();
  const business = get<Record<string, unknown>>("SELECT * FROM businesses WHERE (slug = ? OR id = ?) AND status = 'published' AND deleted_at IS NULL", slug, slug);
  if (!business) return null;
  const place = business.location_id ? get<{ latitude: number | null; longitude: number | null; name: string }>("SELECT latitude, longitude, name FROM locations WHERE id = ?", business.location_id) : undefined;
  return {
    ...business,
    hours: all("SELECT weekday, opening_time, closing_time FROM business_hours WHERE business_id = ? ORDER BY weekday", business.id),
    reviews: all("SELECT r.rating, r.body, r.created_at, p.display_name FROM business_reviews r JOIN profiles p ON p.user_id = r.user_id WHERE r.business_id = ? AND r.status = 'published' ORDER BY r.created_at DESC", business.id),
    latitude: place?.latitude ?? null,
    longitude: place?.longitude ?? null,
    place_name: place?.name ?? null,
  };
}

export function createCampaign(user: SessionUser, input: { productPlacement: string; businessId?: string; title: string; destinationUrl?: string; start: string; end: string; budgetRands: string; altText: string; mediaUrl: string; kind?: string; targetCategory?: string; targetLocationId?: string; frequencyHours?: number }): string {
  ensureReady();
  assertActive(user);
  requirePermission(user.id, "advertising.create");
  const product = get<{ id: string; price_cents: number }>("SELECT id, price_cents FROM advertising_products WHERE placement = ? AND active = 1", input.productPlacement);
  if (!product) throw new AppError(400, "Choose an advertising product");
  const restricted = get<{ rule: string }>("SELECT rule FROM ad_restrictions WHERE lower(category) = lower(?)", input.kind || "general");
  if (restricted?.rule === "prohibited") throw new AppError(400, "This advertising category is not accepted");
  if (!input.mediaUrl.trim() || input.altText.trim().length < 3) throw new AppError(400, "Add the creative and a description of the image");
  const id = newId();
  const stamp = new Date().toISOString();
  transaction(() => {
    run(
      `INSERT INTO advertising_campaigns (id, advertiser_id, business_id, product_id, title, destination_url, start_date, end_date, budget_cents, status, approval_status, payment_status, campaign_kind, target_category, target_location_id, frequency_hours, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'submitted', 'pending', 'unpaid', ?, ?, ?, ?, ?, ?)`,
      id,
      user.id,
      input.businessId || null,
      product.id,
      input.title.trim(),
      input.destinationUrl || null,
      input.start,
      input.end,
      cents(input.budgetRands),
      input.kind || "general",
      input.targetCategory || null,
      input.targetLocationId || null,
      input.frequencyHours || 24,
      stamp,
      stamp,
    );
    run("INSERT INTO advertising_creatives (id, campaign_id, media_url, destination_url, alt_text, status) VALUES (?, ?, ?, ?, ?, 'pending')", newId(), id, input.mediaUrl.trim(), input.destinationUrl || null, input.altText.trim());
  });
  audit(user.id, "campaign.create", "campaign", id);
  return id;
}

export function reviewCampaign(user: SessionUser, id: string, approve: boolean): void {
  ensureReady();
  assertActive(user);
  requirePermission(user.id, "advertising.manage");
  run(
    "UPDATE advertising_campaigns SET approval_status = ?, status = ?, updated_at = ? WHERE id = ?",
    approve ? "approved" : "rejected",
    approve ? "approved" : "rejected",
    new Date().toISOString(),
    id,
  );
  run("UPDATE advertising_creatives SET status = ? WHERE campaign_id = ?", approve ? "approved" : "rejected", id);
  audit(user.id, approve ? "campaign.approve" : "campaign.reject", "campaign", id);
}

export function verifyCampaignPayment(user: SessionUser, id: string, providerReference: string): void {
  ensureReady();
  assertActive(user);
  requirePermission(user.id, "payments.reconcile");
  const campaign = get<{ advertiser_id: string; budget_cents: number; approval_status: string }>("SELECT advertiser_id, budget_cents, approval_status FROM advertising_campaigns WHERE id = ?", id);
  if (!campaign) throw new AppError(404, "Campaign not found");
  if (campaign.approval_status !== "approved") throw new AppError(400, "Approve the campaign before recording payment");
  const stamp = new Date().toISOString();
  const paymentId = newId();
  transaction(() => {
    run(
      "INSERT INTO payments (id, user_id, reference_type, reference_id, provider, provider_reference, amount_cents, status, verified_at, created_at) VALUES (?, ?, 'campaign', ?, 'manual', ?, ?, 'verified', ?, ?)",
      paymentId,
      campaign.advertiser_id,
      id,
      providerReference,
      campaign.budget_cents,
      stamp,
      stamp,
    );
    run("UPDATE advertising_campaigns SET payment_status = 'verified', status = 'live', updated_at = ? WHERE id = ?", stamp, id);
  });
  audit(user.id, "campaign.payment.verify", "campaign", id, { providerReference });
}

export function liveCampaigns(placement: string): Array<Record<string, unknown>> {
  ensureReady();
  const today = new Date().toISOString().slice(0, 10);
  return all(
    `SELECT c.id, c.title, cr.media_url, cr.alt_text, cr.destination_url, p.placement
     FROM advertising_campaigns c
     JOIN advertising_products p ON p.id = c.product_id
     JOIN advertising_creatives cr ON cr.campaign_id = c.id
     WHERE p.placement = ? AND c.approval_status = 'approved' AND c.payment_status IN ('verified', 'waived')
       AND c.status = 'live' AND cr.status = 'approved' AND c.start_date <= ? AND c.end_date >= ?`,
    placement,
    today,
    today,
  );
}

export function recordAdEvent(campaignId: string, eventType: "impression" | "click", options?: { viewerKey?: string; viewable?: boolean }): { destination: string | null; recorded: boolean } {
  ensureReady();
  const live = get<{ destination_url: string | null }>(
    `SELECT c.destination_url FROM advertising_campaigns c
     WHERE c.id = ? AND c.status = 'live' AND c.approval_status = 'approved' AND c.payment_status IN ('verified', 'waived')`,
    campaignId,
  );
  if (!live) throw new AppError(404, "Campaign is not live");
  if (eventType === "impression" && options?.viewable !== true) return { destination: live.destination_url, recorded: false };
  const viewer = (options?.viewerKey || "anonymous").slice(0, 80);
  const day = new Date().toISOString().slice(0, 10);
  const dedupe = sha256(`${campaignId}|${viewer}|${eventType}|${day}`);
  try {
    run(
      "INSERT INTO advertising_events (id, campaign_id, event_type, occurred_at, viewer_key, viewable, dedupe_key) VALUES (?, ?, ?, ?, ?, ?, ?)",
      newId(),
      campaignId,
      eventType,
      new Date().toISOString(),
      viewer,
      eventType === "impression" ? 1 : 0,
      dedupe,
    );
  } catch {
    return { destination: live.destination_url, recorded: false };
  }
  track(`ad.${eventType}`, "campaign", campaignId, null);
  return { destination: live.destination_url, recorded: true };
}

export function eligiblePopup(viewerKey: string, consent: boolean): Record<string, unknown> | null {
  ensureReady();
  if (!consent || viewerKey.length < 8) return null;
  const today = new Date().toISOString().slice(0, 10);
  const campaign = get<Record<string, unknown>>(
    `SELECT c.id, c.title, cr.alt_text, cr.destination_url, c.frequency_hours
     FROM advertising_campaigns c
     JOIN advertising_products p ON p.id = c.product_id
     JOIN advertising_creatives cr ON cr.campaign_id = c.id
     WHERE p.placement = 'popup' AND c.approval_status = 'approved' AND c.payment_status IN ('verified', 'waived')
       AND c.status = 'live' AND cr.status = 'approved' AND c.start_date <= ? AND c.end_date >= ?
     ORDER BY c.updated_at DESC LIMIT 1`,
    today,
    today,
  );
  if (!campaign) return null;
  const hours = Number(campaign.frequency_hours || 24);
  const since = new Date(Date.now() - hours * 3600 * 1000).toISOString();
  const recent = get("SELECT id FROM ad_popup_log WHERE campaign_id = ? AND viewer_key = ? AND shown_at > ?", String(campaign.id), viewerKey, since);
  if (recent) return null;
  return campaign;
}

export function markPopupShown(campaignId: string, viewerKey: string): void {
  ensureReady();
  run("INSERT INTO ad_popup_log (id, campaign_id, viewer_key, shown_at) VALUES (?, ?, ?, ?)", newId(), campaignId, viewerKey, new Date().toISOString());
}

export function listAdvertiserCampaigns(userId: string): Array<Record<string, unknown>> {
  ensureReady();
  return all(
    `SELECT c.id, c.title, c.status, c.approval_status, c.payment_status, c.start_date, c.end_date, c.campaign_kind, p.placement,
            (SELECT COUNT(*) FROM advertising_events e WHERE e.campaign_id = c.id AND e.event_type = 'impression' AND e.viewable = 1) as impressions,
            (SELECT COUNT(*) FROM advertising_events e WHERE e.campaign_id = c.id AND e.event_type = 'click') as clicks
     FROM advertising_campaigns c JOIN advertising_products p ON p.id = c.product_id
     WHERE c.advertiser_id = ? ORDER BY c.created_at DESC`,
    userId,
  );
}

export function campaignStats(id: string): { impressions: number; clicks: number; ctr: number } {
  ensureReady();
  const impressions = get<{ count: number }>("SELECT COUNT(*) as count FROM advertising_events WHERE campaign_id = ? AND event_type = 'impression'", id)?.count ?? 0;
  const clicks = get<{ count: number }>("SELECT COUNT(*) as count FROM advertising_events WHERE campaign_id = ? AND event_type = 'click'", id)?.count ?? 0;
  return { impressions, clicks, ctr: impressions ? Math.round((clicks / impressions) * 1000) / 10 : 0 };
}

export function createProduct(user: SessionUser, input: { title: string; description: string; priceRands: string; condition: string; categorySlug?: string; locationId?: string | null; imageUrl?: string }): { id: string; slug: string } {
  ensureReady();
  assertActive(user);
  requirePermission(user.id, "marketplace.sell");
  const seller = get("SELECT id FROM seller_profiles WHERE user_id = ?", user.id);
  if (!seller) throw new AppError(400, "Open a seller profile from your account first");
  const category = input.categorySlug ? get<{ id: string }>("SELECT id FROM marketplace_categories WHERE slug = ?", input.categorySlug) : undefined;
  const id = newId();
  const slug = uniqueSlug("products", input.title);
  const stamp = new Date().toISOString();
  const expires = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();
  transaction(() => {
    run(
      `INSERT INTO products (id, seller_id, category_id, title, slug, description, price_cents, condition, location_id, listing_status, expires_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`,
      id,
      user.id,
      category?.id || null,
      input.title.trim(),
      slug,
      input.description.trim(),
      cents(input.priceRands),
      input.condition,
      input.locationId || null,
      expires,
      stamp,
      stamp,
    );
    if (input.imageUrl) run("INSERT INTO product_images (id, product_id, image_url, position) VALUES (?, ?, ?, 0)", newId(), id, input.imageUrl);
  });
  audit(user.id, "product.create", "product", id);
  return { id, slug };
}

export function moderateProduct(user: SessionUser, id: string, decision: "publish" | "unpublish" | "remove"): void {
  ensureReady();
  assertActive(user);
  requirePermission(user.id, "marketplace.moderate");
  if (decision !== "publish" && decision !== "unpublish" && decision !== "remove") throw new AppError(400, "Choose publish, unpublish, or remove");
  const product = get<{ title: string; description: string; slug: string }>("SELECT title, description, slug FROM products WHERE id = ?", id);
  if (!product) throw new AppError(404, "Listing not found");
  const stamp = new Date().toISOString();
  const status = decision === "publish" ? "published" : decision === "unpublish" ? "unpublished" : "removed";
  run("UPDATE products SET listing_status = ?, published_at = ?, updated_at = ? WHERE id = ?", status, decision === "publish" ? stamp : null, stamp, id);
  if (decision === "publish") indexDocument({ entityType: "product", entityId: product.slug, language: "en", title: product.title, body: product.description, publishedAt: stamp });
  else removeIndex("product", product.slug);
  audit(user.id, `product.${decision}`, "product", id);
}

export function listProducts(filters?: { category?: string; q?: string; locationId?: string }): Array<Record<string, unknown>> {
  ensureReady();
  const where = ["listing_status = 'published'", "deleted_at IS NULL", "(expires_at IS NULL OR expires_at > ?)"];
  const params: Array<string> = [new Date().toISOString()];
  if (filters?.category) {
    where.push("category_id = (SELECT id FROM marketplace_categories WHERE slug = ?)");
    params.push(filters.category);
  }
  if (filters?.locationId) {
    where.push("location_id = ?");
    params.push(filters.locationId);
  }
  if (filters?.q) {
    where.push("(lower(title) LIKE ? OR lower(description) LIKE ?)");
    params.push(`%${filters.q.toLowerCase()}%`, `%${filters.q.toLowerCase()}%`);
  }
  return all(`SELECT id, title, slug, description, price_cents, currency, condition, location_id, featured FROM products WHERE ${where.join(" AND ")} ORDER BY featured DESC, published_at DESC LIMIT 48`, ...params);
}

export function getProduct(slug: string): Record<string, unknown> | null {
  ensureReady();
  const product = get<Record<string, unknown>>("SELECT * FROM products WHERE (slug = ? OR id = ?) AND listing_status = 'published' AND deleted_at IS NULL", slug, slug);
  if (!product) return null;
  return { ...product, images: all("SELECT image_url FROM product_images WHERE product_id = ? ORDER BY position", product.id) };
}

export function saveFavourite(user: SessionUser, productId: string, listType: "favourite" | "wishlist"): void {
  ensureReady();
  assertActive(user);
  const existing = get("SELECT id FROM marketplace_favourites WHERE user_id = ? AND product_id = ? AND list_type = ?", user.id, productId, listType);
  if (existing) run("DELETE FROM marketplace_favourites WHERE user_id = ? AND product_id = ? AND list_type = ?", user.id, productId, listType);
  else run("INSERT INTO marketplace_favourites (id, user_id, product_id, list_type, created_at) VALUES (?, ?, ?, ?, ?)", newId(), user.id, productId, listType, new Date().toISOString());
}

export function createOrder(user: SessionUser, productId: string, quantity: number, fulfilment: "collection" | "delivery", notes?: string): { id: string; paymentStatus: "unpaid" } {
  ensureReady();
  assertActive(user);
  requirePermission(user.id, "marketplace.buy");
  const product = get<{ seller_id: string; price_cents: number; listing_status: string; title: string }>("SELECT seller_id, price_cents, listing_status, title FROM products WHERE id = ?", productId);
  if (!product || product.listing_status !== "published") throw new AppError(404, "Listing not found");
  if (product.seller_id === user.id) throw new AppError(400, "You cannot buy your own listing");
  const qty = Math.max(1, Math.min(20, Math.floor(quantity || 1)));
  const id = newId();
  const total = product.price_cents * qty;
  const stamp = new Date().toISOString();
  transaction(() => {
    run(
      "INSERT INTO marketplace_orders (id, buyer_id, seller_id, total_cents, order_status, payment_status, fulfilment, notes, created_at, updated_at) VALUES (?, ?, ?, ?, 'placed', 'unpaid', ?, ?, ?, ?)",
      id,
      user.id,
      product.seller_id,
      total,
      fulfilment,
      notes || null,
      stamp,
      stamp,
    );
    run("INSERT INTO marketplace_order_items (id, order_id, product_id, quantity, unit_price_cents) VALUES (?, ?, ?, ?, ?)", newId(), id, productId, qty, product.price_cents);
  });
  notify(product.seller_id, "order", "New order request", `${product.title} — payment is not confirmed`, `/marketplace/orders/${id}`);
  audit(user.id, "order.create", "order", id);
  return { id, paymentStatus: "unpaid" };
}

export function cancelUnpaidOrder(user: SessionUser, orderId: string): void {
  ensureReady();
  assertActive(user);
  const order = get<{ buyer_id: string; seller_id: string; payment_status: string; order_status: string }>("SELECT buyer_id, seller_id, payment_status, order_status FROM marketplace_orders WHERE id = ?", orderId);
  if (!order || (order.buyer_id !== user.id && order.seller_id !== user.id)) throw new AppError(403, "This is not your order");
  if (order.payment_status !== "unpaid" || order.order_status !== "placed") throw new AppError(400, "Only an unpaid placed order can be cancelled");
  run("UPDATE marketplace_orders SET order_status = 'cancelled', updated_at = ? WHERE id = ?", new Date().toISOString(), orderId);
  audit(user.id, "order.cancel", "order", orderId);
}

export function refuseBrowserPayment(): never {
  throw new AppError(403, "Payments are confirmed only by the payment provider");
}

export function openDispute(user: SessionUser, orderId: string, reason: string): void {
  ensureReady();
  assertActive(user);
  const order = get<{ buyer_id: string; seller_id: string }>("SELECT buyer_id, seller_id FROM marketplace_orders WHERE id = ?", orderId);
  if (!order || (order.buyer_id !== user.id && order.seller_id !== user.id)) throw new AppError(403, "This is not your order");
  const id = newId();
  const stamp = new Date().toISOString();
  run("INSERT INTO disputes (id, order_id, opened_by, reason, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'open', ?, ?)", id, orderId, user.id, reason.trim(), stamp, stamp);
  run("UPDATE marketplace_orders SET order_status = 'disputed', updated_at = ? WHERE id = ?", stamp, orderId);
  audit(user.id, "order.dispute", "order", orderId);
}

export function adProducts(): Array<Record<string, unknown>> {
  ensureReady();
  return all("SELECT id, name, placement, pricing_model, price_cents, currency, description FROM advertising_products WHERE active = 1 ORDER BY price_cents DESC");
}

export function businessCategories(): Array<{ slug: string; name: string }> {
  ensureReady();
  return all("SELECT slug, name FROM business_categories ORDER BY name");
}

export function marketplaceCategories(): Array<{ slug: string; name: string }> {
  ensureReady();
  return all("SELECT slug, name FROM marketplace_categories ORDER BY name");
}

export function enquireAboutProduct(user: SessionUser, productId: string, message: string): string {
  ensureReady();
  assertActive(user);
  const product = get<{ seller_id: string; title: string }>("SELECT seller_id, title FROM products WHERE id = ? AND listing_status = 'published' AND deleted_at IS NULL", productId);
  if (!product) throw new AppError(404, "Listing not found");
  if (message.trim().length < 5) throw new AppError(400, "Write a message");
  return openEnquiry(user, product.seller_id, `Listing: ${product.title}`, message, { type: "product", id: productId });
}

export function enquireAboutBusiness(user: SessionUser, businessId: string, message: string): string {
  ensureReady();
  assertActive(user);
  const business = get<{ owner_id: string; name: string }>("SELECT owner_id, name FROM businesses WHERE id = ? AND status = 'published' AND deleted_at IS NULL", businessId);
  if (!business) throw new AppError(404, "Business not found");
  if (message.trim().length < 5) throw new AppError(400, "Write a message");
  return openEnquiry(user, business.owner_id, `Business: ${business.name}`, message, { type: "business", id: businessId });
}

void slugify;
