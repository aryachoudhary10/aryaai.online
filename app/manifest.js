const ICON = "https://d8j0ntlcm91z4.cloudfront.net/user_2w39JZ8pq7Uftm12HiS8wgQUgPt/hf_20260617_155511_400611e2-332d-47c4-87a9-48e2ad6b242e.png";

export default function manifest() {
  return {
    name: "Arya — Second Brain",
    short_name: "Arya",
    description: "Empty your mind. Arya remembers it for you.",
    start_url: "/",
    display: "standalone",
    background_color: "#161a18",
    theme_color: "#161a18",
    orientation: "portrait",
    icons: [
      { src: ICON, sizes: "192x192", type: "image/png", purpose: "any" },
      { src: ICON, sizes: "512x512", type: "image/png", purpose: "any" },
      { src: ICON, sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
