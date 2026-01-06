import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "PredictEasy - Make Prediction Trading Easier",
  description: "Track Netflix Top 10 rankings, Polymarket odds, and prediction market signals to make smarter trades.",
  openGraph: {
    title: "PredictEasy - Make Prediction Trading Easier",
    description: "Track Netflix Top 10 rankings, Polymarket odds, and prediction market signals to make smarter trades.",
    siteName: "PredictEasy",
  },
  twitter: {
    card: "summary_large_image",
    title: "PredictEasy - Make Prediction Trading Easier",
    description: "Track Netflix Top 10 rankings, Polymarket odds, and prediction market signals to make smarter trades.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider dynamic>
      <html lang="en">
        <body
          className={`${geistSans.variable} ${geistMono.variable} antialiased bg-white`}
        >
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
