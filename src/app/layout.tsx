import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

// Self-hosted (not next/font/google) so the Docker build never depends on reaching
// Google Fonts over the network — both files are the same variable-font woff2 Google
// itself serves for these families, just vendored into the repo. See DEPLOY.md.
const cormorant = localFont({
  src: "./fonts/cormorant-garamond-variable.woff2",
  weight: "500 700",
  variable: "--font-display",
  display: "swap",
});

const montserrat = localFont({
  src: "./fonts/montserrat-variable.woff2",
  weight: "400 700",
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Baza Boutique",
  description: "Jewelry & gem business management",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/icon-180.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    title: "Baza Boutique",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: "#a66316",
  // The app only has a light theme — without this, some phones (notably
  // Android's "Force dark"/"Darken web pages" setting) auto-invert the
  // colors instead of leaving them alone, producing a washed-out dashboard.
  colorScheme: "light",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${cormorant.variable} ${montserrat.variable}`}>
      <body className="min-h-screen overflow-x-hidden bg-stone-50 font-sans text-stone-900">{children}</body>
    </html>
  );
}
