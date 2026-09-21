// Service worker: owns the context menu, the keyboard command, and the network
// call. Content scripts do the DOM work because only they can touch the page.

const DEFAULTS = {
  apiBase: "https://aryaai.online",
  tone: "natural",
};

const TONES = [
  ["natural", "Natural"],
  ["formal", "Formal"],
  ["casual", "Casual"],
  ["concise", "Concise"],
  ["expand", "Expand"],
  ["polite", "Polite"],
  ["confident", "Confident"],
  ["simple", "Simple"],
];

async function settings() {
  return { ...DEFAULTS, ...(await chrome.storage.sync.get(Object.keys(DEFAULTS))) };
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "rephrase-root",
      title: "Rephrase",
      contexts: ["selection", "editable"],
    });
    for (const [id, label] of TONES) {
      chrome.contextMenus.create({
        id: `tone:${id}`,
        parentId: "rephrase-root",
        title: label,
        contexts: ["selection", "editable"],
      });
    }
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!info.menuItemId.startsWith("tone:") || !tab?.id) return;
  run(tab.id, info.menuItemId.slice(5));
});

chrome.commands.onCommand.addListener(async (cmd, tab) => {
  if (cmd !== "rephrase-selection" || !tab?.id) return;
  run(tab.id, (await settings()).tone);
});

chrome.runtime.onMessage.addListener((msg, sender, respond) => {
  if (msg?.type === "run-active-tab") {
    chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
      if (tab?.id) run(tab.id, msg.tone);
      respond({ ok: true });
    });
    return true;
  }
});

// Injects the content script on demand rather than declaring it for every page
// at install time -- no reason to run code on sites nobody rephrases on.
async function ensureInjected(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: "ping" });
  } catch {
    await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
  }
}

async function run(tabId, tone) {
  const { apiBase } = await settings();

  try {
    await ensureInjected(tabId);
  } catch {
    // chrome:// pages, the web store, and PDF viewers all refuse injection.
    return;
  }

  const sel = await send(tabId, { type: "get-selection" });
  const text = (sel?.text || "").trim();

  if (!text) {
    return send(tabId, { type: "toast", kind: "warn", message: "Select some text first" });
  }
  if (text.length > 2000) {
    return send(tabId, { type: "toast", kind: "warn", message: `Too long — ${text.length} of 2000 characters` });
  }

  await send(tabId, { type: "busy", tone });

  try {
    const res = await fetch(`${apiBase.replace(/\/+$/, "")}/api/rephrase`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, tone }),
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      return send(tabId, { type: "toast", kind: "error", message: data.error || `Failed (${res.status})` });
    }
    await send(tabId, { type: "result", variants: data.variants || [], editable: sel.editable });
  } catch {
    await send(tabId, { type: "toast", kind: "error", message: `Can't reach ${apiBase}` });
  }
}

function send(tabId, msg) {
  return chrome.tabs.sendMessage(tabId, msg).catch(() => null);
}
