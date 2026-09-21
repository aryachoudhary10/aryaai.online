// Local-first memory store. Everything lives in the user's own browser
// (localStorage) — nothing is sent to any server except the user's own
// Gemini calls. See lib/understand.js.

const KEY = "arya:data:v1";
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function blank() { return { memories: [], entities: [], events: [], reminders: [], seq: 1 }; }

function load() {
  if (typeof window === "undefined") return blank();
  try { return { ...blank(), ...(JSON.parse(localStorage.getItem(KEY)) || {}) }; }
  catch { return blank(); }
}
function save(s) { if (typeof window !== "undefined") localStorage.setItem(KEY, JSON.stringify(s)); }

const findPerson = (s, name) => s.entities.find((e) => e.type === "person" && e.name === name);

export function knownPeople() {
  return load().entities.filter((e) => e.type === "person").map((e) => ({ name: e.name, relation: e.relation || null }));
}
export function listMemories() {
  return load().memories.slice().sort((a, b) => b.id - a.id);
}
export function clearAll() { save(blank()); }
export function exportJSON() { return JSON.stringify(load(), null, 2); }

export function detectAmbiguity(u) {
  const s = load();
  for (const p of u.people) {
    if (!p.relation) continue;
    const e = findPerson(s, p.name);
    if (e && e.relation && e.relation !== p.relation) return { name: p.name, known: e.relation, incoming: p.relation };
  }
  return null;
}

export function commit(text, u, opts = {}) {
  const s = load();
  const renamed = opts.renameMap || {};
  const nameOf = (n) => renamed[n] || n;
  const id = s.seq++;
  s.memories.push({ id, text, understanding: u, created_at: new Date().toISOString() });

  const upsert = (name, relation) => {
    name = nameOf(name);
    let e = findPerson(s, name);
    if (!e) { e = { name, type: "person", relation: relation || null, company: null, place: null, position: null, prefs: [], events: [] }; s.entities.push(e); }
    else if (relation && !e.relation) e.relation = relation;
    return e;
  };

  u.people.forEach((p) => upsert(p.name, p.relation));
  u.companies.forEach((c) => { if (!s.entities.find((e) => e.type === "company" && e.name === c)) s.entities.push({ name: c, type: "company" }); });
  u.places.forEach((pl) => { if (!s.entities.find((e) => e.type === "place" && e.name === pl)) s.entities.push({ name: pl, type: "place" }); });

  for (const [rawName, f] of Object.entries(u.facts || {})) {
    const e = upsert(rawName, null);
    if (f.company) e.company = f.company;
    if (f.place) e.place = f.place;
    if (f.position) e.position = f.position;
  }
  u.preferences.forEach((pr) => {
    if (!pr.who) return;
    const e = findPerson(s, nameOf(pr.who)); if (!e) return;
    e.prefs = e.prefs || []; if (!e.prefs.includes(pr.item)) e.prefs.push(pr.item);
  });
  u.events.forEach((ev) => {
    s.events.push({ id: s.seq++, title: ev.title, date: ev.dateIso || null, raw: text });
    if (ev.who) { const e = findPerson(s, nameOf(ev.who)); if (e) { e.events = e.events || []; e.events.push(ev.title); } }
  });
  u.reminders.forEach((r) => {
    s.reminders.push({ id: s.seq++, text: r.text, due_date: r.dateIso || null, recurring: r.recurring || null, label: r.label || "soon", is_birthday: !!r.isBirthday, who: r.who ? nameOf(r.who) : null, done: false, raw: text });
  });

  save(s);
  return id;
}

export function buildTimeline() {
  const s = load();
  const items = [];
  s.events.forEach((e) => items.push({ date: e.date || null, title: e.title }));
  s.reminders.forEach((r) => {
    if (!r.due_date) return; // recurring/undated reminders aren't timeline moments
    items.push({ date: r.due_date, title: r.is_birthday ? `${r.who ? r.who + "'s" : "A"} birthday` : `Reminder: ${capit(r.text)}` });
  });
  items.sort((a, b) => { if (!a.date) return 1; if (!b.date) return -1; return a.date < b.date ? -1 : 1; });
  const byYear = {};
  items.forEach((it) => { const y = it.date ? it.date.slice(0, 4) : "Undated"; (byYear[y] = byYear[y] || []).push({ title: it.title, when: it.date ? pretty(it.date) : "" }); });
  return Object.keys(byYear).sort().map((y) => ({ year: y, items: byYear[y] }));
}

export function summarize(u) {
  const seg = [];
  if (u.people.length) {
    const ppl = u.people.map((p) => (p.relation ? `${p.name} (your ${p.relation})` : p.name));
    seg.push(`Noted ${ppl.join(", ")}.`);
  }
  if (u.events.length) seg.push(u.events.map((e) => e.title.replace(/\.$/, "")).join(". ") + ".");
  else if (u.companies.length) seg.push(`Linked to ${u.companies.join(", ")}.`);
  if (u.places.length && !u.events.length && !u.companies.length) seg.push(`Place: ${u.places.join(", ")}.`);
  if (u.preferences.length) seg.push(`Likes ${u.preferences.map((p) => p.item).join(", ")}.`);
  if (u.reminders.length) {
    const rem = u.reminders.map((r) => r.isBirthday
      ? `birthday${r.who ? " for " + r.who : ""}${r.dateIso ? " on " + pretty(r.dateIso) : ""}`
      : `${r.text}${r.dateIso ? " on " + pretty(r.dateIso) : r.recurring ? " " + r.label : ""}`);
    seg.push(`Reminder: ${rem.join("; ")}.`);
  }
  if (!seg.length) return "Saved to your memory. I'll connect it as I learn more.";
  return "Got it — " + seg.join(" ");
}

function pretty(s) { const [y, m, d] = s.split("-").map(Number); return `${d} ${MONTHS[m - 1]} ${y}`; }
function capit(x) { return String(x).charAt(0).toUpperCase() + String(x).slice(1); }
