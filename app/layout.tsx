import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "EcoSave — Smart Home Energy Proposal",
  description: "Personalized multi-product energy proposals powered by AI",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <header className="bg-ecosave-800 text-white px-6 py-4 flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-ecosave-400 flex items-center justify-center text-ecosave-900 font-bold text-sm">
            ES
          </div>
          <span className="font-semibold text-lg tracking-tight">EcoSave Proposal Engine</span>
          <span className="ml-auto text-ecosave-300 text-sm">AI-powered · Multi-agent</span>
        </header>
        <main className="max-w-4xl mx-auto px-4 py-8">{children}</main>
        <footer className="text-center text-xs text-gray-400 py-6">
          AI disclosure: Proposal narrative written by Claude (Anthropic). Solar data from NREL PVWatts API.
          Geocoding by OpenStreetMap Nominatim. Incentive data from official program sources — not financial advice.
        </footer>
      </body>
    </html>
  );
}
