"use client";

import { useState } from "react";
import {
  Sun, Battery, Thermometer, Home, HardHat, Zap,
  Building2, Map, MessageSquare, Camera, CheckCircle2,
  ChevronRight, ArrowLeft, Link2, Search, Loader2,
} from "lucide-react";
import type {
  CustomerFormInput,
  LinkedInCandidate,
  StreamEvent,
  ProductRecommendation,
  Incentive,
  IncomeEstimate,
  PropertyIntelligence,
  LocalMarketIntel,
  CommunitySignals,
} from "@/lib/types";
import { ProposalResult } from "./components/ProposalResult";
import { PipelineProgress } from "./components/PipelineProgress";

// ─── Config ───────────────────────────────────────────────────────────────────

const PRODUCTS = [
  { id: "solar",           label: "Solar PPA",        Icon: Sun        },
  { id: "battery_storage", label: "Battery Storage",  Icon: Battery    },
  { id: "hvac",            label: "HVAC / Heat Pump", Icon: Thermometer},
  { id: "insulation",      label: "Insulation",        Icon: Home       },
  { id: "roofing",         label: "Roofing",           Icon: HardHat    },
  { id: "electrical",      label: "Electrical",        Icon: Zap        },
];

const DATA_SOURCES = [
  { Icon: Building2,      label: "Zillow",        desc: "Property value, equity, structural details" },
  { Icon: Sun,            label: "NREL Solar",    desc: "Solar production estimate from satellite data" },
  { Icon: Map,            label: "Google Maps",   desc: "Local installer & contractor landscape" },
  { Icon: MessageSquare,  label: "Reddit",        desc: "Homeowner sentiment & program feedback" },
];

// ─── Types ────────────────────────────────────────────────────────────────────

type Stage = "intake" | "searching" | "confirm" | "running" | "done";

interface StepInfo {
  step: string;
  detail: string;
  done: boolean;
}

type ResultData = {
  proposal: string;
  products: ProductRecommendation[];
  incentives: Incentive[];
  incomeEstimate: IncomeEstimate | null;
  propertyIntel: PropertyIntelligence | null;
  localMarket: LocalMarketIntel | null;
  communitySignals: CommunitySignals | null;
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function HomePage() {
  const [stage, setStage] = useState<Stage>("intake");

  const [form, setForm] = useState<Omit<CustomerFormInput, "linkedinUrl" | "instagramHandle">>({
    firstName: "", lastName: "", address: "", city: "", state: "", zipCode: "", interests: [],
  });

  const [candidates, setCandidates] = useState<LinkedInCandidate[]>([]);
  const [selectedUrl, setSelectedUrl] = useState<string | "none" | null>(null);
  const [manualUrl, setManualUrl] = useState("");
  const [instagramHandle, setInstagramHandle] = useState("");

  const [steps, setSteps] = useState<StepInfo[]>([]);
  const [result, setResult] = useState<ResultData | null>(null);
  const [error, setError] = useState<string | null>(null);

  function toggleInterest(id: string) {
    setForm((f) => ({
      ...f,
      interests: f.interests.includes(id) ? f.interests.filter((i) => i !== id) : [...f.interests, id],
    }));
  }

  // ── Step 1 → Search LinkedIn ───────────────────────────────────────────────
  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (form.interests.length === 0) {
      alert("Select at least one product interest.");
      return;
    }
    setStage("searching");
    setCandidates([]);
    setSelectedUrl(null);
    setManualUrl("");

    try {
      const res = await fetch("/api/search-linkedin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstName: form.firstName, lastName: form.lastName, city: form.city, state: form.state }),
      });
      const data = await res.json();
      setCandidates(data.candidates ?? []);
    } catch {
      // proceed with no results
    }
    setStage("confirm");
  }

  // ── Step 2 → Generate proposal ────────────────────────────────────────────
  async function handleGenerate() {
    const linkedinUrl = selectedUrl === "none" ? undefined : selectedUrl ?? (manualUrl.trim() || undefined);
    setStage("running");
    setSteps([]);
    setError(null);

    const payload: CustomerFormInput = {
      ...form,
      linkedinUrl,
      instagramHandle: instagramHandle.replace(/^@/, "") || undefined,
    };

    try {
      const res = await fetch("/api/proposal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6).trim();
          if (!raw) continue;
          let event: StreamEvent;
          try { event = JSON.parse(raw); } catch { continue; }

          if (event.type === "step") {
            setSteps((prev) => [
              ...prev.map((s) => ({ ...s, done: true })),
              { step: event.step, detail: event.detail, done: false },
            ]);
          } else if (event.type === "done") {
            setSteps((prev) => prev.map((s) => ({ ...s, done: true })));
            setResult({
              proposal: event.proposal, products: event.products,
              incentives: event.incentives, incomeEstimate: event.incomeEstimate,
              propertyIntel: event.propertyIntel, localMarket: event.localMarket,
              communitySignals: event.communitySignals,
            });
            setStage("done");
          } else if (event.type === "error") {
            setError(event.message);
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    }
  }

  // ─── Done ─────────────────────────────────────────────────────────────────
  if (stage === "done" && result) {
    return (
      <ProposalResult
        {...result}
        customerName={`${form.firstName} ${form.lastName}`}
        onReset={() => { setResult(null); setSteps([]); setStage("intake"); }}
      />
    );
  }

  // ─── Running ──────────────────────────────────────────────────────────────
  if (stage === "running") {
    return (
      <div className="space-y-6">
        <div>
          <p className="section-label">Generating proposal</p>
          <h1 className="text-xl font-bold tracking-tight text-gray-900">
            {form.firstName} {form.lastName}
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            {form.address}, {form.city}, {form.state} {form.zipCode}
          </p>
        </div>
        <PipelineProgress steps={steps} />
        {error && (
          <div className="border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
            {error}
          </div>
        )}
      </div>
    );
  }

  // ─── Confirm ──────────────────────────────────────────────────────────────
  if (stage === "confirm") {
    const effectiveUrl = selectedUrl === "none" ? undefined : selectedUrl ?? (manualUrl.trim() || undefined);
    const canGenerate = selectedUrl === "none" || !!effectiveUrl;

    return (
      <div className="space-y-8">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <button onClick={() => setStage("intake")} className="hover:text-gray-700 transition-colors flex items-center gap-1">
            <ArrowLeft size={12} strokeWidth={2} /> Back
          </button>
          <ChevronRight size={12} strokeWidth={1.5} />
          <span className="text-gray-600 font-medium">{form.firstName} {form.lastName} · {form.city}, {form.state}</span>
        </div>

        <div>
          <p className="section-label">Step 2 of 2</p>
          <h1 className="text-xl font-bold tracking-tight text-gray-900">Confirm Profile &amp; Sources</h1>
          <p className="text-sm text-gray-400 mt-1">Select the correct LinkedIn profile, then generate.</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* LinkedIn picker */}
          <div className="border border-gray-200">
            <div className="border-b border-gray-100 px-5 py-4 flex items-center gap-2">
              <Link2 size={14} className="text-gray-400" strokeWidth={1.75} />
              <span className="text-xs font-semibold uppercase tracking-widest text-gray-400">
                LinkedIn Profile
              </span>
              <span className="ml-auto text-xs text-gray-400">Income &amp; career signals</span>
            </div>

            <div className="divide-y divide-gray-100">
              {candidates.length === 0 ? (
                <div className="px-5 py-8 text-center space-y-2">
                  <Search size={20} className="text-gray-300 mx-auto" strokeWidth={1.5} />
                  <p className="text-sm text-gray-400">No profiles found automatically.</p>
                  <p className="text-xs text-gray-300">Paste a URL below or skip.</p>
                </div>
              ) : (
                candidates.map((c) => (
                  <label
                    key={c.url}
                    className={`flex items-start gap-3 px-5 py-4 cursor-pointer transition-colors ${
                      selectedUrl === c.url ? "bg-gray-50" : "hover:bg-gray-50"
                    }`}
                  >
                    <input
                      type="radio"
                      name="linkedin"
                      value={c.url}
                      checked={selectedUrl === c.url}
                      onChange={() => setSelectedUrl(c.url)}
                      className="mt-0.5 accent-green-700"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900">{c.name || "LinkedIn Profile"}</p>
                      {c.headline && <p className="text-xs text-gray-500 mt-0.5 truncate">{c.headline}</p>}
                      <p className="text-xs text-blue-500 truncate mt-0.5">{c.url}</p>
                    </div>
                    {selectedUrl === c.url && (
                      <CheckCircle2 size={15} className="text-green-600 shrink-0 mt-0.5" strokeWidth={1.75} />
                    )}
                  </label>
                ))
              )}

              {/* Manual URL */}
              <div className="px-5 py-4 space-y-2">
                <p className="text-xs text-gray-400 font-medium">Paste URL manually</p>
                <input
                  type="url"
                  value={manualUrl}
                  onChange={(e) => {
                    setManualUrl(e.target.value);
                    if (e.target.value) setSelectedUrl(null);
                  }}
                  placeholder="https://www.linkedin.com/in/username"
                  className="input"
                />
              </div>

              {/* Skip */}
              <label className="flex items-center gap-3 px-5 py-4 cursor-pointer hover:bg-gray-50 transition-colors">
                <input
                  type="radio"
                  name="linkedin"
                  value="none"
                  checked={selectedUrl === "none"}
                  onChange={() => { setSelectedUrl("none"); setManualUrl(""); }}
                  className="accent-gray-400"
                />
                <span className="text-sm text-gray-500">Skip LinkedIn — generate without income data</span>
              </label>
            </div>
          </div>

          {/* Data sources */}
          <div className="border border-gray-200">
            <div className="border-b border-gray-100 px-5 py-4 flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-widest text-gray-400">Data Sources</span>
              <div className="ml-auto flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 bg-green-500 inline-block"></span>
                <span className="text-xs text-gray-400">All ready</span>
              </div>
            </div>

            <div className="divide-y divide-gray-100">
              {DATA_SOURCES.map(({ Icon, label, desc }) => (
                <div key={label} className="flex items-center gap-4 px-5 py-4">
                  <Icon size={15} className="text-gray-400 shrink-0" strokeWidth={1.75} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-700">{label}</p>
                    <p className="text-xs text-gray-400">{desc}</p>
                  </div>
                  <span className="text-xs font-medium text-green-700 shrink-0">Ready</span>
                </div>
              ))}

              {/* Instagram — optional */}
              <div className="px-5 py-4 space-y-2">
                <div className="flex items-center gap-4">
                  <Camera size={15} className="text-gray-400 shrink-0" strokeWidth={1.75} />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-700">Instagram</p>
                    <p className="text-xs text-gray-400">Social tone &amp; lifestyle signals</p>
                  </div>
                  <span className={`text-xs font-medium shrink-0 ${instagramHandle ? "text-green-700" : "text-gray-300"}`}>
                    {instagramHandle ? "Ready" : "Optional"}
                  </span>
                </div>
                <input
                  type="text"
                  value={instagramHandle}
                  onChange={(e) => setInstagramHandle(e.target.value)}
                  placeholder="@handle (optional)"
                  className="input ml-7"
                />
              </div>
            </div>

            {/* Selected interests */}
            <div className="border-t border-gray-100 px-5 py-4">
              <p className="text-xs text-gray-400 mb-2.5 font-medium">Products requested</p>
              <div className="flex flex-wrap gap-1.5">
                {PRODUCTS.filter((p) => form.interests.includes(p.id)).map(({ id, label, Icon }) => (
                  <span key={id} className="inline-flex items-center gap-1 text-xs border border-gray-200 px-2 py-1 text-gray-600">
                    <Icon size={11} strokeWidth={1.75} />
                    {label}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="flex items-center gap-3">
          <button onClick={() => setStage("intake")} className="btn-ghost flex items-center gap-1.5">
            <ArrowLeft size={14} strokeWidth={1.75} /> Back
          </button>
          <button
            onClick={handleGenerate}
            disabled={!canGenerate}
            className="flex-1 btn-primary flex items-center justify-center gap-2 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Generate Proposal
            <ChevronRight size={14} strokeWidth={2} />
          </button>
        </div>

        {!canGenerate && (
          <p className="text-xs text-gray-400 text-center">
            Select a LinkedIn profile or choose &quot;Skip LinkedIn&quot; to continue.
          </p>
        )}
      </div>
    );
  }

  // ─── Searching ────────────────────────────────────────────────────────────
  if (stage === "searching") {
    return (
      <div className="flex flex-col items-center justify-center py-32 space-y-4">
        <Loader2 size={24} className="text-gray-400 animate-spin" strokeWidth={1.5} />
        <div className="text-center">
          <p className="text-sm font-medium text-gray-700">Searching for {form.firstName} {form.lastName}</p>
          <p className="text-xs text-gray-400 mt-1">Looking up LinkedIn profile matches…</p>
        </div>
      </div>
    );
  }

  // ─── Intake (step 1) ──────────────────────────────────────────────────────
  return (
    <div className="space-y-0">
      <div className="pb-8">
        <p className="section-label">Step 1 of 2</p>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">New Energy Proposal</h1>
        <p className="text-sm text-gray-400 mt-1 max-w-md">
          Enter the customer&apos;s name, address, and product interests. We&apos;ll find their profile and build the proposal automatically.
        </p>
      </div>

      <form onSubmit={handleSearch} className="space-y-0 divide-y divide-gray-200">
        {/* Customer name */}
        <div className="py-7">
          <p className="section-label">Customer</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="First Name" required>
              <input type="text" required value={form.firstName}
                onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
                className="input" placeholder="Jane" />
            </FormField>
            <FormField label="Last Name" required>
              <input type="text" required value={form.lastName}
                onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
                className="input" placeholder="Smith" />
            </FormField>
          </div>
        </div>

        {/* Address */}
        <div className="py-7">
          <p className="section-label">Property Address</p>
          <div className="space-y-4">
            <FormField label="Street Address" required>
              <input type="text" required value={form.address}
                onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                className="input" placeholder="123 Maple Street" />
            </FormField>
            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-1">
                <FormField label="City" required>
                  <input type="text" required value={form.city}
                    onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                    className="input" placeholder="Boston" />
                </FormField>
              </div>
              <FormField label="State" required>
                <input type="text" required maxLength={2} value={form.state}
                  onChange={(e) => setForm((f) => ({ ...f, state: e.target.value.toUpperCase() }))}
                  className="input" placeholder="MA" />
              </FormField>
              <FormField label="ZIP" required>
                <input type="text" required pattern="\d{5}" value={form.zipCode}
                  onChange={(e) => setForm((f) => ({ ...f, zipCode: e.target.value }))}
                  className="input" placeholder="02134" />
              </FormField>
            </div>
          </div>
        </div>

        {/* Product interests */}
        <div className="py-7">
          <div className="flex items-baseline justify-between mb-4">
            <p className="section-label mb-0">Product Interests</p>
            <span className="text-xs text-gray-400">Select all that apply</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {PRODUCTS.map(({ id, label, Icon }) => {
              const active = form.interests.includes(id);
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => toggleInterest(id)}
                  className={`flex items-center gap-2.5 px-4 py-3 border text-sm font-medium transition-colors text-left ${
                    active
                      ? "border-gray-900 bg-gray-900 text-white"
                      : "border-gray-200 text-gray-600 hover:border-gray-400"
                  }`}
                >
                  <Icon size={14} strokeWidth={active ? 2 : 1.75} className={active ? "text-white" : "text-gray-400"} />
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Submit */}
        <div className="pt-7">
          <button type="submit" className="btn-primary w-full flex items-center justify-center gap-2 py-3">
            <Search size={14} strokeWidth={2} />
            Search &amp; Find Profile
          </button>
          <p className="text-xs text-gray-400 text-center mt-3">
            We&apos;ll surface the most likely LinkedIn match — you confirm before generating.
          </p>
        </div>
      </form>
    </div>
  );
}

// ─── FormField helper ─────────────────────────────────────────────────────────
function FormField({
  label, required, children,
}: {
  label: string; required?: boolean; children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-gray-500">
        {label}
        {required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}
