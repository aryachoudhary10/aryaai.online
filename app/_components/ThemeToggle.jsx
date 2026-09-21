"use client";

import { useEffect, useState } from "react";

// Cycles system -> light -> dark. "system" clears the stamp so the page
// follows prefers-color-scheme, which is what most people want by default.
const ORDER = ["system", "light", "dark"];

export function ThemeToggle() {
  const [mode, setMode] = useState("system");

  useEffect(() => {
    try {
      setMode(localStorage.getItem("rephrase:theme") || "system");
    } catch {}
  }, []);

  const cycle = () => {
    const next = ORDER[(ORDER.indexOf(mode) + 1) % ORDER.length];
    setMode(next);
    try {
      if (next === "system") {
        localStorage.removeItem("rephrase:theme");
        delete document.documentElement.dataset.theme;
      } else {
        localStorage.setItem("rephrase:theme", next);
        document.documentElement.dataset.theme = next;
      }
    } catch {}
  };

  return (
    <button
      type="button"
      className="icon-btn"
      onClick={cycle}
      aria-label={`Theme: ${mode}. Tap to change.`}
      title={`Theme: ${mode}`}
    >
      {mode === "dark" ? <Moon /> : mode === "light" ? <Sun /> : <Auto />}
    </button>
  );
}

const svg = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" };

function Sun() {
  return (
    <svg {...svg} aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

function Moon() {
  return (
    <svg {...svg} aria-hidden="true">
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
  );
}

function Auto() {
  return (
    <svg {...svg} aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3v18" />
      <path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" stroke="none" />
    </svg>
  );
}
