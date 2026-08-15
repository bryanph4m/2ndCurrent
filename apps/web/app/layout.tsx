import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "SecondCurrent | A better next use for electronics",
    template: "%s | SecondCurrent",
  },
  description:
    "Turn a few electronics photos into a clear item record, price guidance, and a safer next step.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
