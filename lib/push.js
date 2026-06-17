// Client-side push: permission, subscription, and scheduling reminders.
// Notification COPY is written here (with the user's Gemini key) so the server
// never needs the key — it only stores and delivers the finished text.
import { getKey, getModel, hasKey } from "./understand.js";
import { knownPeople } from "./memory.js";

const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";

export function notifSupported() {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}
export function notifEnabled() {
  return notifSupported() && Notification.permission === "granted" && localStorage.getItem("arya:push") === "1";
}
export function pushConfigured() { return !!VAPID_PUBLIC; }

function deviceId() {
  let id = localStorage.getItem("arya:device");
  if (!id) { id = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random()); localStorage.setItem("arya:device", id); }
  return id;
}
const rid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random());

function b64ToUint8(base64) {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const b = (base64 + pad).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export async function enableNotifications() {
  if (!notifSupported()) throw new Error("This browser doesn't support notifications. On iPhone, add Arya to your Home Screen first.");
  if (!VAPID_PUBLIC) throw new Error("Push isn't configured on the server yet (missing VAPID key).");
  const perm = await Notification.requestPermission();
  if (perm !== "granted") throw new Error("Notifications were not allowed.");
  const reg = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToUint8(VAPID_PUBLIC) });
  const res = await fetch("/api/subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ deviceId: deviceId(), subscription: sub.toJSON() }) });
  const d = await res.json();
  if (!d.ok) throw new Error(d.error || "Couldn't register for notifications.");
  localStorage.setItem("arya:push", "1");
  return true;
}

async function scheduleRaw(items) {
  const res = await fetch("/api/schedule", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ deviceId: deviceId(), items }) });
  return res.json();
}

export async function testNotification() {
  return scheduleRaw([{ id: rid(), fireAt: new Date(Date.now() + 5000).toISOString(), title: "Arya ✦", body: "Notifications are on — I'll remember for you.", url: "/" }]);
}

/* ---------------- scheduling ---------------- */
const DAYS = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"];

export async function scheduleReminders(reminders, ctx) {
  if (!notifEnabled() || !reminders || !reminders.length) return;
  const now = Date.now();
  const items = [];

  for (const r of reminders) {
    const rep = r.repeat;

    // 1) Task decomposition — many pings across one day (finite, scheduled upfront)
    if (rep && (rep.type === "spread" || rep.type === "interval")) {
      const dateIso = r.dateIso || todayIso();
      const fromH = hourOf(rep.from, 9), toH = hourOf(rep.to, 21);
      let times = rep.type === "spread"
        ? spreadTimes(dateIso, clamp(rep.count || 1, 1, 16), fromH, toH)
        : intervalTimes(dateIso, Math.max(rep.everyMinutes || 120, 15), fromH, toH);
      times = times.filter((t) => t > now + 30000);
      if (!times.length) continue;
      const c = await copyFor(r, ctx, "task");
      times.forEach((t, i) => items.push({ id: rid(), fireAt: new Date(t).toISOString(), title: c.title, body: `${c.body} (${i + 1}/${times.length})`, url: "/" }));
      continue;
    }

    // 2) Recurring across days — daily / weekly (schedule next; server re-enqueues)
    if (rep && (rep.type === "daily" || rep.type === "weekly")) {
      const time = rep.time || r.time || "09:00";
      const first = rep.type === "daily" ? nextDaily(time) : nextWeekly(rep.weekday, time);
      const c = await copyFor(r, ctx, "day");
      items.push({ id: rid(), fireAt: new Date(first).toISOString(), title: c.title, body: c.body, url: "/", recur: { type: rep.type, weekday: rep.weekday || null, time } });
      continue;
    }

    // 3) Birthday — yearly recurring, relation-aware copy
    if (r.isBirthday && r.dateIso) {
      const md = r.dateIso.slice(5); // MM-DD
      const first = nextYearly(md);
      const relation = relationOf(r.who);
      const c = await copyFor({ ...r, relation }, ctx, "birthday");
      items.push({ id: rid(), fireAt: new Date(first).toISOString(), title: c.title, body: c.body, url: "/", recur: { type: "yearly", monthDay: md } });
      continue;
    }

    // 4) One-off at a specific time — heads-up 5 min before + at the time
    if (r.dateIso && r.time) {
      const base = combine(r.dateIso, r.time);
      const lead = base - 5 * 60000;
      if (lead > now + 5000) { const c = await copyFor(r, ctx, "lead"); items.push({ id: rid(), fireAt: new Date(lead).toISOString(), title: c.title, body: c.body, url: "/" }); }
      const c2 = await copyFor(r, ctx, "due");
      items.push({ id: rid(), fireAt: new Date(Math.max(base, now + 60000)).toISOString(), title: c2.title, body: c2.body, url: "/" });
      continue;
    }

    // 5) Date only — a single nudge at 9am
    if (r.dateIso) {
      const c = await copyFor(r, ctx, "day");
      items.push({ id: rid(), fireAt: fireTime(r.dateIso), title: c.title, body: c.body, url: "/" });
    }
  }
  if (items.length) await scheduleRaw(items);
}

/* ---------------- time helpers ---------------- */
function todayIso() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
function hourOf(hhmm, def) { if (!hhmm) return def; const h = parseInt(String(hhmm).split(":")[0], 10); return Number.isNaN(h) ? def : h; }
function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }
function combine(dateIso, time) { const [y, m, d] = dateIso.split("-").map(Number); const [hh, mm] = time.split(":").map(Number); return new Date(y, m - 1, d, hh, mm, 0).getTime(); }
function fireTime(dateIso) { const [y, m, d] = dateIso.split("-").map(Number); let t = new Date(y, m - 1, d, 9, 0, 0).getTime(); if (t < Date.now() + 30000) t = Date.now() + 60000; return new Date(t).toISOString(); }
function spreadTimes(dateIso, count, fromH, toH) {
  const [y, m, d] = dateIso.split("-").map(Number);
  const start = new Date(y, m - 1, d, fromH, 0, 0).getTime();
  const end = new Date(y, m - 1, d, toH, 0, 0).getTime();
  if (count <= 1) return [start];
  const step = (end - start) / (count - 1);
  return Array.from({ length: count }, (_, i) => Math.round(start + step * i));
}
function intervalTimes(dateIso, everyMin, fromH, toH) {
  const [y, m, d] = dateIso.split("-").map(Number);
  const end = new Date(y, m - 1, d, toH, 0, 0).getTime();
  let t = new Date(y, m - 1, d, fromH, 0, 0).getTime();
  const out = []; while (t <= end && out.length < 32) { out.push(t); t += everyMin * 60000; }
  return out;
}
function nextDaily(time) { const [hh, mm] = time.split(":").map(Number); const d = new Date(); d.setHours(hh, mm, 0, 0); if (d.getTime() < Date.now() + 30000) d.setDate(d.getDate() + 1); return d.getTime(); }
function nextWeekly(weekday, time) {
  const target = DAYS.indexOf((weekday || "sunday").toLowerCase());
  const [hh, mm] = time.split(":").map(Number);
  const d = new Date(); d.setHours(hh, mm, 0, 0);
  let add = (target - d.getDay() + 7) % 7;
  if (add === 0 && d.getTime() < Date.now() + 30000) add = 7;
  d.setDate(d.getDate() + add); return d.getTime();
}
function nextYearly(md) {
  const [mm, dd] = md.split("-").map(Number);
  const now = new Date(); let d = new Date(now.getFullYear(), mm - 1, dd, 9, 0, 0);
  if (d.getTime() < Date.now() + 30000) d = new Date(now.getFullYear() + 1, mm - 1, dd, 9, 0, 0);
  return d.getTime();
}
function relationOf(name) { if (!name) return null; const p = knownPeople().find((x) => x.name === name); return p ? p.relation : null; }

/* ---------------- copy ---------------- */
// when: "lead" | "due" | "day" | "task" | "birthday"
async function copyFor(r, ctx, when) {
  if (hasKey()) {
    try {
      const timing = when === "lead" ? "in 5 minutes" : when === "due" ? "right now" : when === "task" ? "as a recurring nudge today" : "today";
      const who = r.isBirthday ? `${r.relation ? "your " + r.relation + " " : ""}${r.who || "someone"}` : null;
      const sys = `Write a short, warm, slightly playful phone notification. Happening ${timing}. Title <= 5 words, body <= 14 words. Return ONLY JSON {"title":string,"body":string}.`;
      const subject = r.isBirthday ? `${who}'s birthday` : r.text;
      const user = `Reminder: ${subject}.${ctx ? ` Context: ${ctx}` : ""}`;
      const out = await geminiJSON(sys, user);
      if (out && out.title && out.body) return out;
    } catch { /* template fallback */ }
  }
  if (r.isBirthday) { const who = `${r.relation ? "your " + r.relation + " " : ""}${r.who || "someone"}`; return { title: "Birthday today", body: `It's ${who}'s birthday — send a wish?` }; }
  if (when === "lead") return { title: "In 5 minutes", body: `Coming up: ${r.text}` };
  if (when === "due") return { title: "Now", body: cap(r.text) };
  if (when === "task") return { title: "Quick nudge", body: cap(r.text) };
  return { title: "Reminder", body: cap(r.text) };
}

async function geminiJSON(system, user) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${getModel()}:generateContent?key=${encodeURIComponent(getKey())}`;
  const body = { system_instruction: { parts: [{ text: system }] }, contents: [{ role: "user", parts: [{ text: user }] }], generationConfig: { temperature: 0.7, responseMimeType: "application/json" } };
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error("gemini " + res.status);
  const data = await res.json();
  const raw = (data?.candidates?.[0]?.content?.parts?.[0]?.text || "").trim();
  return JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));
}
const cap = (s) => String(s).charAt(0).toUpperCase() + String(s).slice(1);
