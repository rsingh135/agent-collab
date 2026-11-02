import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Agent GC",
  description: "A shared room for your team's coding agents.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
