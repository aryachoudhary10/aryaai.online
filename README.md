# Arya — Your Second Brain

A calm, no-friction place to empty your mind. You arrive, you dump a thought —
Arya extracts the people, places, dates and reminders and connects them. Flip to
**Ask** to get any of it back. Installable as a phone/desktop shortcut.

**Local-first & private by design.** Every person's memories live in *their own
browser* (localStorage) — nothing is stored on a server. Each user brings their
own **Google Gemini** API key, entered in Settings and kept only on their device.
No accounts, no login, no shared database. That's also why it deploys anywhere as
plain static files.

- **Home (`/`)** — one screen, one input, a **Dump / Ask** toggle.
- **Timeline (`/timeline`)** — dated moments arranged into your story.
- **Settings (`/settings`)** — paste your Gemini key, export or wipe your data.

**Stack:** Next.js (App Router), fully client-side. Without a key it falls back to
a built-in parser, so it works immediately.

---

## Run locally
```bash
cd arya-next
npm install
npm run dev
```
Open http://localhost:3000. Go to **Settings**, paste a Gemini key
(free at https://aistudio.google.com/apikey) — or skip it and use the built-in parser.

---

## Deploy to Vercel + point aryaai.online at it

There are no secrets to configure — the whole app is static and each user supplies
their own key in the browser. So deployment is simple.

1. **Push to GitHub.** Put the `arya-next` folder in a repo (e.g. `arya`).
   (Move it out of OneDrive first to avoid file-lock issues — see note below.)
2. **Import to Vercel.** vercel.com → *Add New → Project* → pick the repo.
   Framework auto-detects as **Next.js**. No environment variables needed. Deploy.
3. **Add your domain.** Project → *Settings → Domains* → add `aryaai.online`
   (and `www.aryaai.online`). Vercel shows the exact DNS records.
4. **Update DNS at your registrar** (wherever aryaai.online is managed):
   - Apex `aryaai.online` → **A** record to `76.76.21.21`
   - `www` → **CNAME** to `cname.vercel-dns.com`
   (Vercel will display the current values to use — follow those if they differ.)
5. Wait for DNS to propagate; Vercel issues HTTPS automatically. Done — Arya is
   now your homepage at aryaai.online, and you can Add to Home Screen.

> This **replaces** whatever currently serves aryaai.online. If you'd rather keep
> your old portfolio, add it on a subdomain like `brain.aryaai.online` instead.

---

## Notifications (Web Push) setup

Dated reminders and birthdays you dump are delivered as push notifications —
**even when the app is closed** — via a small serverless backend (Vercel) + Upstash
Redis. The notification wording is written on your device with your Gemini key; the
server only schedules and delivers it.

One-time setup:

1. **VAPID keys** — run `npx web-push generate-vapid-keys` (gives a public + private key).
2. **Upstash Redis** — create a free DB at https://console.upstash.com and copy the
   REST URL + token.
3. **Env vars** — add these locally in `.env.local` **and** in Vercel → Settings →
   Environment Variables:
   - `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`
   - `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (same value as the public key)
   - `VAPID_SUBJECT` (e.g. `mailto:you@example.com`)
   - `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`
   - `CRON_SECRET` (any long random string)
4. **Scheduler** — `vercel.json` already runs `/api/dispatch` every minute via Vercel Cron.
   - On Vercel **Pro**, per-minute cron works as-is.
   - On the **Hobby** (free) plan cron only fires once/day, so point a free external
     pinger at it every minute instead:
     `https://aryaai.online/api/dispatch?secret=YOUR_CRON_SECRET` (e.g. cron-job.org).
5. **Turn it on** — open the app → **Settings → Enable notifications → Send a test**.
   On iPhone, Add to Home Screen first (Apple requires an installed PWA for web push).

How it flows: enable → your device subscribes (`/api/subscribe`) → each dated reminder
is scheduled with ready-made copy (`/api/schedule`) → the cron hits `/api/dispatch`,
finds what's due, and pushes it. Your service worker (`public/sw.js`) shows it with
"Open" / "Got it" actions.

## How memory & retrieval work

**Storage (in your browser).** Everything is a JSON document in `localStorage`:
`memories` (raw notes), `entities` (people/companies/places with their relation,
company, place, prefs), `events`, and `reminders`. Entities reference each other by
name, so it's a lightweight *implicit graph* (you → Riya → Google), not a heavyweight
graph database. Embedding vectors are cached separately in `arya:vectors:v1`.

**Retrieval (what Ask sends to Gemini).** Ask does **not** send your whole brain.
It uses classic on-device RAG (`lib/retriever.js`):
1. Each memory is embedded once (Gemini embeddings, 256-dim) and cached locally.
2. Your question is embedded, then ranked against every memory by **cosine
   similarity** (exact brute-force — fast for a personal brain).
3. A **graph-style boost** lifts memories that mention an entity named in your
   question.
4. Only the top ~10 most relevant memories are sent to the model to answer.

Brute-force cosine is exact and quick at this scale; an ANN index like HNSW would
only matter at millions of vectors and can be dropped into `retriever.js` later.

## Notes
- **Data is per-device.** Clearing the browser's site data wipes your memories.
  Use **Settings → Export JSON** to back them up. (A cloud-sync option could be
  added later if you want.)
- **App icon** currently loads from an image CDN. To make it fully self-hosted,
  drop a 512×512 PNG into `public/` and point `app/manifest.js` + `app/layout.jsx`
  at it.
- **Don't develop inside OneDrive** — it locks `node_modules`/`.next` mid-sync.
  Use a path like `C:\dev\arya-next`.

---
*Your thoughts never leave your device, except your own Gemini calls to Google.*
