import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { all, get, newId, run, transaction } from "./db";
import { AppError } from "./errors";
import { ensureReady } from "./init";
import { requirePermission } from "./permissions";
import { audit } from "./store";
import type { SessionUser } from "./auth";
import { issueTicketCodes } from "./platform";

const payloadSchema = z.object({
  event_id: z.string().min(4).max(120),
  type: z.literal("payment.succeeded"),
  reference_type: z.enum(["order", "course", "campaign", "ticket", "subscription"]),
  reference_id: z.string().uuid(),
  amount_cents: z.number().int().positive(),
  currency: z.literal("ZAR"),
});

function signaturesMatch(secret: string, body: string, signature: string): boolean {
  const expected = createHmac("sha256", secret).update(body).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function applyPaymentWebhook(rawBody: string, signature: string | null): { status: "processed" | "duplicate" } {
  ensureReady();
  const secret = process.env.PAYMENT_WEBHOOK_SECRET;
  if (!secret) throw new AppError(503, "Payment webhook secret is not configured");
  if (!signature || !signaturesMatch(secret, rawBody, signature)) throw new AppError(401, "Invalid payment signature");
  const payload = payloadSchema.parse(JSON.parse(rawBody));
  const existing = get("SELECT id FROM payment_webhook_events WHERE provider_event_id = ?", payload.event_id);
  if (existing) return { status: "duplicate" };
  const stamp = new Date().toISOString();
  let ticketOrderId: string | null = null;
  transaction(() => {
    const inserted = run(
      "INSERT INTO payment_webhook_events (id, provider, provider_event_id, payload_reference, processing_status, processed_at, created_at) VALUES (?, 'sandbox', ?, ?, 'processed', ?, ?)",
      newId(),
      payload.event_id,
      payload.reference_id,
      stamp,
      stamp,
    );
    if (!inserted) return;
    if (payload.reference_type === "order") {
      const order = get<{ total_cents: number; buyer_id: string; payment_status: string }>("SELECT total_cents, buyer_id, payment_status FROM marketplace_orders WHERE id = ?", payload.reference_id);
      if (!order) throw new AppError(404, "Order not found");
      if (order.payment_status === "paid") return;
      if (order.total_cents !== payload.amount_cents) throw new AppError(409, "Amount does not match the order");
      run("UPDATE marketplace_orders SET payment_status = 'paid', order_status = 'paid', updated_at = ? WHERE id = ?", stamp, payload.reference_id);
      run(
        "INSERT INTO payments (id, user_id, reference_type, reference_id, provider, provider_reference, amount_cents, currency, status, verified_at, created_at) VALUES (?, ?, 'order', ?, 'sandbox', ?, ?, 'ZAR', 'verified', ?, ?)",
        newId(),
        order.buyer_id,
        payload.reference_id,
        payload.event_id,
        payload.amount_cents,
        stamp,
        stamp,
      );
    } else if (payload.reference_type === "course") {
      const enrolment = get<{ user_id: string; course_id: string }>("SELECT e.user_id, e.course_id FROM course_enrolments e WHERE e.id = ?", payload.reference_id);
      const course = enrolment ? get<{ price_cents: number }>("SELECT price_cents FROM courses WHERE id = ?", enrolment.course_id) : undefined;
      if (!enrolment || !course) throw new AppError(404, "Enrolment not found");
      if (course.price_cents !== payload.amount_cents) throw new AppError(409, "Amount does not match the course");
      run("UPDATE course_enrolments SET enrolment_status = 'active' WHERE id = ?", payload.reference_id);
      run(
        "INSERT INTO payments (id, user_id, reference_type, reference_id, provider, provider_reference, amount_cents, status, verified_at, created_at) VALUES (?, ?, 'course', ?, 'sandbox', ?, ?, 'verified', ?, ?)",
        newId(),
        enrolment.user_id,
        payload.reference_id,
        payload.event_id,
        payload.amount_cents,
        stamp,
        stamp,
      );
    } else if (payload.reference_type === "ticket") {
      const order = get<{ user_id: string; amount_cents: number; payment_status: string }>("SELECT user_id, amount_cents, payment_status FROM ticket_orders WHERE id = ?", payload.reference_id);
      if (!order) throw new AppError(404, "Ticket order not found");
      if (order.payment_status === "paid") return;
      if (order.amount_cents !== payload.amount_cents) throw new AppError(409, "Amount does not match the ticket order");
      run("UPDATE ticket_orders SET payment_status = 'paid' WHERE id = ?", payload.reference_id);
      run(
        "INSERT INTO payments (id, user_id, reference_type, reference_id, provider, provider_reference, amount_cents, currency, status, verified_at, created_at) VALUES (?, ?, 'ticket', ?, 'sandbox', ?, ?, 'ZAR', 'verified', ?, ?)",
        newId(),
        order.user_id,
        payload.reference_id,
        payload.event_id,
        payload.amount_cents,
        stamp,
        stamp,
      );
      ticketOrderId = payload.reference_id;
    } else if (payload.reference_type === "subscription") {
      const subscription = get<{ user_id: string; amount_cents: number; status: string }>("SELECT user_id, amount_cents, status FROM business_subscriptions WHERE id = ?", payload.reference_id);
      if (!subscription) throw new AppError(404, "Subscription not found");
      if (subscription.status === "active") return;
      if (subscription.amount_cents !== payload.amount_cents) throw new AppError(409, "Amount does not match the subscription");
      run("UPDATE business_subscriptions SET status = 'active', paid_at = ? WHERE id = ? AND status = 'unpaid'", stamp, payload.reference_id);
      run(
        "INSERT INTO payments (id, user_id, reference_type, reference_id, provider, provider_reference, amount_cents, currency, status, verified_at, created_at) VALUES (?, ?, 'subscription', ?, 'sandbox', ?, ?, 'ZAR', 'verified', ?, ?)",
        newId(),
        subscription.user_id,
        payload.reference_id,
        payload.event_id,
        payload.amount_cents,
        stamp,
        stamp,
      );
    } else {
      const campaign = get<{ advertiser_id: string; budget_cents: number }>("SELECT advertiser_id, budget_cents FROM advertising_campaigns WHERE id = ?", payload.reference_id);
      if (!campaign) throw new AppError(404, "Campaign not found");
      if (campaign.budget_cents !== payload.amount_cents) throw new AppError(409, "Amount does not match the campaign");
      run("UPDATE advertising_campaigns SET payment_status = 'verified', status = CASE WHEN approval_status = 'approved' THEN 'live' ELSE status END, updated_at = ? WHERE id = ?", stamp, payload.reference_id);
      run(
        "INSERT INTO payments (id, user_id, reference_type, reference_id, provider, provider_reference, amount_cents, status, verified_at, created_at) VALUES (?, ?, 'campaign', ?, 'sandbox', ?, ?, 'verified', ?, ?)",
        newId(),
        campaign.advertiser_id,
        payload.reference_id,
        payload.event_id,
        payload.amount_cents,
        stamp,
        stamp,
      );
    }
  });
  if (ticketOrderId) issueTicketCodes(ticketOrderId);
  audit(null, "payment.webhook", payload.reference_type, payload.reference_id, { event: payload.event_id });
  return { status: "processed" };
}

export function requestRefund(user: SessionUser, paymentId: string, amountCents: number, reason: string): string {
  ensureReady();
  requirePermission(user.id, "payments.reconcile");
  const payment = get<{ amount_cents: number; status: string }>("SELECT amount_cents, status FROM payments WHERE id = ?", paymentId);
  if (!payment || payment.status !== "verified") throw new AppError(400, "Only a verified payment can be refunded");
  if (amountCents <= 0 || amountCents > payment.amount_cents) throw new AppError(400, "Refund amount is not valid");
  const id = newId();
  run("INSERT INTO refunds (id, payment_id, amount_cents, reason, status, created_at) VALUES (?, ?, ?, ?, 'requested', ?)", id, paymentId, amountCents, reason.trim(), new Date().toISOString());
  audit(user.id, "refund.request", "refund", id);
  return id;
}

export function markRefundProcessed(user: SessionUser, refundId: string): void {
  ensureReady();
  requirePermission(user.id, "payments.reconcile");
  const refund = get<{ payment_id: string; amount_cents: number; status: string }>("SELECT payment_id, amount_cents, status FROM refunds WHERE id = ?", refundId);
  if (!refund || refund.status === "processed") throw new AppError(404, "Refund not found");
  const stamp = new Date().toISOString();
  const payment = get<{ reference_type: string; reference_id: string; amount_cents: number }>("SELECT reference_type, reference_id, amount_cents FROM payments WHERE id = ?", refund.payment_id);
  transaction(() => {
    run("UPDATE refunds SET status = 'processed_offline', processed_at = ? WHERE id = ?", stamp, refundId);
    if (payment && refund.amount_cents === payment.amount_cents) {
      run("UPDATE payments SET status = 'refunded' WHERE id = ?", refund.payment_id);
      if (payment.reference_type === "order") run("UPDATE marketplace_orders SET payment_status = 'refunded', order_status = 'refunded', updated_at = ? WHERE id = ?", stamp, payment.reference_id);
    }
  });
  audit(user.id, "refund.process", "refund", refundId);
}

export function listPayments(): Array<Record<string, unknown>> {
  ensureReady();
  return all("SELECT id, reference_type, reference_id, provider, amount_cents, status, verified_at, created_at FROM payments ORDER BY created_at DESC LIMIT 100");
}

export function paymentProviderStatus(): { provider: string; enabled: false; reason: string } {
  const provider = process.env.PAYMENT_PROVIDER || "none";
  const payfast = Boolean(process.env.PAYFAST_MERCHANT_ID && process.env.PAYFAST_MERCHANT_KEY && process.env.PAYFAST_PASSPHRASE);
  if (provider === "none" || provider === "") {
    return { provider: "none", enabled: false, reason: "No payment provider is configured. Payments stay disabled." };
  }
  if (provider === "payfast" && !payfast) {
    return { provider, enabled: false, reason: "PayFast is named, but the merchant id, key and passphrase are not all set. Payments stay disabled." };
  }
  return { provider, enabled: false, reason: "Provider settings may be present, but no sandbox payment has succeeded. Payments stay disabled." };
}
