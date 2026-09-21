// OpenRouter — third fallback, widest model catalogue.
// Free models carry the ":free" suffix. Without credits the cap is 50 req/day
// (20 req/min), rising to 1,000/day after a one-time $10 top-up.
// Docs: https://openrouter.ai/docs

import { providerError } from "./cloudflare.js";

const MODEL = process.env.OPENROUTER_MODEL || "deepseek/deepseek-chat-v3:free";

export const openrouter = {
  name: "openrouter",
  get configured() {
    return !!process.env.OPENROUTER_API_KEY;
  },
  async run({ system, user, signal }) {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      signal,
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        // OpenRouter uses these for its public app leaderboard; optional.
        ...(process.env.SITE_URL ? { "HTTP-Referer": process.env.SITE_URL } : {}),
        "X-Title": "Rephrase",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        temperature: 0.7,
        max_tokens: 1024,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw providerError("openrouter", res.status, body);
    }

    const data = await res.json();
    return { text: String(data?.choices?.[0]?.message?.content ?? ""), model: MODEL };
  },
};
