"use client";
import { useEffect, useState } from "react";
import { getKey, setKey, getModel, setModel, hasKey } from "@/lib/understand";
import { listMemories, clearAll, exportJSON } from "@/lib/memory";
import { enableNotifications, testNotification, notifEnabled, notifSupported, pushConfigured } from "@/lib/push";

export default function SettingsPage() {
  const [key, setK] = useState("");
  const [model, setM] = useState("");
  const [saved, setSaved] = useState(false);
  const [count, setCount] = useState(0);
  const [notif, setNotif] = useState("loading"); // loading | on | off | unsupported
  const [notifMsg, setNotifMsg] = useState("");

  useEffect(() => {
    setK(getKey()); setM(getModel()); setCount(listMemories().length);
    if (!notifSupported()) setNotif("unsupported");
    else setNotif(notifEnabled() ? "on" : "off");
  }, []);

  async function enableNotif() {
    setNotifMsg("");
    try { await enableNotifications(); setNotif("on"); setNotifMsg("Notifications enabled."); }
    catch (e) { setNotifMsg(e.message); }
  }
  async function testNotif() {
    setNotifMsg("Sending a test in ~5s…");
    try { const r = await testNotification(); setNotifMsg(r && r.ok ? "Test queued — watch for it in a few seconds." : "Couldn't queue test."); }
    catch (e) { setNotifMsg(e.message); }
  }

  function save() {
    setKey(key); setModel(model);
    setSaved(true); setTimeout(() => setSaved(false), 1800);
  }
  function download() {
    const blob = new Blob([exportJSON()], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = "arya-memories.json"; a.click(); URL.revokeObjectURL(a.href);
  }
  function wipe() {
    if (confirm("Delete all memories on this device? This can't be undone.")) { clearAll(); setCount(0); }
  }

  return (
    <div className="page">
      <h1>Settings</h1>
      <div className="sub">Your key and your memories live only in this browser. Nothing is stored on a server.</div>

      <div className="set-card">
        <label className="set-label">Gemini API key</label>
        <input className="set-input" type="password" value={key} onChange={(e) => setK(e.target.value)} placeholder="AIza…" autoComplete="off" />
        <div className="set-hint">
          Get a free key at <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">aistudio.google.com/apikey</a>.
          Stored only on this device. Without it, Arya uses a simpler built-in parser.
        </div>

        <label className="set-label" style={{ marginTop: 16 }}>Model</label>
        <input className="set-input" value={model} onChange={(e) => setM(e.target.value)} placeholder="gemini-2.0-flash" autoComplete="off" />
        <div className="set-hint">Default: <code>gemini-2.0-flash</code>. Change if you prefer another Gemini model.</div>

        <div className="row" style={{ marginTop: 18 }}>
          <button className="go" onClick={save}>{saved ? "Saved ✓" : "Save"}</button>
          <span className="set-status">{hasKey() || key ? "Gemini connected" : "Using built-in parser"}</span>
        </div>
      </div>

      <div className="set-card">
        <label className="set-label">Notifications</label>
        <div className="set-hint">Arya can remind you at the right moment — even when the app is closed. Dated reminders and birthdays you dump get scheduled automatically.</div>
        {notif === "unsupported" && <div className="set-hint">Not supported here. On iPhone, add Arya to your Home Screen first, then reopen this page.</div>}
        {notif !== "unsupported" && (
          <div className="row" style={{ marginTop: 14 }}>
            {notif !== "on"
              ? <button className="go" onClick={enableNotif}>Enable notifications</button>
              : <button className="go ghost" onClick={testNotif}>Send a test</button>}
            <span className="set-status">{notif === "on" ? "On" : "Off"}</span>
          </div>
        )}
        {notifMsg && <div className="set-hint" style={{ marginTop: 10 }}>{notifMsg}</div>}
        {!pushConfigured() && notif !== "unsupported" && <div className="set-hint">Heads up: push isn't configured on the server yet (VAPID key missing) — see README.</div>}
      </div>

      <div className="set-card">
        <label className="set-label">Your data</label>
        <div className="set-hint">{count} {count === 1 ? "memory" : "memories"} stored on this device.</div>
        <div className="row" style={{ marginTop: 14 }}>
          <button className="go ghost" onClick={download}>Export JSON</button>
          <button className="go ghost danger" onClick={wipe}>Delete all</button>
        </div>
      </div>
    </div>
  );
}
