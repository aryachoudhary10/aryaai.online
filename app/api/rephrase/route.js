import { NextResponse } from "next/server";
import { generate, configuredProviders } from "@/lib/providers/index.js";
import { checkRateLimit, clientIp } from "@/lib/ratelimit.js";
import { buildSystem, buildUser, parseVariants, TONES, MAX_INPUT, DEFAULT_TONE } from "@/lib/prompt.js";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return bad("Send a JSON body.", 400);
  }

  const text = String(body?.text ?? "").trim();
  const tone = Object.hasOwn(TONES, body?.tone) ? body.tone : DEFAULT_TONE;

  if (!text) return bad("Type or paste some text first.", 400);
  if (text.length > MAX_INPUT) {
    return bad(`That's ${text.length} characters. The limit is ${MAX_INPUT}.`, 413);
  }

  const ip = clientIp(req);
  const limit = await checkRateLimit(ip);
  if (!limit.ok) {
    return NextResponse.json(
      { error: limit.reason },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } }
    );
  }

  try {
    const { text: raw, provider, model } = await generate({
      system: buildSystem(tone),
      user: buildUser(text),
    });

    const variants = parseVariants(raw);
    if (!variants.length) {
      return bad("The model returned something unusable. Try again.", 502);
    }

    return NextResponse.json({
      variants,
      tone,
      provider,
      model,
      remainingToday: limit.remainingToday ?? null,
    });
  } catch (e) {
    if (e.code === "NO_PROVIDER") {
      return bad("No rephrase provider is configured. Set CF_ACCOUNT_ID + CF_API_TOKEN or GROQ_API_KEY.", 503);
    }
    console.error("[rephrase] all providers failed:", e.failures);
    return bad("Every backend is busy right now. Try again in a moment.", 503);
  }
}

// Lets the UI show which backends are live without exposing any key.
export async function GET() {
  return NextResponse.json({
    ok: true,
    providers: configuredProviders(),
    tones: Object.entries(TONES).map(([id, t]) => ({ id, ...t })),
    maxInput: MAX_INPUT,
  });
}

function bad(message, status) {
  return NextResponse.json({ error: message }, { status });
}
