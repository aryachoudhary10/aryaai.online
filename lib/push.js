// Client-side push: permission, subscription, and scheduling reminders.
// Notification COPY is written here (with the user's Gemini key) so the server
// never needs the key — it only stores and delivers the finished text.
import { getKey, getModel, hasKey } from "./understand.js";

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

// Turn freshly-captured reminders into scheduled, nicely-worded notifications.
export async function scheduleReminders(reminders, ctx) {
  if (!notifEnabled() || !reminders || !reminders.length) return;
  const items = [];
  for (const r of reminders) {
    if (!r.dateIso) continue; // only dated reminders / birthdays get pushed
    const { title, body } = await copyFor(r, ctx);
    items.push({ id: rid(), fireAt: fireTime(r.dateIso), title, body, url: "/" });
  }
  if (items.length) await scheduleRaw(items);
}

function fireTime(dateIso) {
  const [y, m, d] = dateIso.split("-").map(Number);
  let t = new Date(y, m - 1, d, 9, 0, 0).getTime(); // 9am local on the day
  if (t < Date.now() + 30000) t = Date.now() + 60000; // if already past, fire shortly
  return new Date(t).toISOString();
}

async function copyFor(r, ctx) {
  if (hasKey()) {
    try {
      const sys = `Write a short, warm, slightly playful phone notification reminding the user. Title <= 5 words, body <= 14 words. Return ONLY JSON {"title":string,"body":string}.`;
      const subject = r.isBirthday ? `${r.who || "someone"}'s birthday` : r.text;
      const user = `Reminder: ${subject}.${r.who ? ` Person: ${r.who}.` : ""}${ctx ? ` Context: ${ctx}` : ""}`;
      const out = await geminiJSON(sys, user);
      if (out && out.title && out.body) return out;
    } catch { /* fall through to template */ }
  }
  if (r.isBirthday) return { title: "Birthday today", body: `It's ${r.who || "someone"}'s birthday — send a quick wish?` };
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
