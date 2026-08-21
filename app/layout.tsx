/**
 * @module app/layout
 * Root layout for the RockyGPT Next.js application.
 *
 * Sets global metadata (title, description, viewport, manifest),
 * applies the Geist font family, and wraps children in the
 * dark-mode theme provider.
 */

import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "@/app/globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/**
 * Site metadata rendered into the root document head.
 */
export const metadata: Metadata = {
  title: "RockyGPT | Ramapo College Assistant",
  description: "AI chatbot for Ramapo College campus information. Get instant answers about dining, events, campus services, and more!",
  applicationName: "RockyGPT",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "RockyGPT",
  },
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
  },
};

/**
 * Viewport and browser chrome settings for mobile rendering.
 */
export const viewport = {
  themeColor: "#991B1E",
  width: "device-width",
  initialScale: 1,
};

/**
 * Root document layout with app metadata, theme support, and global styles.
 */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
