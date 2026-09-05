import type { Metadata, Viewport } from "next";
import { Heebo } from "next/font/google";
import "./globals.css";
import { Suspense } from "react";
import { Providers } from "./providers";
import { PwaRegister } from "@/components/pwa/pwa-register";
import { PwaNavigationBridge } from "@/components/pwa/pwa-navigation-bridge";

const heebo = Heebo({
  subsets: ["hebrew", "latin"],
  variable: "--font-heebo",
  display: "swap",
});

export const metadata: Metadata = {
  title: "REMATCHER Exchange",
  description: "המלאי שלך פוגש את הביקוש של הרשת",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Exchange",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { url: "/icons/icon.svg", type: "image/svg+xml" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#070C14",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="he" dir="rtl" data-brand-ui="2">
      <body className={`${heebo.variable} font-sans bg-v2-canvas text-v2-text-primary`}>
        <Providers>
          {children}
          <PwaRegister />
          <Suspense fallback={null}>
            <PwaNavigationBridge />
          </Suspense>
        </Providers>
      </body>
    </html>
  );
}
