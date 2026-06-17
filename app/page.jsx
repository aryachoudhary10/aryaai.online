"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { commit, detectAmbiguity, summarize, knownPeople, listMemories } from "@/lib/memory";
import { extract, answer, hasKey } from "@/lib/understand";
import { indexNew } from "@/lib/retriever";
import { scheduleReminders } from "@/lib/push";

export default function Home() {
  const [mode, setMode] = useState("dump");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [entries, setEntries] = useState([]);
  const [clarify, setClarify] = useState(null);
  const [ans, setAns] = useState(null);
  const [noKey, setNoKey] = useState(false);
  const ref = useRef(null);

  useEffect(() => { setNoKey(!hasKey()); ref.current?.focus(); }, [mode]);

  function switchMode(m) {
    if (m === mode) return;
    setMode(m); setText(""); setClarify(null); setAns(null);
    requestAnimationFrame(() => ref.current?.focus());
  }

  async function saveMemory(value, opts) {
    const u = await extract(value, { today: new Date(), knownPeople: knownPeople() });
    if (!opts && !clarify) {
      const amb = detectAmbiguity(u);
      if (amb) { setClarify({ amb, pendingText: value, u }); return; }
    }
    const id = commit(value, u, opts || {});
    indexNew({ id, text: value }); // embed in background for semantic Ask
    scheduleReminders(u.reminders); // push any dated reminders/birthdays
    setEntries((e) => [{ text: value, reply: summarize(u) }, ...e]);
    setText(""); resetHeight();
  }

  async function onSend() {
    const value = text.trim();
    if (!value || busy) return;
    setBusy(true);
    try {
      if (mode === "dump") {
        await saveMemory(value);
      } else {
        setAns({ loading: true });
        const a = await answer(value, listMemories());
        const mems = listMemories();
        const evidence = mems.filter((m) => a.evidenceIds.includes(m.id)).map((m) => ({ text: m.text, when: m.created_at.slice(0, 10) }));
        setAns({ answer: a.answer, evidence });
      }
    } catch (e) {
      if (mode === "ask") setAns({ answer: e.message || "Something went wrong.", evidence: [] });
    } finally { setBusy(false); }
  }

  async function resolve(choice) {
    const { amb, pendingText } = clarify;
    const opts = choice === "yes" ? { force: true } : { renameMap: { [amb.name]: `${amb.name} (${amb.incoming})` } };
    setClarify(null); setBusy(true);
    try {
      // re-extract is cheap & keeps it simple
      const u = await extract(pendingText, { today: new Date(), knownPeople: knownPeople() });
      const id = commit(pendingText, u, choice === "yes" ? {} : opts);
      indexNew({ id, text: pendingText });
      scheduleReminders(u.reminders);
      setEntries((e) => [{ text: pendingText, reply: summarize(u) }, ...e]);
      setText(""); resetHeight();
    } finally { setBusy(false); }
  }

  function onKey(e) { if (e.key === "Enter" && (mode === "ask" || !e.shiftKey)) { e.preventDefault(); onSend(); } }
  function resetHeight() { const el = ref.current; if (el && el.tagName === "TEXTAREA") el.style.height = "auto"; }
  function grow(e) {
    setText(e.target.value);
    const el = ref.current;
    if (el && el.tagName === "TEXTAREA") { el.style.height = "auto"; el.style.height = Math.min(el.scrollHeight, 200) + "px"; }
  }

  const hasStream = (mode === "dump" && (clarify || entries.length)) || (mode === "ask" && ans);

  return (
    <div className="home">
      <div className="seg" role="tablist">
        <button className={mode === "dump" ? "active" : ""} onClick={() => switchMode("dump")}>Dump</button>
        <button className={mode === "ask" ? "active" : ""} onClick={() => switchMode("ask")}>Ask</button>
      </div>

      {noKey && <Link href="/settings" className="keynudge">Using the built-in parser — add your Gemini key for smarter memory →</Link>}

      <div className="stream">
        {!hasStream && (
          <div className="stream-hint">{mode === "dump" ? "Whatever's on your mind — let it out." : "Ask about anything you've saved."}</div>
        )}

        {clarify && (
          <div className="saved">
            <span className="tick">?</span>
            <div className="s-text">
              I know <b>{clarify.amb.name}</b> (your {clarify.amb.known}). This is a {clarify.amb.incoming} — same person?
              <div className="row">
                <button className="go sm" onClick={() => resolve("yes")}>Same</button>
                <button className="go sm ghost" onClick={() => resolve("no")}>Different</button>
              </div>
            </div>
          </div>
        )}

        {mode === "dump" && entries.map((en, i) => (
          <div key={i} className="entry">
            <div className="e-you">{en.text}</div>
            <div className="e-meta">{en.reply}</div>
          </div>
        ))}

        {mode === "ask" && ans && (
          <div className="answer">
            <div className="a-main">{ans.loading ? <><span className="spin dark" /> searching…</> : ans.answer}</div>
            {ans.evidence && ans.evidence.length > 0 && (
              <div className="evidence">
                {ans.evidence.map((m, i) => (
                  <div key={i} className="ev"><span className="q">&ldquo;{m.text}&rdquo;</span><span className="t">{m.when}</span></div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="composer">
        <div className="field">
          {mode === "dump" ? (
            <textarea ref={ref} rows={1} value={text} onChange={grow} onKeyDown={onKey} placeholder="Empty your mind…" />
          ) : (
            <input ref={ref} value={text} onChange={grow} onKeyDown={onKey} placeholder="Ask anything you've told me…" />
          )}
          <div className="field-bar">
            <span className="kbd-hint">{mode === "dump" ? "Enter to save" : "Enter to ask"}</span>
            <button className="go" onClick={onSend} disabled={busy || !text.trim()}>
              {busy ? <span className="spin" /> : mode === "dump" ? "Save" : "Ask"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
