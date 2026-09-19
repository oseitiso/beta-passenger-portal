import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "B-ETA — Live Buses",
  description: "Real-time bus tracking for Botswana",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased bg-neutral-950 text-neutral-100">
        {children}
      </body>
    </html>
  );
}