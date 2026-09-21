// Runs in the page. Owns reading the selection, painting the picker, and
// writing the chosen rewrite back where it came from.
//
// Injected on demand by background.js, so guard against a double-inject.
if (!window.__rephraseLoaded) {
  window.__rephraseLoaded = true;

  // The field and range are captured at request time: opening the picker moves
  // focus, and on some sites the selection is gone by the time we write back.
  let target = null;

  const isTextField = (el) =>
    el instanceof HTMLTextAreaElement ||
    (el instanceof HTMLInputElement && /^(text|search|url|email|tel|password|)$/i.test(el.type));

  function readSelection() {
    const el = document.activeElement;

    if (isTextField(el)) {
      const { selectionStart: s, selectionEnd: e, value } = el;
      const whole = s === e; // nothing highlighted -> take the whole field
      target = { el, start: whole ? 0 : s, end: whole ? value.length : e, kind: "field" };
      return { text: whole ? value : value.slice(s, e), editable: true };
    }

    const sel = window.getSelection();
    const text = sel ? String(sel) : "";
    if (!text.trim()) return { text: "", editable: false };

    const editable = !!(el && el.isContentEditable);
    target = editable && sel.rangeCount
      ? { el, range: sel.getRangeAt(0).cloneRange(), kind: "contenteditable" }
      : null;
    return { text, editable };
  }

  // Writing back has to look like real typing or frameworks ignore it.
  function write(value) {
    if (!target) return false;

    if (target.kind === "field") {
      const { el, start, end } = target;
      el.focus();
      // React (and Vue) patch the value property on the instance, so assigning
      // el.value directly updates the DOM but never the framework's state. Going
      // through the prototype's native setter is what makes the change stick.
      const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement : HTMLInputElement;
      const setter = Object.getOwnPropertyDescriptor(proto.prototype, "value")?.set;
      const next = el.value.slice(0, start) + value + el.value.slice(end);

      if (setter) setter.call(el, next);
      else el.value = next;

      el.setSelectionRange(start, start + value.length);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    }

    if (target.kind === "contenteditable") {
      target.el.focus();
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(target.range);
      // execCommand is deprecated but it is still the only way to insert text
      // that lands on the page's native undo stack.
      if (!document.execCommand("insertText", false, value)) {
        target.range.deleteContents();
        target.range.insertNode(document.createTextNode(value));
      }
      return true;
    }

    return false;
  }

  // --- UI ----------------------------------------------------------------
  // Everything lives in a closed shadow root so the host page's CSS cannot
  // reach in and the extension's CSS cannot leak out.

  let host = null;
  let shadow = null;

  function panel() {
    if (shadow) return shadow;
    host = document.createElement("div");
    host.style.cssText = "all:initial;position:fixed;z-index:2147483647;inset:auto 0 0 0;";
    shadow = host.attachShadow({ mode: "closed" });
    shadow.innerHTML = `<style>
      :host{all:initial}
      *{box-sizing:border-box;font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
      .sheet{position:fixed;left:50%;bottom:20px;transform:translateX(-50%);width:min(560px,calc(100vw - 24px));
        background:#fff;color:#11171b;border:1px solid #d9e2e7;border-radius:12px;
        box-shadow:0 1px 2px rgba(17,23,27,.06),0 12px 40px -12px rgba(17,23,27,.35);overflow:hidden}
      @media (prefers-color-scheme:dark){
        .sheet{background:#161d22;color:#e6edf2;border-color:#27313a;
          box-shadow:0 1px 2px rgba(0,0,0,.4),0 12px 40px -12px rgba(0,0,0,.7)}
        .row+.row{border-top-color:#27313a}
        .head{color:#6b7d89;border-bottom-color:#27313a}
        .row:hover{background:#10171b}
        .hint{color:#6b7d89}
      }
      .head{display:flex;align-items:center;gap:8px;padding:9px 14px;font-size:11px;font-weight:600;
        letter-spacing:.08em;text-transform:uppercase;color:#8494a0;border-bottom:1px solid #d9e2e7}
      .x{margin-left:auto;border:0;background:none;color:inherit;font-size:16px;line-height:1;cursor:pointer;padding:2px 4px}
      .row{display:block;width:100%;text-align:left;border:0;background:none;color:inherit;
        padding:12px 14px;font-size:14.5px;line-height:1.5;cursor:pointer}
      .row+.row{border-top:1px solid #eceff1}
      .row:hover,.row:focus-visible{background:#f4f7f8;outline:none}
      .hint{padding:8px 14px 11px;font-size:11.5px;color:#8494a0}
      .toast{position:fixed;left:50%;bottom:20px;transform:translateX(-50%);padding:9px 16px;border-radius:999px;
        background:#11171b;color:#f4f7f8;font-size:13.5px;font-weight:500;max-width:calc(100vw - 24px)}
      .toast.warn{background:#7a5a10}.toast.error{background:#8e2c18}
      .dots::after{content:"";animation:d 1.2s steps(4,end) infinite}
      @keyframes d{0%{content:""}25%{content:"."}50%{content:".."}75%{content:"..."}}
    </style><div id="slot"></div>`;
    document.documentElement.appendChild(host);
    return shadow;
  }

  function clear() {
    if (shadow) shadow.getElementById("slot").innerHTML = "";
  }

  function toast(message, kind = "") {
    const s = panel();
    s.getElementById("slot").innerHTML =
      `<div class="toast ${kind}"></div>`;
    s.querySelector(".toast").textContent = message;
    setTimeout(clear, 2600);
  }

  function busy(tone) {
    const s = panel();
    s.getElementById("slot").innerHTML = `<div class="toast">Rewriting<span class="dots"></span></div>`;
  }

  function choose(variants, editable) {
    const s = panel();
    const slot = s.getElementById("slot");
    slot.innerHTML = `<div class="sheet" role="dialog" aria-label="Choose a rewrite">
        <div class="head"><span>Rephrase</span><button class="x" aria-label="Close">&times;</button></div>
        <div id="rows"></div>
        <div class="hint"></div>
      </div>`;

    slot.querySelector(".hint").textContent = editable
      ? "Click one to replace the text. Esc to cancel."
      : "Click one to copy it. Esc to cancel.";

    const rows = slot.querySelector("#rows");
    variants.forEach((v) => {
      const b = document.createElement("button");
      b.className = "row";
      b.textContent = v;              // textContent, never innerHTML: model output
      b.addEventListener("click", () => {
        if (editable && write(v)) toast("Replaced");
        else navigator.clipboard.writeText(v).then(() => toast("Copied"), () => toast("Couldn't copy", "error"));
      });
      rows.appendChild(b);
    });

    slot.querySelector(".x").addEventListener("click", clear);
    rows.querySelector(".row")?.focus();

    const esc = (e) => {
      if (e.key === "Escape") { clear(); document.removeEventListener("keydown", esc, true); }
    };
    document.addEventListener("keydown", esc, true);
  }

  chrome.runtime.onMessage.addListener((msg, _s, respond) => {
    switch (msg?.type) {
      case "ping":          respond({ ok: true }); break;
      case "get-selection": respond(readSelection()); break;
      case "busy":          busy(msg.tone); respond({ ok: true }); break;
      case "toast":         toast(msg.message, msg.kind); respond({ ok: true }); break;
      case "result":
        clear();
        if (!msg.variants.length) toast("Nothing came back", "error");
        else choose(msg.variants, msg.editable);
        respond({ ok: true });
        break;
      default: respond({ ok: false });
    }
    return true;
  });
}
