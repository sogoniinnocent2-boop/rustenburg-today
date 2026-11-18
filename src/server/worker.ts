import { expireVacancies, pullActiveSources } from "./citydesk";
import { publishDueArticles } from "./editorial";
import { run } from "./db";
import { deliverOutbox } from "./mail";
import { releaseExpiredTicketHolds } from "./platform";
import { processOverdueJourneys } from "./safetrack";

let timer: NodeJS.Timeout | null = null;
let last = 0;

export function processDueWork(): void {
  const now = new Date().toISOString();
  publishDueArticles();
  expireVacancies();
  void pullActiveSources();
  run("UPDATE products SET listing_status = 'expired', updated_at = ? WHERE listing_status = 'published' AND expires_at IS NOT NULL AND expires_at < ?", now, now);
  run("UPDATE deals SET status = 'expired', updated_at = ? WHERE status = 'published' AND ends_at IS NOT NULL AND ends_at < ?", now, now.slice(0, 10));
  run("UPDATE public_notices SET status = 'expired', updated_at = ? WHERE status = 'published' AND expires_at IS NOT NULL AND expires_at < ?", now, now);
  run("UPDATE map_points SET moderation_status = 'expired', updated_at = ? WHERE moderation_status = 'approved' AND expires_at IS NOT NULL AND expires_at < ?", now, now);
  void deliverOutbox();
  processOverdueJourneys();
  releaseExpiredTicketHolds();
}

export function maybeProcessWork(): void {
  const time = Date.now();
  if (time - last < 15000) return;
  last = time;
  try {
    processDueWork();
  } catch (error) {
    console.error("Background work failed", error);
  }
}

export function startWorker(): void {
  if (timer) return;
  timer = setInterval(() => {
    try {
      processDueWork();
    } catch (error) {
      console.error("Background work failed", error);
    }
  }, 60_000);
  if (typeof timer.unref === "function") timer.unref();
}
