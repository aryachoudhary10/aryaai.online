// Understanding engine — runs entirely in the browser.
// If the user has saved their own Gemini API key, we call Gemini directly
// (key never leaves their device except to Google). Otherwise we use a
// built-in heuristic parser so the app still works.

import { retrieve } from "./retriever.js";

const K_KEY = "arya:gemini_key";
const K_MODEL = "arya:gemini_model";
const DEFAULT_MODEL = "gemini-2.0-flash";

export const getKey = () => (typeof window === "undefined" ? "" : localStorage.getItem(K_KEY) || "");
export const setKey = (v) => localStorage.setItem(K_KEY, (v || "").trim());
export const getModel = () => (typeof window === "undefined" ? DEFAULT_MODEL : localStorage.getItem(K_MODEL) || DEFAULT_MODEL);
export const setModel = (v) => localStorage.setItem(K_MODEL, (v || "").trim() || DEFAULT_MODEL);
export const hasKey = () => !!getKey();
export const aiMode = () => (hasKey() ? `Gemini · ${getModel()}` : "Built-in parser");

const iso = (d) => d.toISOString().slice(0, 10);

async function gemini(system, user, json) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${getModel()}:generateContent?key=${encodeURIComponent(getKey())}`;
  const body = {
    system_instruction: { parts: [{ text: system }] },
    contents: [{ role: "user", parts: [{ text: user }] }],
    generationConfig: { temperature: 0.2, ...(json ? { responseMimeType: "application/json" } : {}) },
  };
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) {
    let msg = `Gemini error ${res.status}`;
    try { const e = await res.json(); msg = e?.error?.message || msg; } catch {}
    throw new Error(msg);
  }
  const data = await res.json();
  return (data?.candidates?.[0]?.content?.parts?.[0]?.text || "").trim();
}

export async function extract(text, { today, knownPeople = [] }) {
  if (hasKey()) {
    try {
      const known = knownPeople.length ? `Known people (reuse exact names): ${JSON.stringify(knownPeople)}.` : "No people known yet.";
      const sys = `You are the understanding engine of a personal "second brain". Extract structured memory from one note. Today is ${iso(today)}. ${known} Resolve relative dates to absolute YYYY-MM-DD. Return ONLY JSON matching: {"people":[{"name":string,"relation":string|null}],"companies":[string],"places":[string],"events":[{"title":string,"who":string|null,"dateIso":string|null}],"preferences":[{"who":string|null,"item":string}],"reminders":[{"text":string,"dateIso":string|null,"time":string|null,"offsetMinutes":number|null,"repeat":object|null,"recurring":string|null,"label":string,"isBirthday":boolean,"who":string|null}],"facts":{"<PersonName>":{"company":string,"place":string,"position":string}}}. relation = your relationship to them. time = 24h "HH:MM" when a clock time is mentioned (e.g. "9pm"->"21:00"), else null; a time with no date means today. offsetMinutes = for relative offsets like "in 10 minutes" (->10) or "after 2 hours" (->120); when offsetMinutes is set, leave dateIso and time null (the device adds it to the current time). repeat captures multi-fire intents: {"type":"spread","count":N,"from":"HH:MM","to":"HH:MM"} for "do N times across the day" (e.g. drink 4L water -> count 8, 08:00-22:00); {"type":"interval","everyMinutes":M,"from":"HH:MM","to":"HH:MM"} for every M minutes in a window; {"type":"daily","time":"HH:MM"} or {"type":"weekly","weekday":"sunday","time":"HH:MM"} for recurring; else null. Create a SEPARATE reminder for EVERY time-anchored thing the user should be nudged about — meetings, calls, sleep, wake-up, tasks — so one note can produce multiple reminders (e.g. "sleep at 11pm because meeting tomorrow at 8" -> a sleep reminder tonight AND a meeting reminder at 08:00 tomorrow). Treat appointments/meetings that have a time as reminders (so they notify), not just events. Only include what you find.`;
      const raw = await gemini(sys, text, true);
      return normalize(JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)));
    } catch (e) {
      console.warn("[understand] Gemini failed, using fallback:", e.message);
    }
  }
  return normalize(heuristic(text, today));
}

export async function answer(question, memories) {
  // Only the relevant subset is ever sent to Gemini — never the whole brain.
  // retrieve() uses embeddings + cosine similarity (see lib/retriever.js).
  const pool = await retrieve(question, memories, 10);
  if (hasKey() && pool.length) {
    try {
      const ctx = pool.map((m) => `[#${m.id} ${m.created_at.slice(0, 10)}] ${m.text}`).join("\n");
      const sys = `Answer the user's question using ONLY these memories. Be concise (1-2 sentences). If unknown, say so. Then on a new line: EVIDENCE: <comma-separated memory #ids used>.\nMemories:\n${ctx}`;
      const out = await gemini(sys, question, false);
      const m = out.match(/EVIDENCE:\s*(.*)$/i);
      const ids = m ? (m[1].match(/\d+/g) || []).map(Number) : [];
      return { answer: out.replace(/EVIDENCE:.*$/i, "").trim(), evidenceIds: ids, sent: pool.length };
    } catch (e) {
      console.warn("[understand] Gemini answer failed:", e.message);
    }
  }
  const words = question.toLowerCase().split(/\W+/).filter((w) => w.length > 3);
  const hits = pool.filter((m) => words.some((w) => m.text.toLowerCase().includes(w)));
  return {
    answer: hits.length ? `I found ${hits.length} related memor${hits.length > 1 ? "ies" : "y"}.` : "I couldn't find a memory for that yet.",
    evidenceIds: hits.slice(0, 3).map((m) => m.id),
    sent: pool.length,
  };
}

/* ---------------- heuristic fallback ---------------- */
const RELATIONS = { sister:"sister",brother:"brother",mom:"mother",mum:"mother",mother:"mother",dad:"father",father:"father",cousin:"cousin",friend:"friend",manager:"manager",boss:"manager",colleague:"colleague",wife:"wife",husband:"husband",girlfriend:"partner",boyfriend:"partner",uncle:"uncle",aunt:"aunt",son:"son",daughter:"daughter",mentor:"mentor" };
const COMPANIES = ["Google","Apple","Microsoft","Amazon","Meta","Facebook","Netflix","HSBC","Zara","Tesla","Nvidia","Infosys","TCS","Wipro","Adobe","Spotify","Uber","Airbnb","OpenAI","Anthropic","Google","Samsung","Sony","Intel","IBM","Oracle","Salesforce","Flipkart","Swiggy","Zomato","Stripe","Accenture"];
const PLACES = ["Bangalore","Bengaluru","Mumbai","Delhi","Chennai","Hyderabad","Pune","Kolkata","Goa","London","New York","Tokyo","Japan","Paris","Dubai","Singapore","Berlin","Seattle","San Francisco","Toronto","Sydney","Amsterdam"];
const MONTHS=["January","February","March","April","May","June","July","August","September","October","November","December"];
const EVENT_WORDS=[[/\bjoined\b/i,"joined"],[/\bpromot(ed|ion)\b/i,"promotion"],[/\bmarried|marriage\b/i,"marriage"],[/\bmoved to\b/i,"moved"],[/\bstarted\b/i,"started"],[/\bgraduated\b/i,"graduated"],[/\blearn(ed|ing)\b/i,"learning"],[/\bbought\b/i,"purchase"]];
const STOP=new Set("I My The A An He She They We You It Today Tomorrow Yesterday This That Her His Their Our Mom Dad Mum Sunday Monday Tuesday Wednesday Thursday Friday Saturday Hope Happy Remember Need Should Met Wish Remind Renew Call Ask Buy Send Schedule Book Pay Check Visit Finish Get Email Text Make Go Don Hey Also Then Just Maybe Please".split(" "));

function parseDate(text, today){
  const lo=text.toLowerCase(); const mk=(o)=>{const d=new Date(today);d.setDate(d.getDate()+o);return d;};
  if(/\btomorrow\b/.test(lo))return{date:mk(1),label:"tomorrow"};
  if(/\byesterday\b/.test(lo))return{date:mk(-1),label:"yesterday"};
  if(/\btoday\b/.test(lo))return{date:mk(0),label:"today"};
  let m=lo.match(/in (\d+) (day|days|week|weeks|month|months)/);
  if(m){const n=+m[1];const d=new Date(today);if(/day/.test(m[2]))d.setDate(d.getDate()+n);else if(/week/.test(m[2]))d.setDate(d.getDate()+7*n);else d.setMonth(d.getMonth()+n);return{date:d,label:`in ${n} ${m[2]}`};}
  m=lo.match(/every (sunday|monday|tuesday|wednesday|thursday|friday|saturday)/);
  if(m)return{recurring:m[1],label:`every ${m[1]}`};
  m=lo.match(/on (?:the )?(\d{1,2})(?:st|nd|rd|th)?/);
  if(m){const day=+m[1];let d=new Date(today.getFullYear(),today.getMonth(),day);if(d<today)d=new Date(today.getFullYear(),today.getMonth()+1,day);return{date:d,label:`the ${day}th`};}
  m=text.match(/(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)/i);
  if(m){const mi=MONTHS.findIndex(x=>x.toLowerCase()===m[2].toLowerCase());return{date:new Date(today.getFullYear(),mi,+m[1]),label:`${m[1]} ${MONTHS[mi]}`};}
  return null;
}
const cap=(s)=>s.charAt(0).toUpperCase()+s.slice(1);

// time-of-day -> "HH:MM" (24h), or null
function parseTime(text){
  const lo=text.toLowerCase();
  if(/\bnoon\b/.test(lo))return"12:00";
  if(/\bmidnight\b/.test(lo))return"00:00";
  let m=lo.match(/\b(?:at|by|around)?\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/);
  if(m){let h=+m[1]%12; if(m[3]==="pm")h+=12; const mm=m[2]?+m[2]:0; return String(h).padStart(2,"0")+":"+String(mm).padStart(2,"0");}
  m=lo.match(/\b(?:at|by)\s+(\d{1,2}):(\d{2})\b/);
  if(m){return String(+m[1]).padStart(2,"0")+":"+m[2];}
  if(/\btonight\b/.test(lo))return"20:00";
  return null;
}

// multi-fire intent (task decomposition / recurring), or null
function parseRepeat(text){
  const lo=text.toLowerCase();
  let m=lo.match(/every\s+(\d+)\s*(hours?|hrs?)/); if(m) return {type:"interval",everyMinutes:(+m[1])*60,from:"09:00",to:"21:00"};
  m=lo.match(/every\s+(\d+)\s*(mins?|minutes?)/); if(m) return {type:"interval",everyMinutes:+m[1],from:"09:00",to:"21:00"};
  m=lo.match(/(\d+)\s*times?\s*(a day|per day|daily|today)/); if(m) return {type:"spread",count:+m[1],from:"09:00",to:"21:00"};
  m=lo.match(/(\d+(?:\.\d+)?)\s*(l|lt|liters?|litres?)\b/); if(m&&/water|drink|hydrat/.test(lo)){const g=Math.max(2,Math.round(parseFloat(m[1])*2));return {type:"spread",count:g,from:"08:00",to:"22:00"};}
  m=lo.match(/every\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)/); if(m) return {type:"weekly",weekday:m[1]};
  if(/every\s*day|everyday|daily/.test(lo)) return {type:"daily"};
  return null;
}

function heuristic(text, today){
  const out={people:[],companies:[],places:[],events:[],preferences:[],reminders:[],facts:{}};
  const relRe=new RegExp("\\b(?:my |our )?("+Object.keys(RELATIONS).join("|")+")\\s+([A-Z][a-z]+)","gi");
  const seen={}; let m;
  while((m=relRe.exec(text))){const nm=cap(m[2]);seen[nm]={name:nm,relation:RELATIONS[m[1].toLowerCase()]};}
  const re2=new RegExp("\\b([A-Z][a-z]+)\\s+(?:is|was)\\s+my\\s+("+Object.keys(RELATIONS).join("|")+")","gi");
  while((m=re2.exec(text))){const nm=cap(m[1]);seen[nm]={name:nm,relation:RELATIONS[m[2].toLowerCase()]};}
  (text.match(/\b[A-Z][a-z]{2,}\b/g)||[]).forEach(w=>{if(STOP.has(w)||COMPANIES.includes(w)||PLACES.includes(w)||MONTHS.includes(w))return;if(!seen[w])seen[w]={name:w,relation:null};});
  out.people=Object.values(seen);
  COMPANIES.forEach(c=>{if(new RegExp("\\b"+c+"\\b","i").test(text)&&!out.companies.includes(c))out.companies.push(c);});
  PLACES.forEach(p=>{if(new RegExp("\\b"+p+"\\b","i").test(text)){const v=p==="Bengaluru"?"Bangalore":p;if(!out.places.includes(v))out.places.push(v);}});
  const d=parseDate(text,today);
  const who=out.people[0]?out.people[0].name:null;
  EVENT_WORDS.forEach(([re,name])=>{
    if(re.test(text)){
      let title;
      if(name==="joined"&&out.companies[0])title=`${who||"You"} joined ${out.companies[0]}`;
      else if(name==="promotion")title=`${who||"You"} got promoted`;
      else if(name==="marriage")title=`${who||"You"} got married`;
      else if(name==="moved"&&out.places[0])title=`Moved to ${out.places[0]}`;
      else title=text.replace(/\.$/,"");
      out.events.push({title,who,dateIso:d&&d.date?iso(d.date):null});
      if(name==="promotion"&&who)out.facts[who]={...(out.facts[who]||{}),position:"Senior Engineer"};
    }
  });
  if(who&&out.companies[0])out.facts[who]={...(out.facts[who]||{}),company:out.companies[0]};
  if(who&&out.places[0])out.facts[who]={...(out.facts[who]||{}),place:out.places[0]};
  const pm=text.match(/\b([A-Z][a-z]+)?\b[^.]*\b(?:loves?|likes?|enjoys?|favou?rite)\b\s+([A-Za-z][A-Za-z ]{1,30})/i);
  if(pm){out.preferences.push({who:out.people[0]?out.people[0].name:null,item:pm[2].trim().replace(/\.$/,"")});}
  if(/\b(remind me|i should|i need to|i promised|don'?t forget|have to|call)\b/i.test(text)){
    const txt=text.replace(/^\s*remind me (on [^,]+,?\s*)?(at [^,]+,?\s*)?(in [^,]+,?\s*)?to\s*/i,"").replace(/\.$/,"");
    const tm=parseTime(text);
    const rep=parseRepeat(text);
    const offM=(()=>{const mm=text.toLowerCase().match(/\b(?:in|after)\s+(\d+)\s*(min|mins|minute|minutes|hour|hours|hr|hrs)\b/);if(!mm)return null;const n=+mm[1];return /hour|hr/.test(mm[2])?n*60:n;})();
    const dIso = offM ? null : (d&&d.date ? iso(d.date) : ((tm||rep) ? iso(today) : null)); // time/repeat with no date means today
    if(rep&&tm&&(rep.type==="daily"||rep.type==="weekly"))rep.time=tm;
    out.reminders.push({text:txt,dateIso:dIso,time:offM?null:tm,offsetMin:offM,repeat:offM?null:rep,recurring:d&&d.recurring?d.recurring:null,label:d?d.label:"soon",isBirthday:false,who});
  }
  if(/birthday/i.test(text)&&d&&d.date){
    out.reminders.push({text:`${who?who+"'s":"A"} birthday`,dateIso:iso(d.date),recurring:null,label:d.label,isBirthday:true,who});
  }
  return out;
}

function normalize(o){
  o=o||{}; const arr=(x)=>Array.isArray(x)?x:[];
  return {
    people: arr(o.people).filter(p=>p&&p.name).map(p=>({name:String(p.name).trim(),relation:p.relation||null})),
    companies: arr(o.companies).map(String),
    places: arr(o.places).map(String),
    events: arr(o.events).filter(e=>e&&e.title).map(e=>({title:String(e.title),who:e.who||null,dateIso:e.dateIso||null})),
    preferences: arr(o.preferences).filter(p=>p&&p.item).map(p=>({who:p.who||null,item:String(p.item)})),
    reminders: arr(o.reminders).filter(r=>r&&r.text).map(r=>({text:String(r.text),dateIso:r.dateIso||null,time:r.time||null,offsetMin:(Number.isFinite(+r.offsetMinutes)?+r.offsetMinutes:(Number.isFinite(+r.offsetMin)?+r.offsetMin:null)),repeat:r.repeat&&typeof r.repeat==="object"?r.repeat:null,recurring:r.recurring||null,label:r.label||"soon",isBirthday:!!r.isBirthday,who:r.who||null})),
    facts: o.facts && typeof o.facts==="object" ? o.facts : {},
  };
}
