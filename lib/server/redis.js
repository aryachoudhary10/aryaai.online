// Server-only. Upstash Redis over REST (works in Vercel serverless functions).
import { Redis } from "@upstash/redis";

export const redis = Redis.fromEnv(); // reads UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN

export const SUB = (deviceId) => `arya:sub:${deviceId}`;
export const DUE = "arya:due"; // sorted set, score = fire time (epoch ms)
