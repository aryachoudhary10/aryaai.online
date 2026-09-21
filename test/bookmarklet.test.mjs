import { chromium } from "playwright";
import path from "path";
import { bookmarklet } from "../lib/bookmarklet.js";

const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await b.newPage();
const errs = []; page.on("pageerror", e => errs.push(String(e)));

// Stub the API in the page, since the bookmarklet fetches from page context.
await page.route("**/api/rephrase", (r) =>
  r.fulfill({ status: 200, contentType: "application/json",
    body: JSON.stringify({ variants: ["Rewrite A", "Rewrite B", "Rewrite C"], provider: "stub" }) }));

await page.goto("file://" + path.resolve(import.meta.dirname, "fixtures-react.html"));
await page.waitForSelector("#ta");

let fail = 0;
const check = (n, got, want) => { const ok = got === want; if (!ok) fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${n.padEnd(46)}${ok ? "" : ` got ${JSON.stringify(got)}`}`); };

const code = decodeURIComponent(bookmarklet("https://stub.test", "formal").slice("javascript:".length));

// Focus the React textarea, then run the bookmarklet exactly as a browser would.
await page.focus("#ta");
await page.evaluate(code);
await page.waitForTimeout(700);

const rows = await page.evaluate(() =>
  [...document.querySelectorAll("div[style*='2147483647'] button")].map(b => b.textContent));
check("panel rendered with 3 variants + close", rows.length, 4);
check("first variant shown", rows[1], "Rewrite A");

// Click a variant -> should replace inside the React-controlled field.
await page.evaluate(() => {
  [...document.querySelectorAll("div[style*='2147483647'] button")].find(b => b.textContent === "Rewrite B").click();
});
await page.waitForTimeout(400);

check("React state updated by bookmarklet", await page.textContent("#state"), "Rewrite B");
check("textarea value updated", await page.inputValue("#ta"), "Rewrite B");
check("panel closed after choosing",
  await page.evaluate(() => !document.querySelector("div[style*='2147483647']")), true);
check("re-entrancy guard released",
  await page.evaluate(() => window.__rp), 0);

// Run a second time to prove the guard does not lock it out permanently.
await page.focus("#ta");
await page.evaluate(code);
await page.waitForTimeout(700);
check("bookmarklet runs a second time",
  await page.evaluate(() => !!document.querySelector("div[style*='2147483647']")), true);

check("no page errors", errs.length, 0);
if (errs.length) console.log(errs);
console.log(fail ? `\n${fail} FAILURES` : "\nall pass");
await b.close();
process.exit(fail ? 1 : 0);
