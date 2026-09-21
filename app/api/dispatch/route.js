import { NextResponse } from "next/server";
import webpush from "web-push";
import { getRedis, DUE, SUB, DEV } from "@/lib/server/redis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

let vapidReady = false;
function initVapid() {
  if (vapidReady) return true;
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return false;
  webpush.setVapidDetails(VAPID_SUBJECT || "mailto:arya@example.com", VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  vapidReady = true;
  return true;
}

function authorized(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // not set → allow (dev)
  const auth = req.headers.get("authorization");
  if (auth === `Bearer ${secret}`) return true;             // Vercel Cron sends this
  const url = new URL(req.url);
  return url.searchParams.get("secret") === secret;          // or ?secret= for external pingers
}

// Called on a schedule (Vercel Cron or an external pinger). Delivers everything due.
export async function GET(req) {
  if (!authorized(req)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!initVapid()) return NextResponse.json({ ok: false, error: "VAPID keys not configured" }, { status: 500 });

  const redis = getRedis();
  const now = Date.now();
  const dueIds = await redis.zrange(DUE, 0, now, { byScore: true });
  let sent = 0, gone = 0;

  let requeued = 0;
  for (const id of dueIds) {
    const rec = await redis.get(`arya:notif:${id}`);
    if (rec) {
      const sub = await redis.get(SUB(rec.deviceId));
      if (sub) {
        try {
          await webpush.sendNotification(sub, JSON.stringify({ id, title: rec.title, body: rec.body, url: rec.url }));
          sent++;
        } catch (err) {
          if (err.statusCode === 404 || err.statusCode === 410) { await redis.del(SUB(rec.deviceId)); gone++; }
        }
      }
      // recurring → schedule the next occurrence (reuses the same copy)
      if (rec.recur) {
        const next = nextFire(rec.recur, rec.at || now);
        if (next) {
          const nid = crypto.randomUUID();
          await redis.set(`arya:notif:${nid}`, { ...rec, at: next });
          await redis.zadd(DUE, { score: next, member: nid });
          if (rec.deviceId) await redis.sadd(DEV(rec.deviceId), nid);
          requeued++;
        }
      }
      if (rec.deviceId) await redis.srem(DEV(rec.deviceId), id);
    }
    await redis.del(`arya:notif:${id}`);
    await redis.zrem(DUE, id);
  }
  return NextResponse.json({ ok: true, checked: dueIds.length, sent, gone, requeued });
}

function nextFire(recur, lastMs) {
  const d = new Date(lastMs);
  if (recur.type === "daily") { d.setDate(d.getDate() + 1); return d.getTime(); }
  if (recur.type === "weekly") { d.setDate(d.getDate() + 7); return d.getTime(); }
  if (recur.type === "yearly") { d.setFullYear(d.getFullYear() + 1); return d.getTime(); }
  return null;
}
