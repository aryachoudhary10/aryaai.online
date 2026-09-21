import { NextResponse } from "next/server";
import { getRedis, DEV } from "@/lib/server/redis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// List a device's pending (not-yet-fired) notifications.
export async function GET(req) {
  try {
    const deviceId = new URL(req.url).searchParams.get("deviceId");
    if (!deviceId) return NextResponse.json({ ok: false, error: "Missing deviceId" }, { status: 400 });
    const redis = getRedis();
    const ids = await redis.smembers(DEV(deviceId));
    const items = [];
    for (const id of ids) {
      const rec = await redis.get(`arya:notif:${id}`);
      if (rec) items.push({ id, at: rec.at, title: rec.title, body: rec.body, recur: rec.recur || null });
      else await redis.srem(DEV(deviceId), id); // prune fired/stale
    }
    items.sort((a, b) => (a.at || 0) - (b.at || 0));
    return NextResponse.json({ ok: true, items });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
