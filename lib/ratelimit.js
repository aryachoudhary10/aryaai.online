// Per-IP rate limiting backed by Upstash Redis.
// An open rephrase endpoint gets scraped within days, and the cost lands on
// whoever owns the provider keys -- so this is not optional in production.
// Degrades open (allows the request) if Redis is unreachable, because losing
// Redis should not take the whole app down.

import { Redis } from "@upstash/redis";

const WINDOW_SECONDS = Number(process.env.RATE_WINDOW_SECONDS || 60);
const MAX_IN_WINDOW = Number(process.env.RATE_MAX_PER_WINDOW || 12);
const MAX_PER_DAY = Number(process.env.RATE_MAX_PER_DAY || 200);

let redis = null;
function client() {
  if (redis) return redis;
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) return null;
  redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });
  return redis;
}

export function clientIp(req) {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") || "unknown";
}

export async function checkRateLimit(ip) {
  const r = client();
  if (!r) return { ok: true, skipped: true };

  const day = new Date().toISOString().slice(0, 10);
  const burstKey = `rl:burst:${ip}`;
  const dayKey = `rl:day:${ip}:${day}`;

  try {
    const [burst, daily] = await Promise.all([
      bump(r, burstKey, WINDOW_SECONDS),
      bump(r, dayKey, 86400),
    ]);

    if (burst > MAX_IN_WINDOW) {
      return { ok: false, retryAfter: WINDOW_SECONDS, reason: "Too many requests. Give it a few seconds." };
    }
    if (daily > MAX_PER_DAY) {
      return { ok: false, retryAfter: 3600, reason: "Daily limit reached. Try again tomorrow." };
    }
    return { ok: true, remainingToday: Math.max(0, MAX_PER_DAY - daily) };
  } catch (e) {
    console.warn("[ratelimit] Redis unavailable, allowing request:", e.message);
    return { ok: true, skipped: true };
  }
}

// INCR then set the TTL only on first write, so the window is fixed rather
// than sliding forward with every request.
async function bump(r, key, ttl) {
  const n = await r.incr(key);
  if (n === 1) await r.expire(key, ttl);
  return n;
}
