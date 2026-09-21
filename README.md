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
npm test               # provider fallover + output parsing (fast, no browser)
npm run test:browser   # replacement, bookmarklet, extension (needs Chromium)
npm run test:all
npm run build
```

### Deploy

See [DEPLOY.md](./DEPLOY.md). Vercel is a one-click deploy; the API route runs
on the edge runtime.

---

## Using it anywhere you type

This is a website, not an app — and a true phone keyboard is the one thing a
website genuinely cannot be. Android keyboards must be an `InputMethodService`
and iOS keyboards a keyboard extension; both have to ship inside a signed app
from the store. There is no web path to either.

Everything short of that is covered, and `/tools` on the live site hands each
one out:

| Route | Where it works | In-place rewrite? |
|---|---|---|
| **Bookmarklet** | Every browser, **including Safari on iPhone** | Yes |
| **Browser extension** | Chrome, Edge, Brave, Firefox; Android via Firefox or Kiwi | Yes |
| **Share sheet** | Android (PWA `share_target`); iOS via a Shortcut | Opens the site |

"In-place" means the rewrite replaces what you selected, in the field you were
typing in — you never leave the page.

### Browser extension

Lives in `extension/`. Adds **Rephrase** to the right-click menu in every text
field, plus <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>R</kbd> and a toolbar popup.

It isn't in any store — load it unpacked:

- **Chrome / Edge / Brave** — `chrome://extensions` → enable *Developer mode* →
  *Load unpacked* → pick `extension/`
- **Firefox** — `about:debugging#/runtime/this-firefox` → *Load Temporary
  Add-on* → pick `extension/manifest.json`
- **Android** — Firefox or Kiwi Browser, same as desktop. This is how you get
  in-place rewriting on a phone without an app.

Then open its settings and point **Site URL** at your deployment.

Safari is the gap: its extensions require a native app wrapper built in Xcode.
Use the bookmarklet there.

### Bookmarklet

Generated per-deployment at `/tools`, with your origin baked in, so it works
without the extension and without an install. On a phone: save any bookmark,
rename it *Rephrase*, then paste the code over its URL. Type anywhere, pick it
from the address bar.

### Share sheet

Installing the PWA registers `share_target`, so Android lists Rephrase wherever
you tap Share. iOS ignores that; a Shortcut that POSTs to `/api/rephrase` and is
enabled for the share sheet gets you the same thing with no native code.

### Why replacement is fiddly

Gmail, X and Notion all use React, which tracks input values internally and
silently discards a plain `el.value = "..."`. Both the extension and the
bookmarklet write through the prototype's native value setter instead, then
dispatch a bubbling `input` event, so the framework sees a real edit.
`test/replace-react.test.mjs` asserts both halves of this — that the naive
approach fails, and that the shipped one works.

### If you ever do want a real keyboard

An Android `PROCESS_TEXT` activity is the cheap middle step: a manifest intent
filter puts **Rephrase** in the text-selection popup next to Copy/Paste, and
`setResult()` writes the rewrite back into the original field. It needs a thin
native wrapper, but no `InputMethodService`. A full IME means rendering every
key, autocorrect, layouts and languages — only worth it if the keyboard becomes
the product.

---

## Project layout

```
app/
  page.jsx                  UI (client component, statically prerendered)
  tools/page.jsx            bookmarklet generator + install instructions
  layout.jsx                fonts, metadata, theme bootstrap
  globals.css               design tokens + mobile layout
  manifest.js               PWA manifest incl. Android share_target
  _components/
    ThemeToggle.jsx         system / light / dark
    useKeyboardInset.js     lifts the action bar above the on-screen keyboard
  api/rephrase/route.js     edge route: validate → rate limit → generate
extension/                  browser extension (MV3), load unpacked
  background.js             context menu, keyboard command, the network call
  content.js                selection reading, the picker, in-place replacement
lib/
  bookmarklet.js            self-contained bookmarklet, origin injected at render
  prompt.js                 prompts, tone definitions, output parsing
  ratelimit.js              per-IP limits on Upstash Redis
  providers/
    index.js                the fallover chain
    cloudflare.js           primary
    groq.js                 fallback
    openrouter.js           second fallback
test/                       fallover, parsing, replacement, extension, bookmarklet
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

The API sends `Access-Control-Allow-Origin: *` so the extension and bookmarklet
can call it from other origins. That is safe only because the endpoint takes no
cookies or auth — it grants the ability to call, not access to anything private.
Abuse stays bounded by the per-IP rate limit.

Text typed here is sent to your server and on to whichever provider answers.
That is a real trade against the "stays on your device" model — say so plainly
in the UI if you keep that promise elsewhere. Nothing is logged or stored
server-side beyond a per-IP request counter in Redis.
