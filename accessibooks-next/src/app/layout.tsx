import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AccessiBooks",
  description:
    "Accessible audiobooks and e-reading for everyone — from Australian Disability Ltd.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
