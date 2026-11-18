import { createHmac } from "node:crypto";
import type { SessionUser } from "./auth";
import { assertActive } from "./auth";
import { sessionSecret } from "./crypto";
import { all, get, newId, run, transaction } from "./db";
import { AppError } from "./errors";
import { ensureReady } from "./init";
import { audit } from "./store";

const WORDS = ["PLATINUM", "KLOOF", "MARKET", "SUNSET", "LEARNER", "COMMUNITY"];
const SUDOKU = [1, 2, 3, 4, 3, 4, 1, 2, 2, 1, 4, 3, 4, 3, 2, 1];
export const SUDOKU_GIVEN: Array<number | null> = [1, null, null, 4, null, 4, null, 2, 2, null, 4, null, 4, 3, null, 1];

function ownedBusiness(userId: string, businessId: string): void {
  if (!get("SELECT id FROM businesses WHERE id = ? AND owner_id = ? AND deleted_at IS NULL", businessId, userId)) throw new AppError(403, "Choose one of your businesses");
}

export function createDocument(user: SessionUser, input: { businessId: string; kind: string; clientName: string; note?: string; lines: Array<{ description: string; quantity: number; unitCents: number }> }): { id: string; totalCents: number } {
  ensureReady();
  assertActive(user);
  if (!["quotation", "invoice", "statement"].includes(input.kind)) throw new AppError(400, "Choose a document type");
  if (input.clientName.trim().length < 2) throw new AppError(400, "Add the client name");
  ownedBusiness(user.id, input.businessId);
  if (!input.lines.length || input.lines.length > 8) throw new AppError(400, "Add between 1 and 8 lines");
  let total = 0;
  const clean = input.lines.map((line) => {
    const description = line.description.trim();
    if (description.length < 2) throw new AppError(400, "Describe each line");
    if (!Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 999) throw new AppError(400, "Enter a quantity");
    if (!Number.isInteger(line.unitCents) || line.unitCents < 0 || line.unitCents > 100_000_000) throw new AppError(400, "Enter a line price in cents");
    total += line.quantity * line.unitCents;
    return { description, quantity: line.quantity, unitCents: line.unitCents };
  });
  if (!Number.isSafeInteger(total)) throw new AppError(400, "The total is too large");
  const id = newId();
  transaction(() => {
    run("INSERT INTO business_documents (id, business_id, owner_id, kind, client_name, note, total_cents, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", id, input.businessId, user.id, input.kind, input.clientName.trim().slice(0, 120), input.note?.trim().slice(0, 500) || null, total, new Date().toISOString());
    for (const line of clean) run("INSERT INTO business_document_lines (id, document_id, description, quantity, unit_cents) VALUES (?, ?, ?, ?, ?)", newId(), id, line.description, line.quantity, line.unitCents);
  });
  audit(user.id, "document.create", "business_document", id, { cents: total });
  return { id, totalCents: total };
}

export function listDocuments(userId: string): Array<Record<string, unknown>> {
  ensureReady();
  return all("SELECT d.id, d.kind, d.client_name, d.total_cents, d.created_at, b.name as business FROM business_documents d JOIN businesses b ON b.id = d.business_id WHERE d.owner_id = ? ORDER BY d.created_at DESC", userId);
}

export function readDocument(userId: string, id: string): { document: Record<string, unknown>; lines: Array<Record<string, unknown>> } | null {
  ensureReady();
  const document = get<Record<string, unknown>>("SELECT d.id, d.kind, d.client_name, d.note, d.total_cents, d.created_at, b.name as business FROM business_documents d JOIN businesses b ON b.id = d.business_id WHERE d.id = ? AND d.owner_id = ?", id, userId);
  if (!document) return null;
  return { document, lines: all("SELECT description, quantity, unit_cents FROM business_document_lines WHERE document_id = ? ORDER BY rowid", id) };
}

export function requestAppointment(user: SessionUser, businessId: string, startsAt: string, note: string): string {
  ensureReady();
  assertActive(user);
  if (user.isMinor) throw new AppError(403, "Appointment requests are not available on accounts under 18");
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(startsAt)) throw new AppError(400, "Choose a date and time");
  if (note.trim().length < 8) throw new AppError(400, "Say what the appointment is for");
  if (!get("SELECT id FROM businesses WHERE id = ? AND deleted_at IS NULL", businessId)) throw new AppError(404, "Business not found");
  const id = newId();
  run("INSERT INTO appointments (id, business_id, requester_id, starts_at, note, status, created_at) VALUES (?, ?, ?, ?, ?, 'requested', ?)", id, businessId, user.id, startsAt, note.trim().slice(0, 500), new Date().toISOString());
  return id;
}

export function decideAppointment(user: SessionUser, id: string, confirm: boolean): void {
  ensureReady();
  assertActive(user);
  const row = get("SELECT a.id FROM appointments a JOIN businesses b ON b.id = a.business_id WHERE a.id = ? AND b.owner_id = ? AND a.status = 'requested'", id, user.id);
  if (!row) throw new AppError(404, "Appointment not found");
  run("UPDATE appointments SET status = ? WHERE id = ?", confirm ? "confirmed" : "declined", id);
}

export function myAppointments(userId: string): Array<Record<string, unknown>> {
  ensureReady();
  return all(
    `SELECT a.id, a.starts_at, a.note, a.status, b.name as business, 'out' as direction FROM appointments a JOIN businesses b ON b.id = a.business_id WHERE a.requester_id = ?
     UNION ALL
     SELECT a.id, a.starts_at, a.note, a.status, p.display_name as business, 'in' as direction FROM appointments a JOIN businesses b ON b.id = a.business_id JOIN profiles p ON p.user_id = a.requester_id WHERE b.owner_id = ?
     ORDER BY starts_at`,
    userId,
    userId,
  );
}

export function saveStudyBlock(user: SessionUser, weekday: number, subject: string, minutes: number): string {
  ensureReady();
  assertActive(user);
  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) throw new AppError(400, "Choose a day");
  if (subject.trim().length < 2) throw new AppError(400, "Name the subject");
  if (!Number.isInteger(minutes) || minutes < 10 || minutes > 180) throw new AppError(400, "Choose between 10 and 180 minutes");
  const id = newId();
  run("INSERT INTO study_blocks (id, user_id, weekday, subject, minutes, created_at) VALUES (?, ?, ?, ?, ?, ?)", id, user.id, weekday, subject.trim().slice(0, 80), minutes, new Date().toISOString());
  return id;
}

export function removeStudyBlock(user: SessionUser, id: string): void {
  ensureReady();
  assertActive(user);
  const changed = run("DELETE FROM study_blocks WHERE id = ? AND user_id = ?", id, user.id);
  if (!changed) throw new AppError(404, "Study block not found");
}

export function studyPlan(userId: string): Array<{ id: string; weekday: number; subject: string; minutes: number }> {
  ensureReady();
  return all("SELECT id, weekday, subject, minutes FROM study_blocks WHERE user_id = ? ORDER BY weekday, subject", userId);
}

export function createLoyaltyCard(user: SessionUser, businessId: string, title: string, stampsRequired: number, rewardNote: string): string {
  ensureReady();
  assertActive(user);
  ownedBusiness(user.id, businessId);
  if (title.trim().length < 2 || rewardNote.trim().length < 4) throw new AppError(400, "Name the card and the reward");
  if (!Number.isInteger(stampsRequired) || stampsRequired < 2 || stampsRequired > 20) throw new AppError(400, "Choose between 2 and 20 stamps");
  const id = newId();
  run("INSERT INTO loyalty_cards (id, business_id, title, stamps_required, reward_note, created_at) VALUES (?, ?, ?, ?, ?, ?)", id, businessId, title.trim().slice(0, 80), stampsRequired, rewardNote.trim().slice(0, 200), new Date().toISOString());
  return id;
}

export function addStamp(user: SessionUser, cardId: string, customerEmail: string): number {
  ensureReady();
  assertActive(user);
  const card = get<{ stamps_required: number; business_id: string }>("SELECT c.stamps_required, c.business_id FROM loyalty_cards c JOIN businesses b ON b.id = c.business_id WHERE c.id = ? AND b.owner_id = ?", cardId, user.id);
  if (!card) throw new AppError(404, "Loyalty card not found");
  const customer = get<{ id: string }>("SELECT id FROM users WHERE email = ? AND status = 'active'", customerEmail.trim().toLowerCase());
  if (!customer) throw new AppError(404, "Customer account not found");
  run("INSERT INTO loyalty_stamps (id, card_id, customer_id, created_at) VALUES (?, ?, ?, ?)", newId(), cardId, customer.id, new Date().toISOString());
  return get<{ count: number }>("SELECT COUNT(*) as count FROM loyalty_stamps WHERE card_id = ? AND customer_id = ?", cardId, customer.id)?.count ?? 0;
}

export function loyaltyCards(userId: string): Array<Record<string, unknown>> {
  ensureReady();
  return all("SELECT c.id, c.title, c.stamps_required, c.reward_note, b.name as business FROM loyalty_cards c JOIN businesses b ON b.id = c.business_id WHERE b.owner_id = ? ORDER BY c.created_at DESC", userId);
}

export function recordRedemption(user: SessionUser, dealId: string, note: string): number {
  ensureReady();
  assertActive(user);
  if (note.trim().length < 2) throw new AppError(400, "Add a short note");
  if (!get("SELECT id FROM deals WHERE id = ? AND owner_id = ? AND deleted_at IS NULL", dealId, user.id)) throw new AppError(404, "Deal not found");
  run("INSERT INTO deal_redemptions (id, deal_id, recorded_by, note, created_at) VALUES (?, ?, ?, ?, ?)", newId(), dealId, user.id, note.trim().slice(0, 160), new Date().toISOString());
  return get<{ count: number }>("SELECT COUNT(*) as count FROM deal_redemptions WHERE deal_id = ?", dealId)?.count ?? 0;
}

export function dailyLetters(): { letters: string; token: string } {
  const index = Math.floor(Date.now() / 86_400_000) % WORDS.length;
  const word = WORDS[index];
  const token = createHmac("sha256", sessionSecret()).update(`word:${word}`).digest("hex");
  const letters = word.split("").map((letter, position) => ({ letter, position })).sort((a, b) => (a.position * 3 + a.letter.charCodeAt(0)) % 7 - (b.position * 3 + b.letter.charCodeAt(0)) % 7).map((item) => item.letter).join("");
  return { letters, token };
}

export function solveWord(user: SessionUser, token: string, guess: string): boolean {
  ensureReady();
  assertActive(user);
  const word = WORDS.find((item) => createHmac("sha256", sessionSecret()).update(`word:${item}`).digest("hex") === token);
  if (!word) throw new AppError(400, "This puzzle has expired");
  const correct = guess.trim().toUpperCase() === word;
  if (correct) run("INSERT INTO game_rounds (id, user_id, game, moves, seconds, created_at) VALUES (?, ?, 'word', 1, 0, ?)", newId(), user.id, new Date().toISOString());
  return correct;
}

export function solveSudoku(user: SessionUser, cells: number[]): boolean {
  ensureReady();
  assertActive(user);
  if (cells.length !== 16 || cells.some((cell) => !Number.isInteger(cell) || cell < 1 || cell > 4)) throw new AppError(400, "Fill every cell with 1 to 4");
  const correct = cells.every((cell, index) => cell === SUDOKU[index]);
  if (correct) run("INSERT INTO game_rounds (id, user_id, game, moves, seconds, created_at) VALUES (?, ?, 'sudoku', 1, 0, ?)", newId(), user.id, new Date().toISOString());
  return correct;
}

export function publishedServices(serviceType: string): Array<Record<string, unknown>> {
  ensureReady();
  return all("SELECT id, name, description, phone FROM service_providers WHERE service_type = ? AND status = 'published' AND deleted_at IS NULL ORDER BY name", serviceType);
}
