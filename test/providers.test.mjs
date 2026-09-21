process.env.CF_ACCOUNT_ID = "acct";
process.env.CF_API_TOKEN = "tok";
process.env.GROQ_API_KEY = "gk";
process.env.OPENROUTER_API_KEY = "ok";
process.env.PROVIDER_TIMEOUT_MS = "300";

const { generate } = await import("../lib/providers/index.js");

const real = globalThis.fetch;
function mock(plan) {
  globalThis.fetch = async (url, opts) => {
    const host = new URL(url).host;
    const key = host.includes("cloudflare") ? "cf" : host.includes("groq") ? "groq" : "or";
    const r = plan[key];
    if (r === "hang") return new Promise((_, rej) => opts.signal.addEventListener("abort", () => rej(Object.assign(new Error("aborted"), { name: "AbortError" }))));
    if (typeof r === "number") return new Response("upstream says no", { status: r });
    const body = key === "cf" ? { result: { response: r } } : { choices: [{ message: { content: r } }] };
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  };
}

const args = { system: "s", user: "u" };
let fail = 0;
const check = (name, got, want) => { const ok = got === want; if (!ok) fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${name.padEnd(34)} -> ${got}${ok ? "" : ` (wanted ${want})`}`); };

mock({ cf: '["a"]' });
check("all healthy: uses cloudflare", (await generate(args)).provider, "cloudflare");

mock({ cf: 429, groq: '["a"]' });
check("cf rate-limited: falls to groq", (await generate(args)).provider, "groq");

mock({ cf: 500, groq: 503, or: '["a"]' });
check("cf+groq down: falls to openrouter", (await generate(args)).provider, "openrouter");

mock({ cf: "hang", groq: '["a"]' });
check("cf times out: falls to groq", (await generate(args)).provider, "groq");

mock({ cf: "   ", groq: '["a"]' });
check("cf empty body: falls to groq", (await generate(args)).provider, "groq");

mock({ cf: 401, groq: '["a"]' });
check("cf bad key: falls to groq", (await generate(args)).provider, "groq");

mock({ cf: 500, groq: 500, or: 500 });
try { await generate(args); check("all down: throws", "no throw", "ALL_FAILED"); }
catch (e) { check("all down: throws ALL_FAILED", e.code, "ALL_FAILED"); console.log("      failures:", e.failures.map(f => `${f.provider}=${f.reason.slice(0,18)}`).join(", ")); }

for (const k of ["CF_ACCOUNT_ID","CF_API_TOKEN","GROQ_API_KEY","OPENROUTER_API_KEY"]) delete process.env[k];
const fresh = await import("../lib/providers/index.js?v=2");
try { await fresh.generate(args); check("none configured: throws", "no throw", "NO_PROVIDER"); }
catch (e) { check("none configured: NO_PROVIDER", e.code, "NO_PROVIDER"); }

globalThis.fetch = real;
console.log(fail ? `\n${fail} FAILURES` : "\nall pass");
process.exit(fail ? 1 : 0);
