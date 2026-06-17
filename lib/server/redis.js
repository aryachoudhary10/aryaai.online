// Server-only. Upstash Redis over REST (works in Vercel serverless functions).
import { Redis } from "@upstash/redis";

// Lazy: construct only when first used (avoids throwing during the build's
// page-data collection when env vars aren't present yet).
let _redis = null;
export function getRedis() {
  if (!_redis) _redis = Redis.fromEnv(); // reads UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN
  return _redis;
}

export const SUB = (deviceId) => `arya:sub:${deviceId}`;
export const DUE = "arya:due"; // sorted set, score = fire time (epoch ms)
