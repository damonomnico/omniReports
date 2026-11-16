import type { Metadata, Viewport } from "next";
import "@fontsource-variable/inter";
import "@fontsource-variable/space-grotesk";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "omniReports", template: "%s | omniReports" },
  description: "SEO reporting from omniSEO: rankings, traffic, local visibility and links in one place.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#0f2129",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
