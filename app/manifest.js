// PWA manifest. The share_target entry is what makes "Rephrase" appear in
// Android's system share sheet: select text anywhere, Share, pick Rephrase,
// and the text arrives at /?text=... already loaded. iOS ignores share_target
// (see README for the Shortcuts workaround).

export default function manifest() {
  return {
    name: "Rephrase",
    short_name: "Rephrase",
    description: "Rewrite any text in the tone you need.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#f4f7f8",
    theme_color: "#f4f7f8",
    categories: ["productivity", "utilities"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    share_target: {
      action: "/",
      method: "GET",
      params: { title: "title", text: "text", url: "url" },
    },
    shortcuts: [
      { name: "Make it formal", short_name: "Formal", url: "/?tone=formal" },
      { name: "Make it concise", short_name: "Concise", url: "/?tone=concise" },
    ],
  };
}
