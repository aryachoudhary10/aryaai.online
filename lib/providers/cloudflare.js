// Cloudflare Workers AI — primary provider.
// Free allowance: 10,000 neurons/day (~1,300 responses). Overage bills at
// $0.011/1k neurons instead of hard-failing, which is why it leads the chain.
// Docs: https://developers.cloudflare.com/workers-ai/

const MODEL = process.env.CF_MODEL || "@cf/meta/llama-4-scout-17b-16e-instruct";

export const cloudflare = {
  name: "cloudflare",
  get configured() {
    return !!(process.env.CF_ACCOUNT_ID && process.env.CF_API_TOKEN);
  },
  async run({ system, user, signal }) {
    const url = `https://api.cloudflare.com/client/v4/accounts/${process.env.CF_ACCOUNT_ID}/ai/run/${MODEL}`;
    const res = await fetch(url, {
      method: "POST",
      signal,
      headers: {
        Authorization: `Bearer ${process.env.CF_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
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
      throw providerError("cloudflare", res.status, body);
    }

    const data = await res.json();
    // Workers AI wraps the payload in { success, result: { response } }.
    const text = data?.result?.response ?? data?.result?.[0]?.response ?? "";
    return { text: String(text), model: MODEL };
  },
};

export function providerError(provider, status, body) {
  const err = new Error(`${provider} ${status}: ${String(body).slice(0, 300)}`);
  err.status = status;
  err.provider = provider;
  // 408/409 are not retryable upstream states, but 429 and 5xx mean
  // "try the next provider" rather than "the request was bad".
  err.retryable = status === 429 || status === 408 || status >= 500;
  return err;
}
