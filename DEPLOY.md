# Deploying Rephrase

## 1. Get at least one provider key

**Cloudflare Workers AI** (recommended primary — 10,000 neurons/day free, no card)

1. [dash.cloudflare.com](https://dash.cloudflare.com) → **Workers & Pages**
2. Copy the **Account ID** from the right sidebar → `CF_ACCOUNT_ID`
3. **My Profile → API Tokens → Create Token → "Workers AI" template** → `CF_API_TOKEN`

**Groq** (recommended fallback — very fast)

1. [console.groq.com/keys](https://console.groq.com/keys) → Create API Key → `GROQ_API_KEY`

**OpenRouter** (optional second fallback)

1. [openrouter.ai/keys](https://openrouter.ai/keys) → `OPENROUTER_API_KEY`

## 2. Rate limiting (do not skip)

An open rephrase endpoint gets scraped within days, and the bill lands on your
provider keys. Create a free Redis at [console.upstash.com](https://console.upstash.com)
and copy the REST URL + token into `UPSTASH_REDIS_REST_URL` and
`UPSTASH_REDIS_REST_TOKEN`.

Defaults are 12 requests/minute and 200/day per IP — tune with
`RATE_MAX_PER_WINDOW` and `RATE_MAX_PER_DAY`.

If Redis is unreachable the limiter **allows** the request rather than taking
the app down, so a missing config fails open. Check the values are actually set
in production.

## 3. Deploy to Vercel

```bash
npm i -g vercel
vercel
```

Then add every variable from `.env.example` under
**Project → Settings → Environment Variables**, and redeploy.

The API route uses the edge runtime, so it runs in Vercel's edge network with
no cold start. All providers are plain `fetch` calls and all storage is
Upstash's REST API, so nothing needs the Node runtime.

## 4. Verify

```bash
curl https://your-app.vercel.app/api/rephrase
# {"ok":true,"providers":["cloudflare","groq"], ...}
```

`providers` lists the backends that actually have keys configured. An empty
array means none of them are set, and every rewrite will return 503.

```bash
curl -X POST https://your-app.vercel.app/api/rephrase \
  -H 'Content-Type: application/json' \
  -d '{"text":"hey can u send me that file","tone":"formal"}'
```

## 5. Install on a phone

- **Android (Chrome):** menu → *Add to Home screen*. Rephrase then appears in
  the system share sheet — select text in any app → Share → Rephrase.
- **iOS (Safari):** Share → *Add to Home Screen*. iOS ignores `share_target`,
  so the share sheet hook needs a Shortcut or a native extension (see README).

## Cost

$0 up to roughly 1,300 rewrites/day across the free tiers. Past that,
Cloudflare bills $0.011 per 1,000 neurons — pennies — while Groq and
OpenRouter hard-stop until their daily windows reset.
