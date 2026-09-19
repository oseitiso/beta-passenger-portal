import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "B-ETA — Live Buses",
  description: "Real-time bus tracking for Botswana",
  manifest: "/manifest.webmanifest",
  applicationName: "B-ETA",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "B-ETA",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  themeColor: "#ea580c",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
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