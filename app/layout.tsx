import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Data Cleaning Studio",
  description: "Clean, transform, validate, and export reproducible pipelines — No-DB.",
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
