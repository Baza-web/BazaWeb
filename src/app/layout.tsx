import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Baza ERP",
  description: "Jewelry & gem business management",
  manifest: "/manifest.json",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen text-stone-900">{children}</body>
    </html>
  );
}
