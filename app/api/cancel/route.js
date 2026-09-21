import { NextResponse } from "next/server";
import { getRedis, DUE, DEV } from "@/lib/server/redis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Cancel a pending notification.
export async function POST(req) {
  try {
    const { deviceId, id } = await req.json();
    if (!deviceId || !id) return NextResponse.json({ ok: false, error: "Missing deviceId/id" }, { status: 400 });
    const redis = getRedis();
    await redis.zrem(DUE, id);
    await redis.del(`arya:notif:${id}`);
    await redis.srem(DEV(deviceId), id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
