import { NextResponse } from "next/server";
import { generate, configuredProviders } from "@/lib/providers/index.js";
import { checkRateLimit, clientIp } from "@/lib/ratelimit.js";
import { buildSystem, buildUser, parseVariants, TONES, MAX_INPUT, DEFAULT_TONE } from "@/lib/prompt.js";

export const runtime = "edge";
export const dynamic = "force-dynamic";

// The browser extension and the bookmarklet call this from other origins, so
// CORS has to be open. That is safe here only because the endpoint takes no
// cookies or auth: "*" grants the ability to call it, not access to anything
// private. Abuse is bounded by the per-IP rate limit, so a hostile page can at
// worst burn its own visitor's daily quota.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

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
      { status: 429, headers: { ...CORS, "Retry-After": String(limit.retryAfter) } }
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

    return NextResponse.json(
      {
        variants,
        tone,
        provider,
        model,
        remainingToday: limit.remainingToday ?? null,
      },
      { headers: CORS }
    );
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
  return NextResponse.json(
    {
      ok: true,
      providers: configuredProviders(),
      tones: Object.entries(TONES).map(([id, t]) => ({ id, ...t })),
      maxInput: MAX_INPUT,
    },
    { headers: CORS }
  );
}

function bad(message, status) {
  return NextResponse.json({ error: message }, { status, headers: CORS });
}
