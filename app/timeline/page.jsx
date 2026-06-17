"use client";
import { useEffect, useState } from "react";
import { buildTimeline } from "@/lib/memory";

export default function TimelinePage() {
  const [tl, setTl] = useState(null);
  useEffect(() => { setTl(buildTimeline()); }, []);

  return (
    <div className="page">
      <h1>Life timeline</h1>
      <div className="sub">Dated moments from your memories, arranged into the story of your life.</div>
      {tl === null && <div className="empty">loading…</div>}
      {tl && tl.length === 0 && <div className="empty">No dated events yet. Try a dump like "I joined HSBC in 2025."</div>}
      {tl && tl.length > 0 && (
        <div className="tl">
          {tl.map((y) => (
            <div key={y.year}>
              <div className="tl-year">{y.year}</div>
              {y.items.map((e, i) => (
                <div key={i} className="tl-item"><div className="te">{e.title}</div><div className="td">{e.when}</div></div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
