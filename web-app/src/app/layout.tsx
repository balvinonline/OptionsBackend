import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { MarketProvider } from "../context/MarketContext";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Options Desk - Live Market",
  description: "Advanced Options Trading Dashboard",
  manifest: "/manifest.json",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" style={{ zoom: '85%' }}>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <MarketProvider>
          {children}
        </MarketProvider>
      </body>
    </html>
  );
}
