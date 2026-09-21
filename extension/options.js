const TONES = [
  ["natural", "Natural"], ["formal", "Formal"], ["casual", "Casual"], ["concise", "Concise"],
  ["expand", "Expand"], ["polite", "Polite"], ["confident", "Confident"], ["simple", "Simple"],
];

const $base = document.getElementById("apiBase");
const $tone = document.getElementById("tone");
const $status = document.getElementById("status");

for (const [id, label] of TONES) {
  $tone.appendChild(Object.assign(document.createElement("option"), { value: id, textContent: label }));
}

chrome.storage.sync.get({ apiBase: "https://aryaai.online", tone: "natural" }).then((s) => {
  $base.value = s.apiBase;
  $tone.value = s.tone;
});

document.getElementById("save").addEventListener("click", async () => {
  const apiBase = $base.value.trim().replace(/\/+$/, "");
  if (!/^https?:\/\/.+/i.test(apiBase)) {
    $status.textContent = "Needs to start with http:// or https://";
    return;
  }
  await chrome.storage.sync.set({ apiBase, tone: $tone.value });
  $status.textContent = "Saved";
  setTimeout(() => ($status.textContent = ""), 1800);
});
