# Deploy Arya to aryaai.online — step by step

Goal: make Arya the only site at aryaai.online, with working push notifications.
Do these in order.

---

## 1. Folder
You're already set up at `C:\dev\arya-next` (out of OneDrive). Good.
> The `data/` folder (arya.sqlite*) is a leftover from an older version — safe to
> delete. It's gitignored and not used by this app.

## 2. Create the free accounts / keys
- **Upstash Redis** → https://console.upstash.com → create a database →
  copy its **REST URL** and **REST token**.
- **VAPID keys** → already generated (see section 4).
- **CRON_SECRET** → make up any long random string.
- **Gemini key** (entered in the app later) → https://aistudio.google.com/apikey

## 3. Put it on GitHub
Make `arya-next` its **own new repo** and publish it
(GitHub Desktop → Add Local Repository → Publish repository).
Do NOT reuse the old portfolio repo.

## 4. Create the Vercel project
- https://vercel.com → Add New → Project → import the new repo (auto-detects Next.js).
- Add these **Environment Variables** (Settings → Environment Variables):

```
VAPID_PUBLIC_KEY=BM79iEB9c4UotakSPUSKqllxnLIhEFXjW8eeu4_WgeqJCBvbcmjpwTa6ZX6-nli5nlNck15YYXVmWEomJiPagAs
VAPID_PRIVATE_KEY=6W3os7uNmy5qeVAa7mtLhywxyqjE-7DRt_-JOrjIKKU
NEXT_PUBLIC_VAPID_PUBLIC_KEY=BM79iEB9c4UotakSPUSKqllxnLIhEFXjW8eeu4_WgeqJCBvbcmjpwTa6ZX6-nli5nlNck15YYXVmWEomJiPagAs
VAPID_SUBJECT=mailto:sukhneers@gmail.com
UPSTASH_REDIS_REST_URL=(paste from Upstash)
UPSTASH_REDIS_REST_TOKEN=(paste from Upstash)
CRON_SECRET=(your random string)
```

- Deploy, then open the temporary `*.vercel.app` URL to confirm it loads.

> Security note: these VAPID keys are shared in plain text. Fine to use, but if you
> want fresh ones, run `npx web-push generate-vapid-keys` and replace all three VAPID values.

## 5. Remove the old site and take the domain
- Old project (the `portfolio_bot` one) → Settings → Domains → **remove**
  `aryaai.online` and `www`. (Optionally delete that whole project.)
- New Arya project → Settings → Domains → **add** `aryaai.online` and `www.aryaai.online`.
- Both are on Vercel, so DNS doesn't change; HTTPS reissues automatically.

## 6. Make reminders fire on time
Vercel's free plan only runs cron once/day. Pick one:
- Upgrade to Vercel **Pro** (the every-minute cron in `vercel.json` then works as-is), OR
- Free: at **https://cron-job.org**, create a job that GETs this every minute:
  `https://aryaai.online/api/dispatch?secret=YOUR_CRON_SECRET`

## 7. Turn it on (each device)
- Open **aryaai.online → Settings**, paste your **Gemini key**.
- **Settings → Enable notifications → Send a test** (arrives in ~5 seconds).
- On **iPhone**: Share → **Add to Home Screen** first, open it from the icon,
  THEN enable notifications. (Apple only allows web push from an installed PWA.)

---

## Done
aryaai.online is now Arya only, and dated reminders / birthdays push to your phone
even when the app is closed.

### If a reminder didn't arrive
- Env vars set in Vercel? (VAPID ×3, Upstash ×2, CRON_SECRET)
- Is the cron actually running every minute? (Pro, or cron-job.org pinger)
- Notifications enabled in Settings, and OS notifications allowed for the site?
- iPhone: was it added to the Home Screen before enabling?
