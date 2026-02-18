import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Data Cleaning Studio",
  description: "Clean, transform, validate, and export reproducible pipelines — No-DB.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
    apple: "/favicon.svg",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
}
