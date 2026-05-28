"use client";

import { ExternalLink, Printer, RotateCcw, Sun, Battery, Thermometer, Home, HardHat, Zap, Building2, Map, MessageSquare, Link2 } from "lucide-react";
import type { ProductRecommendation, Incentive, IncomeEstimate, PropertyIntelligence, LocalMarketIntel, CommunitySignals } from "@/lib/types";

// ─── Maps ────────────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  solar_ppa:       "Solar PPA",
  hvac:            "HVAC / Heat Pump",
  insulation:      "Insulation",
  electrical:      "Electrical Upgrade",
  roofing:         "Roofing",
  battery_storage: "Battery Storage",
};

const CATEGORY_ICON: Record<string, React.ElementType> = {
  solar_ppa:       Sun,
  hvac:            Thermometer,
  insulation:      Home,
  electrical:      Zap,
  roofing:         HardHat,
  battery_storage: Battery,
};

const PRIORITY_STYLE: Record<string, string> = {
  high:   "text-green-700 bg-green-50 border border-green-200",
  medium: "text-yellow-700 bg-yellow-50 border border-yellow-200",
  low:    "text-gray-500 bg-gray-100 border border-gray-200",
};

const SCOPE_STYLE: Record<string, string> = {
  federal: "text-blue-700 bg-blue-50",
  state:   "text-purple-700 bg-purple-50",
  utility: "text-green-700 bg-green-50",
};

const CONFIDENCE_STYLE: Record<string, string> = {
  high:   "text-green-700",
  medium: "text-yellow-600",
  low:    "text-gray-500",
};

// ─── Markdown renderer ────────────────────────────────────────────────────────

function renderMarkdown(md: string): string {
  return md
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/^- (.+)$/gm, "<li>$1</li>")
    .replace(/(<li>.*<\/li>\n?)+/g, (m) => `<ul>${m}</ul>`)
    .replace(/^(\d+)\. (.+)$/gm, "<li>$2</li>")
    .replace(/\n\n/g, "</p><p>")
    .replace(/^(.+)$/gm, (line) => (line.startsWith("<") ? line : `<p>${line}</p>`));
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  proposal: string;
  products: ProductRecommendation[];
  incentives: Incentive[];
  incomeEstimate: IncomeEstimate | null;
  propertyIntel: PropertyIntelligence | null;
  localMarket: LocalMarketIntel | null;
  communitySignals: CommunitySignals | null;
  customerName: string;
  onReset: () => void;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function ProposalResult({ proposal, products, incentives, incomeEstimate, propertyIntel, localMarket, communitySignals, customerName, onReset }: Props) {
  const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  return (
    <div className="space-y-0 divide-y divide-gray-100">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="pb-8 flex items-start justify-between gap-4">
        <div>
          <p className="section-label mb-1">Energy Proposal</p>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">{customerName}</h1>
          <p className="text-sm text-gray-400 mt-1">{today}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => window.print()}
            className="btn-ghost flex items-center gap-1.5"
          >
            <Printer size={14} strokeWidth={1.75} />
            Print
          </button>
          <button onClick={onReset} className="btn-ghost flex items-center gap-1.5">
            <RotateCcw size={14} strokeWidth={1.75} />
            New
          </button>
        </div>
      </div>

      {/* ── Intelligence strip ──────────────────────────────────────────────── */}
      {(incomeEstimate || propertyIntel?.property || localMarket || communitySignals) && (
        <div className="py-8">
          <p className="section-label">Intelligence Gathered</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-0 border border-gray-200 divide-x divide-gray-200">

            {incomeEstimate && (
              <div className="p-4 space-y-1">
                <div className="flex items-center gap-1.5 mb-2">
                  <Link2 size={12} className="text-gray-400" strokeWidth={1.75} />
                  <span className="stat-label">Income</span>
                </div>
                <p className="text-base font-bold text-gray-900">{incomeEstimate.label}</p>
                <p className={`text-xs ${CONFIDENCE_STYLE[incomeEstimate.confidence]}`}>
                  {incomeEstimate.confidence} confidence
                </p>
              </div>
            )}

            {propertyIntel?.property && (
              <div className="p-4 space-y-1">
                <div className="flex items-center gap-1.5 mb-2">
                  <Building2 size={12} className="text-gray-400" strokeWidth={1.75} />
                  <span className="stat-label">Property</span>
                </div>
                {propertyIntel.property.zestimate ? (
                  <p className="text-base font-bold text-gray-900">
                    ${Math.round(propertyIntel.property.zestimate / 1000)}k
                  </p>
                ) : (
                  <p className="text-sm text-gray-400">No Zestimate</p>
                )}
                {propertyIntel.estimatedEquity && (
                  <p className="text-xs text-gray-400">
                    ~${Math.round(propertyIntel.estimatedEquity / 1000)}k equity
                  </p>
                )}
                <p className="text-xs text-gray-400">{propertyIntel.financingCapacity} financing</p>
              </div>
            )}

            {localMarket && (
              <div className="p-4 space-y-1">
                <div className="flex items-center gap-1.5 mb-2">
                  <Map size={12} className="text-gray-400" strokeWidth={1.75} />
                  <span className="stat-label">Local Market</span>
                </div>
                <p className="text-base font-bold text-gray-900">
                  {localMarket.solarInstallers.length + localMarket.hvacContractors.length}
                </p>
                <p className="text-xs text-gray-400">contractors nearby</p>
                <p className="text-xs text-gray-400">{localMarket.marketCompetitiveness} competition</p>
              </div>
            )}

            {communitySignals && (
              <div className="p-4 space-y-1">
                <div className="flex items-center gap-1.5 mb-2">
                  <MessageSquare size={12} className="text-gray-400" strokeWidth={1.75} />
                  <span className="stat-label">Community</span>
                </div>
                <p className="text-base font-bold text-gray-900 capitalize">{communitySignals.dominantSentiment}</p>
                <p className="text-xs text-gray-400">{communitySignals.posts.length} posts analyzed</p>
                {communitySignals.keyThemes[0] && (
                  <p className="text-xs text-gray-400 truncate">{communitySignals.keyThemes[0]}</p>
                )}
              </div>
            )}

          </div>
        </div>
      )}

      {/* ── Recommended solutions ────────────────────────────────────────────── */}
      {products.length > 0 && (
        <div className="py-8">
          <p className="section-label">Recommended Solutions</p>
          <div className="space-y-0 divide-y divide-gray-100 border border-gray-200">
            {products.map((p, i) => {
              const Icon = CATEGORY_ICON[p.category] ?? Layers;
              return (
                <div key={i} className="flex items-start gap-5 p-5">
                  {/* Number */}
                  <span className="text-xs tabular-nums text-gray-300 font-medium w-5 shrink-0 mt-0.5">
                    {String(i + 1).padStart(2, "0")}
                  </span>

                  {/* Icon */}
                  <Icon size={15} className="text-gray-400 shrink-0 mt-0.5" strokeWidth={1.75} />

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                        {CATEGORY_LABELS[p.category] ?? p.category}
                      </span>
                      <span className={`text-xs font-medium px-1.5 py-0.5 ${PRIORITY_STYLE[p.priority]}`}>
                        {p.priority}
                      </span>
                    </div>
                    <p className="text-sm font-semibold text-gray-900 mb-1">{p.productName}</p>
                    <p className="text-sm text-gray-500 leading-relaxed">{p.rationale}</p>
                    <div className="flex items-center gap-4 mt-2">
                      <span className="text-xs text-gray-400">Timeline: {p.estimatedTimeline}</span>
                    </div>
                    {p.compatibleIncentives.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {p.compatibleIncentives.slice(0, 2).map((inc, j) => (
                          <span key={j} className="text-xs text-gray-500 border border-gray-200 px-2 py-0.5 truncate max-w-xs" title={inc}>
                            {inc.length > 40 ? inc.slice(0, 40) + "…" : inc}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Full proposal narrative ──────────────────────────────────────────── */}
      <div className="py-8">
        <p className="section-label">Full Proposal</p>
        <div
          className="proposal-content"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(proposal) }}
        />
      </div>

      {/* ── Incentive programs ───────────────────────────────────────────────── */}
      {incentives.length > 0 && (
        <div className="py-8">
          <p className="section-label">Incentive Programs</p>
          <div className="border border-gray-200 divide-y divide-gray-100">
            {incentives.map((inc, i) => (
              <div key={i} className="flex gap-4 p-5">
                <div className="shrink-0 pt-0.5">
                  <span className={`text-xs font-semibold px-1.5 py-0.5 uppercase tracking-wide ${SCOPE_STYLE[inc.scope]}`}>
                    {inc.scope}
                  </span>
                </div>
                <div className="flex-1 min-w-0 space-y-1">
                  <p className="text-sm font-semibold text-gray-900">{inc.name}</p>
                  <p className="text-xs font-medium text-green-700">{inc.amount}</p>
                  <p className="text-xs text-gray-400 leading-relaxed">{inc.eligibilityNotes}</p>
                  <a
                    href={inc.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-900 transition-colors"
                  >
                    Official source
                    <ExternalLink size={10} strokeWidth={1.75} />
                  </a>
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-3 leading-relaxed">
            Amounts shown are program maximums from official sources. Actual eligibility depends on individual circumstances.
            Consult a licensed tax professional before making financial decisions.
          </p>
        </div>
      )}

    </div>
  );
}

// Fallback icon for unknown categories
function Layers({ size, className, strokeWidth }: { size?: number; className?: string; strokeWidth?: number }) {
  return (
    <svg width={size ?? 15} height={size ?? 15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth ?? 1.75} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <polygon points="12 2 2 7 12 12 22 7 12 2" />
      <polyline points="2 17 12 22 22 17" />
      <polyline points="2 12 12 17 22 12" />
    </svg>
  );
}
