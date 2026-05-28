import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "EcoSave — Proposal Engine",
  description: "Personalized multi-product energy proposals powered by AI",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-screen bg-white font-sans">
        <header className="border-b border-gray-200 px-6 py-4 flex items-center gap-4">
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-bold tracking-tight text-gray-900 uppercase">EcoSave</span>
            <span className="text-xs text-gray-400 font-medium tracking-wide">Proposal Engine</span>
          </div>
          <div className="ml-auto hidden sm:flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 bg-green-500 inline-block"></span>
            <span className="text-xs text-gray-400">Multi-agent pipeline</span>
          </div>
        </header>

        <main className="max-w-4xl mx-auto px-4 sm:px-6 py-10">
          {children}
        </main>

        <footer className="border-t border-gray-100 mt-16 px-6 py-5">
          <p className="text-xs text-gray-400 max-w-4xl mx-auto">
            AI disclosure: Proposal narrative written by Claude (Anthropic). Solar data from NREL PVWatts.
            Geocoding by OpenStreetMap. Incentive data from official program sources — not financial advice.
          </p>
        </footer>
      </body>
    </html>
  );
}
