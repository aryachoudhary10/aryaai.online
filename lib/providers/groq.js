// Groq — fallback provider. OpenAI-compatible chat completions endpoint.
// Free tier on llama-3.1-8b-instant: 30 RPM, 14,400 req/day, 500k tokens/day.
// Fast enough (~500 tok/s) that failing over is barely perceptible.
// Docs: https://console.groq.com/docs

import { providerError } from "./cloudflare.js";

const MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

export const groq = {
  name: "groq",
  get configured() {
    return !!process.env.GROQ_API_KEY;
  },
  async run({ system, user, signal }) {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      signal,
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        "Content-Type": "application/json",
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
      throw providerError("groq", res.status, body);
    }

    const data = await res.json();
    return { text: String(data?.choices?.[0]?.message?.content ?? ""), model: MODEL };
  },
};
