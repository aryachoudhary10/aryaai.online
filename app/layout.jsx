import "./globals.css";
import { RegisterSW } from "./_components/RegisterSW.jsx";

export const metadata = {
  title: "Rephrase",
  description: "Rewrite any text in the tone you need. Free, fast, works offline-installable on your phone.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
  appleWebApp: {
    capable: true,
    title: "Rephrase",
    statusBarStyle: "black-translucent",
  },
  formatDetection: { telephone: false },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  // Pinch-zoom stays available (never disable it -- it's an accessibility
  // requirement), but the page is designed so nobody needs it.
  maximumScale: 5,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f7f8" },
    { media: "(prefers-color-scheme: dark)", color: "#0d1215" },
  ],
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Instrument+Sans:ital,wght@0,400..700;1,400..700&family=Newsreader:ital,opsz,wght@0,6..72,400..600;1,6..72,400&display=swap"
        />
        {/* Applies the saved theme before first paint so the page never flashes
            the wrong ground colour. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('rephrase:theme');if(t)document.documentElement.dataset.theme=t}catch(e){}`,
          }}
        />
      </head>
      <body>
        {children}
        <RegisterSW />
      </body>
    </html>
  );
}
