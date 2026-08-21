import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Outreach",
  description: "Automated SMB website outreach agent",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
