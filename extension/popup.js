const TONES = [
  ["natural", "Natural"], ["formal", "Formal"], ["casual", "Casual"], ["concise", "Concise"],
  ["expand", "Expand"], ["polite", "Polite"], ["confident", "Confident"], ["simple", "Simple"],
];

const list = document.getElementById("list");
for (const [id, label] of TONES) {
  const b = document.createElement("button");
  b.className = "tone";
  b.textContent = label;
  b.addEventListener("click", async () => {
    await chrome.runtime.sendMessage({ type: "run-active-tab", tone: id });
    window.close();
  });
  list.appendChild(b);
}

document.getElementById("options").addEventListener("click", (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

document.getElementById("site").addEventListener("click", async (e) => {
  e.preventDefault();
  const { apiBase = "https://aryaai.online" } = await chrome.storage.sync.get("apiBase");
  chrome.tabs.create({ url: apiBase });
});
