import { NextResponse } from "next/server";
import { redis, SUB } from "@/lib/server/redis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Store (or refresh) a device's push subscription.
export async function POST(req) {
  try {
    const { deviceId, subscription } = await req.json();
    if (!deviceId || !subscription) return NextResponse.json({ ok: false, error: "Missing deviceId/subscription" }, { status: 400 });
    await redis.set(SUB(deviceId), subscription);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
