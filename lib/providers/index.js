// Provider chain. Tries each configured backend in order and falls through on
// rate limits and upstream failures. Free tiers die without notice (Cerebras
// removed its permanent free tier in July 2026), so swapping the order or
// adding a backend should never touch anything outside this folder.

import { cloudflare } from "./cloudflare.js";
import { groq } from "./groq.js";
import { openrouter } from "./openrouter.js";

const CHAIN = [cloudflare, groq, openrouter];
const TIMEOUT_MS = Number(process.env.PROVIDER_TIMEOUT_MS || 20000);

export function configuredProviders() {
  return CHAIN.filter((p) => p.configured).map((p) => p.name);
}

export async function generate({ system, user }) {
  const available = CHAIN.filter((p) => p.configured);

  if (!available.length) {
    const err = new Error("No rephrase provider is configured on the server.");
    err.code = "NO_PROVIDER";
    throw err;
  }

  const failures = [];

  for (const provider of available) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
    try {
      const { text, model } = await provider.run({ system, user, signal: ac.signal });
      if (!text.trim()) throw new Error("empty response");
      return { text, provider: provider.name, model, failures };
    } catch (e) {
      const reason = e.name === "AbortError" ? `timeout after ${TIMEOUT_MS}ms` : e.message;
      failures.push({ provider: provider.name, reason });
      // A non-retryable error (bad token, malformed request) will fail the same
      // way on the next provider only if it is our bug, so keep going either
      // way -- but a 401/403 is worth surfacing in logs immediately.
      if (e.status === 401 || e.status === 403) {
        console.error(`[rephrase] ${provider.name} auth failed -- check its API key`);
      }
    } finally {
      clearTimeout(timer);
    }
  }

  const err = new Error("Every provider failed.");
  err.code = "ALL_FAILED";
  err.failures = failures;
  throw err;
}
