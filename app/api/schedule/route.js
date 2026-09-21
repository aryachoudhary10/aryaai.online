import { NextResponse } from "next/server";
import { getRedis, DUE, DEV } from "@/lib/server/redis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Queue one or more notifications to be delivered at a future time.
// Body: { deviceId, items: [{ id, fireAt (ISO), title, body, url }] }
export async function POST(req) {
  try {
    const { deviceId, items } = await req.json();
    if (!deviceId || !Array.isArray(items) || !items.length) {
      return NextResponse.json({ ok: false, error: "Missing deviceId/items" }, { status: 400 });
    }
    const redis = getRedis();
    let queued = 0;
    for (const it of items) {
      const when = Date.parse(it.fireAt);
      if (!it.id || Number.isNaN(when)) continue;
      await redis.set(`arya:notif:${it.id}`, { deviceId, title: it.title || "Arya", body: it.body || "", url: it.url || "/", recur: it.recur || null, at: when });
      await redis.zadd(DUE, { score: when, member: it.id });
      await redis.sadd(DEV(deviceId), it.id);
      queued++;
    }
    return NextResponse.json({ ok: true, queued });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
