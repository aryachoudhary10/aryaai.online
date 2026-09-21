import { chromium } from "playwright";
import path from "path";

const EXT = path.resolve(import.meta.dirname, "../extension");
const ctx = await chromium.launchPersistentContext("", {
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
    channel: "chromium",
  headless: true,
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
});

const sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent("serviceworker", { timeout: 15000 });

// Stub the network inside the service worker so no provider key is needed.
await sw.evaluate(() => {
  const real = self.fetch;
  self.fetch = async (url, opts) => {
    if (String(url).includes("/api/rephrase")) {
      const b = JSON.parse(opts.body);
      self.__lastRequest = b;
      return new Response(JSON.stringify({
        variants: [`ONE(${b.tone})`, `TWO(${b.tone})`, `THREE(${b.tone})`], provider: "stub",
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return real(url, opts);
  };
});

const page = await ctx.newPage();
const errs = [];
page.on("pageerror", e => errs.push(String(e)));
await page.goto("file://" + path.resolve(import.meta.dirname, "fixtures-page.html"));

const fire = async (tone) => {
  await sw.evaluate(async (t) => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    await self.__run(tab.id, t);
  }, tone);
  await page.waitForTimeout(400);
};

// background.js keeps run() module-private; expose it for the harness.
await sw.evaluate(() => { self.__run = run; });

let fail = 0;
const check = (n, got, want) => {
  const ok = typeof want === "function" ? want(got) : got === want;
  if (!ok) fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${n.padEnd(46)}${ok ? "" : ` got ${JSON.stringify(got)}`}`);
};
const pick = (i) => page.evaluate((idx) => {
  const host = [...document.documentElement.children].find(e => e.shadowRoot === null && e.style.zIndex === "2147483647");
  return false;
}, i);

// The shadow root is closed, so drive it through the content script's own path:
// click coordinates won't work. Instead verify state the page can observe.

// --- 1. textarea with nothing highlighted -> whole field is sent ---
await page.click("#ta");
await fire("formal");
check("textarea: whole field sent when no highlight",
  await sw.evaluate(() => self.__lastRequest.text),
  "hey can u send me that file when u get a chance thx");
check("textarea: tone forwarded", await sw.evaluate(() => self.__lastRequest.tone), "formal");

// --- 2. partial selection in a textarea ---
await page.evaluate(() => { const t = document.getElementById("ta"); t.focus(); t.setSelectionRange(0, 3); });
await fire("casual");
check("textarea: only the highlighted range is sent",
  await sw.evaluate(() => self.__lastRequest.text), "hey");

// --- 3. input element ---
await page.click("#inp");
await fire("polite");
check("input: whole field sent", await sw.evaluate(() => self.__lastRequest.text), "pls review this asap");

// --- 4. contenteditable ---
await page.evaluate(() => {
  const ce = document.getElementById("ce");
  ce.focus();
  const r = document.createRange(); r.selectNodeContents(ce);
  const s = getSelection(); s.removeAllRanges(); s.addRange(r);
});
await fire("concise");
check("contenteditable: selection sent",
  await sw.evaluate(() => self.__lastRequest.text.trim()), "gonna need that report by friday ok");

// --- 5. non-editable paragraph ---
await page.evaluate(() => {
  const p = document.getElementById("plain");
  const r = document.createRange(); r.selectNodeContents(p);
  const s = getSelection(); s.removeAllRanges(); s.addRange(r);
  p.focus();
});
await fire("simple");
check("plain text: selection sent", await sw.evaluate(() => self.__lastRequest.text.slice(0, 20)), "This paragraph is no");

// --- 6. nothing selected, nothing focused -> no API call ---
await sw.evaluate(() => { self.__lastRequest = null; });
await page.evaluate(() => { document.activeElement?.blur?.(); getSelection().removeAllRanges(); });
await fire("natural");
check("empty selection: no request made", await sw.evaluate(() => self.__lastRequest), null);

// --- 7. over-length guard ---
await page.evaluate(() => { const t = document.getElementById("ta"); t.value = "x".repeat(2500); t.focus(); t.setSelectionRange(0, 2500); });
await sw.evaluate(() => { self.__lastRequest = null; });
await fire("natural");
check("over 2000 chars: blocked before the network", await sw.evaluate(() => self.__lastRequest), null);

check("no page errors", errs.length, 0);
if (errs.length) console.log(errs);

console.log(fail ? `\n${fail} FAILURES` : "\nall pass");
await ctx.close();
process.exit(fail ? 1 : 0);
