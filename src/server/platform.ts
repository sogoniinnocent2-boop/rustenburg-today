import { randomToken } from "./crypto";
import { all, get, newId, run, transaction } from "./db";
import { AppError } from "./errors";
import { ensureReady } from "./init";
import { requirePermission } from "./permissions";
import { audit } from "./store";
import type { SessionUser } from "./auth";
import { assertActive } from "./auth";

export type PlaceChoice = { id: string; label: string; latitude: number | null; longitude: number | null };

export function locationScope(locationId: string): string[] {
  ensureReady();
  const ids = [locationId];
  const queue = [locationId];
  while (queue.length) {
    const current = queue.shift();
    const children = all<{ id: string }>("SELECT id FROM locations WHERE parent_location_id = ? AND active = 1", current);
    for (const child of children) {
      ids.push(child.id);
      queue.push(child.id);
    }
  }
  return ids;
}

export function listLocationChoices(): PlaceChoice[] {
  ensureReady();
  const rows = all<{ id: string; name: string; parent_location_id: string | null; latitude: number | null; longitude: number | null }>(
    "SELECT id, name, parent_location_id, latitude, longitude FROM locations WHERE active = 1",
  );
  const byId = new Map(rows.map((row) => [row.id, row]));
  return rows
    .map((row) => {
      const names = [row.name];
      let parent = row.parent_location_id ? byId.get(row.parent_location_id) : undefined;
      while (parent) {
        names.unshift(parent.name);
        parent = parent.parent_location_id ? byId.get(parent.parent_location_id) : undefined;
      }
      return { id: row.id, label: names.join(" / "), latitude: row.latitude, longitude: row.longitude };
    })
    .sort((a, b) => a.label.localeCompare(b.label));
}

export function ensureGeography(): void {
  ensureReady();
  const country = place("South Africa", "south-africa", "country", null, -29, 24);
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
  const provinceIds = new Map(provinces.map(([name, slug, lat, lng]) => [slug, place(name, slug, "province", country, lat, lng)]));
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
  for (const [province, name, slug, lat, lng] of cities) place(name, slug, "city", provinceIds.get(province) || null, lat, lng);
  const northWest = provinceIds.get("north-west") || null;
  const municipality = place("Bojanala Platinum", "bojanala-platinum", "municipality", northWest, -25.6, 27.2);
  const city = get<{ id: string }>("SELECT id FROM locations WHERE slug = 'rustenburg'");
  if (city) run("UPDATE locations SET parent_location_id = ?, location_type = 'city' WHERE id = ? AND parent_location_id IS NULL", municipality, city.id);
}

function place(name: string, slug: string, kind: string, parent: string | null, lat: number, lng: number): string {
  const existing = get<{ id: string }>("SELECT id FROM locations WHERE slug = ?", slug);
  if (existing) return existing.id;
  const id = newId();
  run(
    "INSERT INTO locations (id, name, slug, location_type, parent_location_id, latitude, longitude, active) VALUES (?, ?, ?, ?, ?, ?, ?, 1)",
    id,
    name,
    slug,
    kind,
    parent,
    lat,
    lng,
  );
  return id;
}

export function createOrganisation(user: SessionUser, name: string): string {
  ensureReady();
  assertActive(user);
  requirePermission(user.id, "organisations.manage");
  const clean = name.trim();
  if (clean.length < 3) throw new AppError(400, "Enter the organisation name");
  const id = newId();
  const slug = `${clean.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40)}-${id.slice(0, 6)}`;
  const stamp = new Date().toISOString();
  transaction(() => {
    run("INSERT INTO organisations (id, name, slug, owner_id, verification_status, created_at) VALUES (?, ?, ?, ?, 'unverified', ?)", id, clean, slug, user.id, stamp);
    run("INSERT INTO organisation_members (organisation_id, user_id, member_role, created_at) VALUES (?, ?, 'owner', ?)", id, user.id, stamp);
  });
  audit(user.id, "organisation.create", "organisation", id);
  return id;
}

export function addOrganisationStaff(user: SessionUser, organisationId: string, staffUserId: string, memberRole: string): void {
  ensureReady();
  assertActive(user);
  const org = get<{ owner_id: string }>("SELECT owner_id FROM organisations WHERE id = ?", organisationId);
  if (!org || org.owner_id !== user.id) throw new AppError(403, "Only the organisation owner can add staff");
  if (!get("SELECT id FROM users WHERE id = ? AND status = 'active'", staffUserId)) throw new AppError(404, "Staff account not found");
  const role = memberRole.trim().slice(0, 40) || "staff";
  run("INSERT INTO organisation_members (organisation_id, user_id, member_role, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(organisation_id, user_id) DO UPDATE SET member_role = excluded.member_role", organisationId, staffUserId, role, new Date().toISOString());
  audit(user.id, "organisation.staff", "organisation", organisationId, { staffUserId, role });
}

export function listGroups(locationId?: string | null): Array<Record<string, unknown>> {
  ensureReady();
  if (!locationId) return all("SELECT id, name, slug, description, location_id FROM community_groups WHERE visibility = 'public' ORDER BY created_at DESC LIMIT 20");
  const ids = locationScope(locationId);
  const marks = ids.map(() => "?").join(", ");
  return all(`SELECT id, name, slug, description, location_id FROM community_groups WHERE visibility = 'public' AND (location_id IS NULL OR location_id IN (${marks})) ORDER BY created_at DESC LIMIT 20`, ...ids);
}

export function createGroup(user: SessionUser, input: { name: string; description: string; locationId?: string | null }): string {
  ensureReady();
  assertActive(user);
  requirePermission(user.id, "groups.create");
  const name = input.name.trim();
  const description = input.description.trim();
  if (name.length < 3 || description.length < 8) throw new AppError(400, "Name the group and describe it");
  const id = newId();
  const slug = `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40)}-${id.slice(0, 6)}`;
  const stamp = new Date().toISOString();
  transaction(() => {
    run("INSERT INTO community_groups (id, name, slug, description, location_id, owner_id, visibility, created_at) VALUES (?, ?, ?, ?, ?, ?, 'public', ?)", id, name, slug, description, input.locationId || null, user.id, stamp);
    run("INSERT INTO group_members (group_id, user_id, created_at) VALUES (?, ?, ?)", id, user.id, stamp);
  });
  audit(user.id, "group.create", "group", id);
  return id;
}

export function joinGroup(user: SessionUser, groupId: string): void {
  ensureReady();
  assertActive(user);
  if (!get("SELECT id FROM community_groups WHERE id = ? AND visibility = 'public'", groupId)) throw new AppError(404, "Group not found");
  run("INSERT OR IGNORE INTO group_members (group_id, user_id, created_at) VALUES (?, ?, ?)", groupId, user.id, new Date().toISOString());
}

export function createTicketOrder(user: SessionUser, ticketId: string, quantity: number): { id: string; amountCents: number; codes: string[] } {
  ensureReady();
  assertActive(user);
  requirePermission(user.id, "tickets.buy");
  const qty = Math.floor(quantity);
  if (qty < 1 || qty > 8) throw new AppError(400, "Choose between 1 and 8 tickets");
  const ticket = get<{ id: string; event_id: string; price_cents: number; capacity: number; reserved_count: number }>(
    `SELECT t.id, t.event_id, t.price_cents, t.capacity, t.reserved_count
     FROM event_tickets t JOIN events e ON e.id = t.event_id
     WHERE t.id = ? AND e.status = 'published' AND e.deleted_at IS NULL`,
    ticketId,
  );
  if (!ticket) throw new AppError(404, "Ticket not found");
  const id = newId();
  const amount = ticket.price_cents * qty;
  const free = amount === 0;
  const codes: string[] = [];
  transaction(() => {
    if (ticket.capacity > 0) {
      const changed = run("UPDATE event_tickets SET reserved_count = reserved_count + ? WHERE id = ? AND reserved_count + ? <= capacity", qty, ticket.id, qty);
      if (!changed) throw new AppError(409, "Not enough tickets remain");
    } else {
      run("UPDATE event_tickets SET reserved_count = reserved_count + ? WHERE id = ?", qty, ticket.id);
    }
    run(
      "INSERT INTO ticket_orders (id, user_id, event_id, ticket_id, quantity, amount_cents, payment_status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      id,
      user.id,
      ticket.event_id,
      ticket.id,
      qty,
      amount,
      free ? "free" : "unpaid",
      new Date().toISOString(),
    );
    if (free) {
      for (let index = 0; index < qty; index += 1) {
        const code = randomToken(12);
        codes.push(code);
        run("INSERT INTO issued_tickets (id, order_id, user_id, code, status) VALUES (?, ?, ?, ?, 'issued')", newId(), id, user.id, code);
      }
    }
  });
  if (free) audit(user.id, "ticket.order", "ticket_order", id, { free: true });
  else audit(user.id, "ticket.order", "ticket_order", id);
  return { id, amountCents: amount, codes };
}

export function issueTicketCodes(orderId: string): string[] {
  ensureReady();
  const order = get<{ id: string; user_id: string; quantity: number; payment_status: string }>("SELECT id, user_id, quantity, payment_status FROM ticket_orders WHERE id = ?", orderId);
  if (!order || order.payment_status !== "paid") throw new AppError(409, "Tickets are issued after a verified payment");
  const existing = all<{ code: string }>("SELECT code FROM issued_tickets WHERE order_id = ?", orderId);
  if (existing.length) return existing.map((row) => row.code);
  const codes: string[] = [];
  transaction(() => {
    for (let index = 0; index < order.quantity; index += 1) {
      const code = randomToken(12);
      codes.push(code);
      run("INSERT INTO issued_tickets (id, order_id, user_id, code, status) VALUES (?, ?, ?, ?, 'issued')", newId(), orderId, order.user_id, code);
    }
  });
  return codes;
}

export function scanTicket(user: SessionUser, code: string, eventId?: string): { status: "checked_in" } {
  ensureReady();
  assertActive(user);
  requirePermission(user.id, "tickets.scan");
  const ticket = get<{ id: string; status: string; event_id: string }>(
    `SELECT i.id, i.status, o.event_id FROM issued_tickets i JOIN ticket_orders o ON o.id = i.order_id WHERE i.code = ?`,
    code.trim(),
  );
  if (!ticket) throw new AppError(404, "Ticket not found");
  if (eventId && ticket.event_id !== eventId) throw new AppError(409, "This ticket belongs to another event");
  if (ticket.status === "checked_in") throw new AppError(409, "This ticket was already checked in");
  if (ticket.status === "refund_requested" || ticket.status === "refunded") throw new AppError(409, "This ticket is not valid for entry");
  if (ticket.status !== "issued") throw new AppError(409, "This ticket cannot be checked in");
  const changed = run("UPDATE issued_tickets SET status = 'checked_in', checked_in_at = ?, checked_in_by = ? WHERE id = ? AND status = 'issued'", new Date().toISOString(), user.id, ticket.id);
  if (!changed) throw new AppError(409, "This ticket was already checked in");
  audit(user.id, "ticket.checkin", "issued_ticket", ticket.id);
  return { status: "checked_in" };
}

export function requestTicketRefund(user: SessionUser, ticketCode: string, reason: string): void {
  ensureReady();
  assertActive(user);
  const clean = reason.trim();
  if (clean.length < 8) throw new AppError(400, "Describe the refund request");
  const ticket = get<{ id: string; status: string; order_id: string }>("SELECT id, status, order_id FROM issued_tickets WHERE code = ? AND user_id = ?", ticketCode.trim(), user.id);
  if (!ticket) throw new AppError(404, "Ticket not found");
  if (ticket.status === "checked_in") throw new AppError(409, "A checked-in ticket cannot be refunded here");
  run("UPDATE issued_tickets SET status = 'refund_requested' WHERE id = ? AND status = 'issued'", ticket.id);
  audit(user.id, "ticket.refund.request", "issued_ticket", ticket.id, { reason: clean });
}

export function listMyTickets(userId: string): Array<Record<string, unknown>> {
  ensureReady();
  return all(
    `SELECT i.code, i.status, e.title, e.start_at, e.venue, o.payment_status, o.amount_cents, o.quantity
     FROM issued_tickets i
     JOIN ticket_orders o ON o.id = i.order_id
     JOIN events e ON e.id = o.event_id
     WHERE i.user_id = ? ORDER BY e.start_at`,
    userId,
  );
}

const HOLD_MS = 15 * 60 * 1000;

export function quoteTicket(ticketId: string, quantity: number): { unitCents: number; quantity: number; subtotalCents: number; feeCents: number; totalCents: number } {
  ensureReady();
  const qty = Math.floor(quantity);
  if (qty < 1 || qty > 8) throw new AppError(400, "Choose between 1 and 8 tickets");
  const ticket = get<{ price_cents: number }>("SELECT price_cents FROM event_tickets WHERE id = ?", ticketId);
  if (!ticket) throw new AppError(404, "Ticket not found");
  const subtotal = ticket.price_cents * qty;
  return { unitCents: ticket.price_cents, quantity: qty, subtotalCents: subtotal, feeCents: 0, totalCents: subtotal };
}

export function releaseExpiredTicketHolds(now = Date.now()): number {
  ensureReady();
  const cutoff = new Date(now - HOLD_MS).toISOString();
  const rows = all<{ id: string; ticket_id: string; quantity: number }>("SELECT id, ticket_id, quantity FROM ticket_orders WHERE payment_status = 'unpaid' AND created_at < ?", cutoff);
  for (const row of rows) {
    transaction(() => {
      run("UPDATE event_tickets SET reserved_count = CASE WHEN reserved_count >= ? THEN reserved_count - ? ELSE 0 END WHERE id = ?", row.quantity, row.quantity, row.ticket_id);
      run("UPDATE ticket_orders SET payment_status = 'expired' WHERE id = ? AND payment_status = 'unpaid'", row.id);
    });
  }
  return rows.length;
}

export function addTicketType(user: SessionUser, eventId: string, input: { name: string; priceCents: number; capacity: number }): string {
  ensureReady();
  assertActive(user);
  requirePermission(user.id, "tickets.manage");
  const event = get<{ organiser_id: string }>("SELECT organiser_id FROM events WHERE id = ? AND deleted_at IS NULL", eventId);
  if (!event) throw new AppError(404, "Event not found");
  if (event.organiser_id !== user.id && !user.roles.includes("administrator")) throw new AppError(403, "Only the organiser can add ticket types");
  const name = input.name.trim();
  if (name.length < 2 || name.length > 40) throw new AppError(400, "Name the ticket type");
  if (!Number.isInteger(input.priceCents) || input.priceCents < 0 || input.priceCents > 100_000_000) throw new AppError(400, "Enter a price in cents");
  if (!Number.isInteger(input.capacity) || input.capacity < 0 || input.capacity > 100000) throw new AppError(400, "Enter a capacity");
  const id = newId();
  run("INSERT INTO event_tickets (id, event_id, ticket_type, price_cents, currency, capacity, reserved_count) VALUES (?, ?, ?, ?, 'ZAR', ?, 0)", id, eventId, name, input.priceCents, input.capacity);
  audit(user.id, "ticket.type", "event", eventId, { ticket: id });
  return id;
}

export function issueComplimentary(user: SessionUser, ticketId: string, quantity: number, recipientEmail: string, reason: string): { orderId: string; codes: string[] } {
  ensureReady();
  assertActive(user);
  requirePermission(user.id, "tickets.manage");
  if (reason.trim().length < 8) throw new AppError(400, "Record why this ticket is complimentary");
  const qty = Math.floor(quantity);
  if (qty < 1 || qty > 8) throw new AppError(400, "Choose between 1 and 8 tickets");
  const ticket = get<{ id: string; event_id: string; capacity: number; organiser_id: string }>(
    "SELECT t.id, t.event_id, t.capacity, e.organiser_id FROM event_tickets t JOIN events e ON e.id = t.event_id WHERE t.id = ? AND e.deleted_at IS NULL",
    ticketId,
  );
  if (!ticket) throw new AppError(404, "Ticket not found");
  if (ticket.organiser_id !== user.id && !user.roles.includes("administrator")) throw new AppError(403, "Only the organiser can issue complimentary tickets");
  const recipient = get<{ id: string }>("SELECT id FROM users WHERE email = ? AND status = 'active'", recipientEmail.trim().toLowerCase());
  if (!recipient) throw new AppError(404, "Recipient account not found");
  const orderId = newId();
  const codes: string[] = [];
  const stamp = new Date().toISOString();
  transaction(() => {
    if (ticket.capacity > 0) {
      const changed = run("UPDATE event_tickets SET reserved_count = reserved_count + ? WHERE id = ? AND reserved_count + ? <= capacity", qty, ticket.id, qty);
      if (!changed) throw new AppError(409, "Not enough tickets remain");
    } else {
      run("UPDATE event_tickets SET reserved_count = reserved_count + ? WHERE id = ?", qty, ticket.id);
    }
    run("INSERT INTO ticket_orders (id, user_id, event_id, ticket_id, quantity, amount_cents, payment_status, created_at) VALUES (?, ?, ?, ?, ?, 0, 'complimentary', ?)", orderId, recipient.id, ticket.event_id, ticket.id, qty, stamp);
    for (let index = 0; index < qty; index += 1) {
      const code = randomToken(12);
      codes.push(code);
      run("INSERT INTO issued_tickets (id, order_id, user_id, code, status) VALUES (?, ?, ?, ?, 'issued')", newId(), orderId, recipient.id, code);
    }
  });
  audit(user.id, "ticket.complimentary", "ticket_order", orderId, { reason: reason.trim().slice(0, 200) });
  return { orderId, codes };
}

export function requestViewing(user: SessionUser, propertyId: string, when: string, note: string): string {
  ensureReady();
  assertActive(user);
  if (!get("SELECT id FROM properties WHERE id = ? AND status = 'published'", propertyId)) throw new AppError(404, "Property not found");
  if (!when.trim()) throw new AppError(400, "Choose a viewing time");
  const id = newId();
  run("INSERT INTO viewing_requests (id, property_id, requester_id, requested_for, note, status, created_at) VALUES (?, ?, ?, ?, ?, 'requested', ?)", id, propertyId, user.id, when, note.trim().slice(0, 500), new Date().toISOString());
  audit(user.id, "property.viewing", "property", propertyId);
  return id;
}

export function requestAccommodation(user: SessionUser, propertyId: string, arrive: string, depart: string): string {
  ensureReady();
  assertActive(user);
  if (!get("SELECT id FROM properties WHERE id = ? AND status = 'published'", propertyId)) throw new AppError(404, "Property not found");
  if (!arrive || !depart || depart < arrive) throw new AppError(400, "Enter an arrival and a later departure");
  const id = newId();
  run("INSERT INTO accommodation_requests (id, property_id, requester_id, arrive_on, depart_on, status, created_at) VALUES (?, ?, ?, ?, ?, 'requested', ?)", id, propertyId, user.id, arrive, depart, new Date().toISOString());
  audit(user.id, "property.stay.request", "property", propertyId);
  return id;
}
