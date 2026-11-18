import { AppError } from "./errors";
import { audit } from "./store";
import { get } from "./db";
import { ensureReady } from "./init";

const DAILY_LIMIT = 20;

export function aiConfigured(): boolean {
  return Boolean(process.env.AI_PROVIDER && process.env.AI_API_KEY);
}

export function aiStatus(): { connected: false; reason: string; dailyLimit: number } {
  if (!aiConfigured()) return { connected: false, reason: "No AI provider is configured.", dailyLimit: DAILY_LIMIT };
  return { connected: false, reason: "A provider name is set, but no live model test has passed, so the assistant stays off.", dailyLimit: DAILY_LIMIT };
}

function requestsToday(userId: string): number {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  return get<{ count: number }>("SELECT COUNT(*) as count FROM audit_logs WHERE actor_id = ? AND action = 'ai.request' AND created_at >= ?", userId, start.toISOString())?.count ?? 0;
}

export function requestAi(userId: string | null, prompt: string): never {
  ensureReady();
  const characters = prompt.length;
  if (characters > 8000) {
    audit(userId, "ai.request", "ai", "assistant", { characters, outcome: "too-long" });
    throw new AppError(413, "That request is too long.");
  }
  if (!aiConfigured()) {
    audit(userId, "ai.request", "ai", "assistant", { characters, outcome: "unconfigured" });
    throw new AppError(503, "No AI provider is configured.");
  }
  if (userId && requestsToday(userId) >= DAILY_LIMIT) {
    audit(userId, "ai.request", "ai", "assistant", { characters, outcome: "limited" });
    throw new AppError(429, "The daily assistant limit has been reached.");
  }
  audit(userId, "ai.request", "ai", "assistant", { characters, outcome: "blocked" });
  throw new AppError(503, "A provider name is set, but no live model test has passed, so the assistant stays off.");
}
