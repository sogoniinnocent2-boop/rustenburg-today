import type { SessionUser } from "./auth";
import { assertActive } from "./auth";
import { all, get, newId, run } from "./db";
import { AppError } from "./errors";
import { ensureReady } from "./init";
import { requirePermission } from "./permissions";
import { audit, rateLimit, setting } from "./store";

export const QUOTE_CATEGORIES = ["plumbing", "photography", "building", "moving", "mechanic", "catering"] as const;

type Plan = { code: string; name: string; rank: number; price_cents: number; summary: string };

export function listPlans(): Plan[] {
  ensureReady();
  return all<Plan>("SELECT code, name, rank, price_cents, summary FROM commercial_plans WHERE active = 1 ORDER BY rank");
}

export function activePlan(userId: string): Plan | null {
  ensureReady();
  return get<Plan>(
    `SELECT p.code, p.name, p.rank, p.price_cents, p.summary
     FROM business_subscriptions s JOIN commercial_plans p ON p.code = s.plan_code
     WHERE s.user_id = ? AND s.status IN ('active', 'preview') ORDER BY p.rank DESC LIMIT 1`,
    userId,
  ) || null;
}

export function subscribe(user: SessionUser, code: string): { id: string; status: string; amountCents: number } {
  ensureReady();
  assertActive(user);
  if (user.isMinor) throw new AppError(403, "Business plans are not available on accounts under 18");
  const plan = get<Plan>("SELECT code, name, rank, price_cents, summary FROM commercial_plans WHERE code = ? AND active = 1", code);
  if (!plan) throw new AppError(404, "Plan not found");
  if (plan.code === "enterprise" && plan.price_cents <= 0) throw new AppError(400, "Enterprise checkout stays closed until an administrator sets a price");
  const current = activePlan(user.id);
  if (current && current.code !== plan.code) throw new AppError(409, "Cancel the current plan before choosing another");
  if (current && current.code === plan.code) throw new AppError(409, "That plan is already active");
  const id = newId();
  const stamp = new Date().toISOString();
  const paymentsOpen = setting("payment_mode", "disabled") !== "disabled";
  const status = plan.price_cents === 0 ? "active" : paymentsOpen ? "unpaid" : "preview";
  run(
    "INSERT INTO business_subscriptions (id, user_id, plan_code, amount_cents, status, created_at, paid_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    id,
    user.id,
    plan.code,
    plan.price_cents,
    status,
    stamp,
    status === "active" ? stamp : null,
  );
  audit(user.id, "plan.subscribe", "subscription", id, { plan: plan.code, cents: plan.price_cents });
  return { id, status, amountCents: plan.price_cents };
}

export function cancelPlan(user: SessionUser): void {
  ensureReady();
  assertActive(user);
  const changed = run("UPDATE business_subscriptions SET status = 'cancelled', cancelled_at = ? WHERE user_id = ? AND status IN ('active', 'unpaid', 'preview')", new Date().toISOString(), user.id);
  if (!changed) throw new AppError(404, "No plan to cancel");
  audit(user.id, "plan.cancel", "user", user.id);
}

export function setPlanPrice(user: SessionUser, code: string, priceCents: number): void {
  ensureReady();
  assertActive(user);
  requirePermission(user.id, "admin.access");
  if (!Number.isInteger(priceCents) || priceCents < 0 || priceCents > 100_000_000) throw new AppError(400, "Enter a price in cents");
  const changed = run("UPDATE commercial_plans SET price_cents = ? WHERE code = ?", priceCents, code);
  if (!changed) throw new AppError(404, "Plan not found");
  audit(user.id, "plan.price", "plan", code, { cents: priceCents });
}

function rankOf(userId: string): number {
  return activePlan(userId)?.rank ?? -1;
}

export function requestOpenQuote(user: SessionUser, category: string, message: string): string {
  ensureReady();
  assertActive(user);
  if (user.isMinor) throw new AppError(403, "Quote requests are not available on accounts under 18");
  if (!QUOTE_CATEGORIES.includes(category as (typeof QUOTE_CATEGORIES)[number])) throw new AppError(400, "Choose a category");
  if (message.trim().length < 12) throw new AppError(400, "Describe the work");
  const id = newId();
  run("INSERT INTO open_quotes (id, requester_id, category, message, status, created_at) VALUES (?, ?, ?, ?, 'open', ?)", id, user.id, category, message.trim().slice(0, 2000), new Date().toISOString());
  return id;
}

export function listOpenQuotes(user: SessionUser): Array<Record<string, unknown>> {
  ensureReady();
  assertActive(user);
  if (rankOf(user.id) < 1) throw new AppError(403, "An active Starter plan or above is required to read quote requests");
  return all("SELECT id, category, message, created_at FROM open_quotes WHERE status = 'open' ORDER BY created_at DESC LIMIT 50");
}

export function respondToQuote(user: SessionUser, quoteId: string, businessId: string, message: string): void {
  ensureReady();
  assertActive(user);
  if (rankOf(user.id) < 1) throw new AppError(403, "An active Starter plan or above is required to respond");
  if (message.trim().length < 8) throw new AppError(400, "Write the quotation");
  const business = get("SELECT id FROM businesses WHERE id = ? AND owner_id = ? AND deleted_at IS NULL", businessId, user.id);
  if (!business) throw new AppError(403, "Choose one of your businesses");
  if (!get("SELECT id FROM open_quotes WHERE id = ? AND status = 'open'", quoteId)) throw new AppError(404, "Quote request not found");
  run("INSERT INTO quote_offers (id, quote_id, business_id, owner_id, message, created_at) VALUES (?, ?, ?, ?, ?, ?)", newId(), quoteId, businessId, user.id, message.trim().slice(0, 2000), new Date().toISOString());
  audit(user.id, "quote.respond", "open_quote", quoteId);
}

export function myQuotes(userId: string): Array<Record<string, unknown>> {
  ensureReady();
  return all(
    `SELECT q.id, q.category, q.message, q.status, b.name as business, o.message as offer
     FROM open_quotes q
     LEFT JOIN quote_offers o ON o.quote_id = q.id
     LEFT JOIN businesses b ON b.id = o.business_id
     WHERE q.requester_id = ? ORDER BY q.created_at DESC`,
    userId,
  );
}

export function featureDeal(user: SessionUser, dealId: string): void {
  ensureReady();
  assertActive(user);
  if (rankOf(user.id) < 2) throw new AppError(403, "An active Growth plan or above is required to feature a deal");
  const changed = run("UPDATE deals SET featured = 1, updated_at = ? WHERE id = ? AND owner_id = ? AND deleted_at IS NULL", new Date().toISOString(), dealId, user.id);
  if (!changed) throw new AppError(404, "Deal not found");
  audit(user.id, "deal.feature", "deal", dealId);
}

export const PRACTICE_TRACKS = ["k53", "language", "trivia", "sequence", "spelling"] as const;
export type PracticeTrack = (typeof PRACTICE_TRACKS)[number];

export function practiceSet(track: PracticeTrack): Array<{ id: string; prompt: string; options: string[]; note: string }> {
  ensureReady();
  return all<{ id: string; prompt: string; options_json: string; note: string }>("SELECT id, prompt, options_json, note FROM practice_questions WHERE track = ? ORDER BY position", track).map((row) => ({
    id: row.id,
    prompt: row.prompt,
    options: JSON.parse(row.options_json) as string[],
    note: row.note,
  }));
}

export function markPractice(user: SessionUser, track: PracticeTrack, answers: number[]): { correct: number; total: number } {
  ensureReady();
  assertActive(user);
  const questions = all<{ correct_index: number }>("SELECT correct_index FROM practice_questions WHERE track = ? ORDER BY position", track);
  if (!questions.length) throw new AppError(404, "No practice questions are on file");
  const correct = questions.filter((question, index) => answers[index] === question.correct_index).length;
  run("INSERT INTO practice_attempts (id, user_id, track, correct, total, created_at) VALUES (?, ?, ?, ?, ?, ?)", newId(), user.id, track, correct, questions.length, new Date().toISOString());
  return { correct, total: questions.length };
}

export function recordFocus(user: SessionUser, minutes: number): void {
  ensureReady();
  assertActive(user);
  if (minutes !== 25 && minutes !== 5) throw new AppError(400, "Record a finished 25-minute or 5-minute session");
  rateLimit(`focus:${user.id}`, 12, 60 * 60 * 1000);
  run("INSERT INTO focus_sessions (id, user_id, minutes, created_at) VALUES (?, ?, ?, ?)", newId(), user.id, minutes, new Date().toISOString());
}

export function focusStats(userId: string): { sessions: number; minutes: number } {
  ensureReady();
  const row = get<{ sessions: number; minutes: number }>("SELECT COUNT(*) as sessions, COALESCE(SUM(minutes), 0) as minutes FROM focus_sessions WHERE user_id = ?", userId);
  return { sessions: row?.sessions ?? 0, minutes: row?.minutes ?? 0 };
}

export function recordMemoryRound(user: SessionUser, moves: number, seconds: number): void {
  ensureReady();
  assertActive(user);
  if (!Number.isInteger(moves) || moves < 6 || moves > 80) throw new AppError(400, "A finished round needs its move count");
  if (!Number.isInteger(seconds) || seconds < 1 || seconds > 3600) throw new AppError(400, "A finished round needs its time");
  rateLimit(`game:${user.id}`, 30, 60 * 60 * 1000);
  run("INSERT INTO game_rounds (id, user_id, game, moves, seconds, created_at) VALUES (?, ?, 'memory', ?, ?, ?)", newId(), user.id, moves, seconds, new Date().toISOString());
}

export function memoryBoard(): Array<{ moves: number; seconds: number; name: string }> {
  ensureReady();
  return all("SELECT g.moves, g.seconds, p.display_name as name FROM game_rounds g JOIN profiles p ON p.user_id = g.user_id WHERE g.game = 'memory' ORDER BY g.moves, g.seconds LIMIT 10");
}

export function revenueLines(): Array<{ reference_type: string; payments: number; cents: number }> {
  ensureReady();
  return all("SELECT reference_type, COUNT(*) as payments, COALESCE(SUM(amount_cents), 0) as cents FROM payments WHERE status = 'verified' GROUP BY reference_type ORDER BY reference_type");
}
