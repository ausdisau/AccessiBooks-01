import type { Metadata, Viewport } from "next";
import "../src/index.css";

export const metadata: Metadata = {
  title: "AccessiBooks - Accessible Audiobooks for Everyone",
  description:
    "Discover thousands of free and premium audiobooks with AccessiBooks. Featuring LibriVox, iTunes, Google Books, and more with full accessibility support.",
  alternates: { canonical: "https://accessibooks.org/" },
  openGraph: {
    title: "AccessiBooks - Accessible Audiobooks for Everyone",
    description:
      "Stream free audiobooks with advanced accessibility features including high contrast mode, dyslexia-friendly fonts, and full keyboard navigation.",
    type: "website",
    url: "https://accessibooks.org/",
    siteName: "AccessiBooks",
  },
  twitter: {
    card: "summary_large_image",
    title: "AccessiBooks - Accessible Audiobooks for Everyone",
    description:
      "Stream free audiobooks with advanced accessibility features including high contrast mode, dyslexia-friendly fonts, and full keyboard navigation.",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <div id="root">{children}</div>
      </body>
    </html>
  );
}
