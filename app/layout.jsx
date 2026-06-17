import "./globals.css";
import Nav from "./_components/Nav";

export const metadata = {
  title: "Arya",
  description: "Empty your mind. Arya remembers, connects, and brings it back when you need it.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Arya" },
  icons: {
    icon: "https://d8j0ntlcm91z4.cloudfront.net/user_2w39JZ8pq7Uftm12HiS8wgQUgPt/hf_20260617_155511_400611e2-332d-47c4-87a9-48e2ad6b242e.png",
    apple: "https://d8j0ntlcm91z4.cloudfront.net/user_2w39JZ8pq7Uftm12HiS8wgQUgPt/hf_20260617_155511_400611e2-332d-47c4-87a9-48e2ad6b242e.png",
  },
};

export const viewport = {
  themeColor: "#161a18",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <Nav />
        <main className="container">{children}</main>
      </body>
    </html>
  );
}
