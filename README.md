# Rephrase

Rewrite any text in the tone you need. No Gemini, no OpenAI, no Anthropic —
the backend runs open-weights models on free tiers, and falls over between
providers so one dead free tier doesn't take the app down.

Mobile-first PWA. Install it to your home screen and it behaves like an app.

---

## How it works

```
Browser  ──POST /api/rephrase──►  rate limit (Upstash)
                                        │
                                        ▼
                             provider chain, in order
                       ┌────────────────┼────────────────┐
                  Cloudflare          Groq          OpenRouter
                  Workers AI      (Llama 3.3)       (DeepSeek)
                       └────────────────┴────────────────┘
                              first one that answers wins
```

Rephrasing is one of the few tasks where open-weights models genuinely match
frontier models — it isn't a reasoning problem. A 24–70B open model rewriting a
paragraph is essentially indistinguishable from GPT-4-class output.

### Provider free tiers (September 2026)

| Provider | Free allowance | Default model |
|---|---|---|
| Cloudflare Workers AI | 10,000 neurons/day (~1,300 rewrites), no card | `@cf/meta/llama-4-scout-17b-16e-instruct` |
| Groq | 30 req/min; 70B: 1,000 req + 100k tok/day | `llama-3.3-70b-versatile` |
| OpenRouter | 50 req/day, or 1,000/day after a one-time $10 | `deepseek/deepseek-chat-v3:free` |

Cloudflare leads because it bills cheap overage ($0.011/1k neurons) instead of
hard-failing at the cap — which matters when real users hit the site.

> Free tiers die without notice. Cerebras removed its permanent free tier in
> July 2026. That's why everything provider-specific lives in `lib/providers/`
> behind one interface — adding or reordering a backend touches nothing else.

---

## Setup

```bash
npm install
cp .env.example .env.local     # fill in at least one provider
npm run dev
```

You need **at least one** provider key. `.env.example` has the signup links.

```bash
npm test      # provider fallover + output parsing
npm run build
```

### Deploy

See [DEPLOY.md](./DEPLOY.md). Vercel is a one-click deploy; the API route runs
on the edge runtime.

---

## Putting it in the keyboard

You asked whether this can live in the keyboard itself. Short answer: **a web
app can't be a keyboard** — both platforms require a native extension for that.
But you can get most of the benefit for much less work, and there's a clear
order to do it in.

### Android

| Approach | Effort | Reach | Native code? |
|---|---|---|---|
| **1. Share sheet** (built) | Done | Any app with a Share button | No |
| **2. Text-selection action** | ~1 day | Select text anywhere → "Rephrase" in the popup | Thin wrapper |
| **3. Real keyboard** | Weeks | Every text field, no app switch | Full IME |

**Already working:** the PWA declares a `share_target` in `app/manifest.js`, so
once it's installed, Rephrase appears in Android's system share sheet. Select
text → Share → Rephrase, and it opens with the text loaded.

**The best value by far is #2.** Android lets any app add an entry to the text
selection popup — the same menu as Copy/Paste — with a manifest intent filter
and no keyboard work at all:

```xml
<activity android:name=".ProcessTextActivity" android:label="Rephrase">
  <intent-filter>
    <action android:name="android.intent.action.PROCESS_TEXT" />
    <category android:name="android.intent.category.DEFAULT" />
    <data android:mimeType="text/plain" />
  </intent-filter>
</activity>
```

The selected text arrives as `Intent.EXTRA_PROCESS_TEXT`. Crucially, you can
**write the rewrite straight back into the original field** by returning
`setResult()` with the replacement in the same extra — the user never leaves
their email or WhatsApp. That is 90% of the "it's in my keyboard" feeling for a
fraction of the cost. The activity can be a thin shell hosting this web UI.

**#3, a real keyboard**, means an `InputMethodService` in Kotlin: you render
every key yourself, handle autocorrect, layouts, languages, dark mode, and
landscape. Users must then enable it in Settings and switch to it. Only worth it
if the keyboard becomes the product.

### iOS

Stricter. Two realistic paths:

- **Share Sheet / Action Extension** — a small Swift extension that appears when
  you select text and tap Share. Same idea as Android's #1.
- **Custom Keyboard Extension** — technically possible, but to reach your API it
  must set [`RequestsOpenAccess`](https://developer.apple.com/documentation/bundleresources/information-property-list/nsextension/nsextensionattributes/requestsopenaccess)
  and the user must manually toggle **Allow Full Access** in Settings, which
  shows a scary warning saying the keyboard can see everything they type. Most
  people decline. Plan for low opt-in.

iOS ignores `share_target`, so the PWA can't hook the share sheet on its own.

**Zero-code iOS option worth trying first:** the Shortcuts app can call
`/api/rephrase` directly and appears in the share sheet. Good way to validate
demand before writing any Swift.

### Suggested order

1. **Ship the PWA** — works everywhere today, no app stores.
2. **Android `PROCESS_TEXT`** — biggest win per hour spent, replaces text in place.
3. **iOS Shortcut** — validate iOS demand with no native code.
4. **Native extensions / IME** — only once usage justifies it.

---

## Project layout

```
app/
  page.jsx                  UI (client component, statically prerendered)
  layout.jsx                fonts, metadata, theme bootstrap
  globals.css               design tokens + mobile layout
  manifest.js               PWA manifest incl. Android share_target
  _components/
    ThemeToggle.jsx         system / light / dark
    useKeyboardInset.js     lifts the action bar above the on-screen keyboard
  api/rephrase/route.js     edge route: validate → rate limit → generate
lib/
  prompt.js                 prompts, tone definitions, output parsing
  ratelimit.js              per-IP limits on Upstash Redis
  providers/
    index.js                the fallover chain
    cloudflare.js           primary
    groq.js                 fallback
    openrouter.js           second fallback
test/                       fallover + parsing tests
```

## Mobile behaviour worth knowing about

These are deliberate and easy to break by accident:

- **Textarea is 16px.** Anything smaller makes iOS Safari zoom the viewport on focus.
- **`useKeyboardInset`** reads `visualViewport` because iOS doesn't resize the
  layout viewport for the on-screen keyboard, so a `position: fixed` bar ends up
  buried under it. Android usually resizes instead, where the hook is a no-op.
- **No `useSearchParams`.** It opts the route out of static rendering, which
  leaves phones on a blank screen until the JS bundle lands. The query string is
  read from `window.location` in an effect instead.
- **Safe-area insets** on the header and action bar, for notches and home indicators.
- **`100dvh`**, not `100vh` — mobile browser chrome changes the viewport height.
- Pinch-zoom is left enabled. Disabling it is an accessibility failure.

## Privacy

Text typed here is sent to your server and on to whichever provider answers.
That is a real trade against the "stays on your device" model — say so plainly
in the UI if you keep that promise elsewhere. Nothing is logged or stored
server-side beyond a per-IP request counter in Redis.
