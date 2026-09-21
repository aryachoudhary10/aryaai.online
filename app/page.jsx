"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { TONES, DEFAULT_TONE, MAX_INPUT } from "@/lib/prompt.js";
import { useKeyboardInset } from "./_components/useKeyboardInset.js";
import { ThemeToggle } from "./_components/ThemeToggle.jsx";

const TONE_LIST = Object.entries(TONES).map(([id, t]) => ({ id, ...t }));

export default function Page() {
  const [text, setText] = useState("");
  const [tone, setTone] = useState(DEFAULT_TONE);
  const [variants, setVariants] = useState([]);
  const [source, setSource] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  // Gates draft persistence until the restore pass above has run.
  const [ready, setReady] = useState(false);

  const taRef = useRef(null);
  const resultsRef = useRef(null);
  const abortRef = useRef(null);

  useKeyboardInset();

  // Read the query string directly rather than via useSearchParams: that hook
  // opts the whole route out of static rendering, which would leave phones
  // staring at a blank screen until the JS bundle lands. Runs once on mount.
  //
  // Handles both entry points -- text shared in from another app's share
  // sheet, and home-screen shortcuts like /?tone=formal -- then falls back to
  // the saved draft. Storage is wrapped because it throws in some private
  // browsing modes.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const shared = params.get("text") || params.get("title") || params.get("url") || "";
    const wanted = params.get("tone");

    if (shared) {
      setText(shared.slice(0, MAX_INPUT));
    } else {
      try { setText(localStorage.getItem("rephrase:draft") || ""); } catch {}
    }

    if (wanted && Object.hasOwn(TONES, wanted)) {
      setTone(wanted);
    } else {
      try {
        const savedTone = localStorage.getItem("rephrase:tone");
        if (savedTone && Object.hasOwn(TONES, savedTone)) setTone(savedTone);
      } catch {}
    }

    if (shared || wanted) {
      // Drop the params so a refresh doesn't resurrect stale shared text.
      window.history.replaceState(null, "", window.location.pathname);
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem("rephrase:draft", text);
      localStorage.setItem("rephrase:tone", tone);
    } catch {}
  }, [ready, text, tone]);

  // Grow the textarea to fit, up to the CSS max-height.
  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [text]);

  const flash = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(""), 1900);
  }, []);

  const over = text.length > MAX_INPUT;
  const canRun = text.trim().length > 0 && !over && !busy;

  const run = useCallback(async () => {
    if (!canRun) return;

    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    setBusy(true);
    setError("");
    setVariants([]);
    // Blur on mobile so the keyboard drops and the results are visible.
    if (window.matchMedia("(max-width: 719px)").matches) taRef.current?.blur();

    try {
      const res = await fetch("/api/rephrase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text.trim(), tone }),
        signal: ac.signal,
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data.error || `Something went wrong (${res.status}).`);
        return;
      }
      setVariants(data.variants || []);
      setSource(data.provider || null);
      requestAnimationFrame(() =>
        resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
      );
    } catch (e) {
      if (e.name !== "AbortError") setError("Can't reach the server. Check your connection.");
    } finally {
      setBusy(false);
    }
  }, [canRun, text, tone]);

  // Cmd/Ctrl+Enter from the textarea, for anyone on a physical keyboard.
  const onKeyDown = (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      run();
    }
  };

  const copy = async (value) => {
    try {
      await navigator.clipboard.writeText(value);
      flash("Copied");
    } catch {
      // Clipboard API needs HTTPS and a user gesture; fall back to the old way.
      const ta = document.createElement("textarea");
      ta.value = value;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); flash("Copied"); }
      catch { flash("Couldn't copy — select the text instead"); }
      document.body.removeChild(ta);
    }
  };

  const share = async (value) => {
    if (!navigator.share) return copy(value);
    try { await navigator.share({ text: value }); }
    catch { /* user dismissed the sheet */ }
  };

  const paste = async () => {
    try {
      const v = await navigator.clipboard.readText();
      if (v) { setText(v.slice(0, MAX_INPUT)); taRef.current?.focus(); }
    } catch {
      flash("Clipboard blocked — paste with a long press");
    }
  };

  const active = TONE_LIST.find((t) => t.id === tone);

  return (
    <div className="app">
      <header className="top">
        <div className="wrap">
          <div className="top-row">
            <div className="brand">
              <span className="mark" aria-hidden="true"><i /><i /></span>
              <span className="word">Rephrase</span>
            </div>
            <a className="icon-btn" href="/tools" aria-label="Use it anywhere you type" title="Use it anywhere you type">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="2" y="5" width="20" height="14" rx="2" />
                <path d="M6 9h.01M10 9h.01M14 9h.01M18 9h.01M6 13h.01M18 13h.01M9 17h6" />
                <path d="M10 13h4" />
              </svg>
            </a>
            <ThemeToggle />
          </div>

          <div className="tones" role="group" aria-label="Rewrite style">
            {TONE_LIST.map((t) => (
              <button
                key={t.id}
                type="button"
                className="chip"
                aria-pressed={t.id === tone}
                onClick={() => setTone(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
          <p className="tone-hint">{active?.hint}</p>
        </div>
      </header>

      <main>
        <div className="wrap">
          <div className="editor">
            <label htmlFor="input" className="sr-only" style={{ position: "absolute", left: "-9999px" }}>
              Text to rewrite
            </label>
            <textarea
              id="input"
              ref={taRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Paste or type the text you want rewritten…"
              rows={4}
              autoCapitalize="sentences"
              autoCorrect="on"
              autoComplete="off"
              spellCheck="true"
              enterKeyHint="enter"
            />
            <div className="editor-foot">
              <span className={over ? "count-over" : undefined}>
                {text.length.toLocaleString()} / {MAX_INPUT.toLocaleString()}
              </span>
              <span className="foot-actions">
                <button type="button" className="ghost" onClick={paste}>Paste</button>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => { setText(""); setVariants([]); setError(""); taRef.current?.focus(); }}
                  disabled={!text}
                >
                  Clear
                </button>
              </span>
            </div>
          </div>

          <div ref={resultsRef}>
            {error && (
              <div className="results">
                <p className="notice" role="alert">{error}</p>
              </div>
            )}

            {busy && (
              <div className="results" aria-live="polite">
                <p className="results-head">Rewriting</p>
                {[0, 1, 2].map((i) => (
                  <div key={i} className="card skeleton" aria-hidden="true">
                    <span /><span /><span />
                  </div>
                ))}
              </div>
            )}

            {!busy && variants.length > 0 && (
              <div className="results" aria-live="polite">
                <p className="results-head">
                  <span>{active?.label}</span>
                  {source && <span className="src">via {source}</span>}
                </p>
                {variants.map((v, i) => (
                  <article key={i} className="card">
                    <p>{v}</p>
                    <div className="card-foot">
                      <span className="card-n">{i + 1}</span>
                      <button type="button" className="ghost" onClick={() => setText(v)}>Use</button>
                      {typeof navigator !== "undefined" && "share" in navigator && (
                        <button type="button" className="ghost" onClick={() => share(v)}>Share</button>
                      )}
                      <button type="button" className="ghost" onClick={() => copy(v)}>Copy</button>
                    </div>
                  </article>
                ))}
              </div>
            )}

            {!busy && !error && variants.length === 0 && (
              <p className="empty">
                Pick a style, then rewrite.<br />
                <kbd>Ctrl</kbd> + <kbd>Enter</kbd> works too.
              </p>
            )}
          </div>

          <div className="bar-space" aria-hidden="true" />
        </div>
      </main>

      <div className="bar">
        <div className="wrap bar-row">
          <button type="button" className="go" onClick={run} disabled={!canRun}>
            {busy ? <><span className="spin" aria-hidden="true" />Rewriting…</> : "Rewrite"}
          </button>
        </div>
      </div>

      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}
