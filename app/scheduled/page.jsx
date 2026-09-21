"use client";
import { useEffect, useState } from "react";
import { listScheduled, cancelScheduled, notifSupported } from "@/lib/push";

export default function ScheduledPage() {
  const [items, setItems] = useState(null);

  async function load() { setItems(await listScheduled()); }
  useEffect(() => { load(); }, []);

  async function cancel(id) {
    setItems((xs) => xs.filter((x) => x.id !== id));
    await cancelScheduled(id);
  }

  const fmt = (ms) => { const d = new Date(ms); return d.toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }); };

  return (
    <div className="page">
      <h1>Scheduled</h1>
      <div className="sub">Everything queued to notify you. These live on the server until they fire.</div>
      {!notifSupported() && <div className="empty">Notifications aren't enabled on this device.</div>}
      {items === null && <div className="empty">loading…</div>}
      {items && items.length === 0 && <div className="empty">Nothing scheduled. Dump a reminder with a time and it'll show here.</div>}
      {items && items.length > 0 && (
        <div className="sched">
          {items.map((it) => (
            <div key={it.id} className="schic">
              <div>
                <div className="sc-when">{fmt(it.at)}{it.recur ? ` · repeats ${it.recur.type}` : ""}</div>
                <div className="sc-title">{it.title}</div>
                <div className="sc-body">{it.body}</div>
              </div>
              <button className="go ghost sm" onClick={() => cancel(it.id)}>Cancel</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
