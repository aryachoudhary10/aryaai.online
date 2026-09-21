import { chromium } from "playwright";
import path from "path";
import fs from "fs";

// Pull the real write() implementation out of the shipped content script so
// this tests the actual code, not a copy that can drift.
const src = fs.readFileSync(new URL("../extension/content.js", import.meta.url), "utf8");
const body = src.slice(src.indexOf("function write(value)"), src.indexOf("// --- UI ---"));

const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await b.newPage();
const errs = []; page.on("pageerror", e => errs.push(String(e)));
await page.goto("file://" + path.resolve(import.meta.dirname, "fixtures-react.html"));
await page.waitForSelector("#ta");

let fail = 0;
const check = (n, got, want) => { const ok = got === want; if (!ok) fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${n.padEnd(48)}${ok ? "" : ` got ${JSON.stringify(got)} want ${JSON.stringify(want)}`}`); };

const before = await page.textContent("#count");

// Naive assignment: what the code would do WITHOUT the native-setter trick.
await page.evaluate(() => {
  const el = document.getElementById("ta");
  el.value = "NAIVE ASSIGNMENT";
  el.dispatchEvent(new Event("input", { bubbles: true }));
});
await page.waitForTimeout(200);
check("naive el.value= does NOT update React state",
  await page.textContent("#state"), "pls send that file asap");

// Now the shipped implementation.
await page.evaluate(`
  let target = { el: document.getElementById("ta"), start: 0, end: document.getElementById("ta").value.length, kind: "field" };
  ${body}
  window.__write = write;
`);
await page.evaluate(() => window.__write("Could you send that file when you have a moment?"));
await page.waitForTimeout(250);

check("native setter DOES update React state",
  await page.textContent("#state"), "Could you send that file when you have a moment?");
check("DOM value matches",
  await page.inputValue("#ta"), "Could you send that file when you have a moment?");
check("React onChange fired exactly once",
  Number(await page.textContent("#count")) - Number(before), 1);

// Partial-range replacement inside a React field.
await page.evaluate(() => {
  const el = document.getElementById("ta");
  window.__t = { el, start: 0, end: 5, kind: "field" };
});
await page.evaluate(`
  let target = window.__t;
  ${body}
  write("Would");
`);
await page.waitForTimeout(250);
check("partial range replaced correctly",
  await page.inputValue("#ta"), "Would you send that file when you have a moment?");

check("no page errors", errs.length, 0);
if (errs.length) console.log(errs);
console.log(fail ? `\n${fail} FAILURES` : "\nall pass");
await b.close();
process.exit(fail ? 1 : 0);
