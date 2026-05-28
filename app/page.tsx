"use client";

import { useState } from "react";
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

// ─── Constants ────────────────────────────────────────────────────────────────

const PRODUCTS = [
  { id: "solar", label: "Solar", icon: "☀️" },
  { id: "battery_storage", label: "Battery Storage", icon: "🔋" },
  { id: "hvac", label: "HVAC", icon: "❄️" },
  { id: "insulation", label: "Insulation", icon: "🏠" },
  { id: "roofing", label: "Roofing", icon: "🏗️" },
  { id: "electrical", label: "Electrical", icon: "⚡" },
];

const DATA_SOURCES = [
  {
    id: "zillow",
    icon: "🏠",
    label: "Zillow Property Intel",
    desc: "Home value, equity & structural details",
  },
  {
    id: "nrel",
    icon: "☀️",
    label: "NREL Solar Data",
    desc: "Real solar production from gov't satellite data",
  },
  {
    id: "maps",
    icon: "📍",
    label: "Google Maps",
    desc: "Local installer & contractor landscape",
  },
  {
    id: "reddit",
    icon: "💬",
    label: "Reddit Community",
    desc: "Homeowner sentiment & program feedback",
  },
];

// ─── Types ────────────────────────────────────────────────────────────────────

type Stage = "intake" | "searching" | "confirm" | "running" | "done";

interface StepInfo {
  step: string;
  detail: string;
  done: boolean;
}

type ProposalResult = {
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

  // Step 1 — intake
  const [form, setForm] = useState<Omit<CustomerFormInput, "linkedinUrl" | "instagramHandle">>({
    firstName: "",
    lastName: "",
    address: "",
    city: "",
    state: "",
    zipCode: "",
    interests: [],
  });

  // Step 2 — confirm
  const [candidates, setCandidates] = useState<LinkedInCandidate[]>([]);
  const [selectedUrl, setSelectedUrl] = useState<string | "none" | null>(null);
  const [instagramHandle, setInstagramHandle] = useState("");

  // Step 3 — running / done
  const [steps, setSteps] = useState<StepInfo[]>([]);
  const [result, setResult] = useState<ProposalResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ── Helpers ──
  function toggleInterest(id: string) {
    setForm((f) => ({
      ...f,
      interests: f.interests.includes(id)
        ? f.interests.filter((i) => i !== id)
        : [...f.interests, id],
    }));
  }

  // ── Step 1: search LinkedIn ──
  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!form.firstName || !form.lastName || !form.address || !form.zipCode || !form.state) {
      alert("Please fill in all required fields.");
      return;
    }
    if (form.interests.length === 0) {
      alert("Please select at least one product interest.");
      return;
    }

    setStage("searching");
    setCandidates([]);
    setSelectedUrl(null);

    try {
      const res = await fetch("/api/search-linkedin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: form.firstName,
          lastName: form.lastName,
          city: form.city,
          state: form.state,
        }),
      });
      const data = await res.json();
      setCandidates(data.candidates ?? []);
    } catch {
      // proceed with no candidates
    }

    setStage("confirm");
  }

  // ── Step 2: generate proposal ──
  async function handleGenerate() {
    setStage("running");
    setSteps([]);
    setError(null);

    const payload: CustomerFormInput = {
      ...form,
      linkedinUrl: selectedUrl && selectedUrl !== "none" ? selectedUrl : undefined,
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
          try {
            event = JSON.parse(raw);
          } catch {
            continue;
          }

          if (event.type === "step") {
            setSteps((prev) => [
              ...prev.map((s) => ({ ...s, done: true })),
              { step: event.step, detail: event.detail, done: false },
            ]);
          } else if (event.type === "done") {
            setSteps((prev) => prev.map((s) => ({ ...s, done: true })));
            setResult({
              proposal: event.proposal,
              products: event.products,
              incentives: event.incentives,
              incomeEstimate: event.incomeEstimate,
              propertyIntel: event.propertyIntel,
              localMarket: event.localMarket,
              communitySignals: event.communitySignals,
            });
            setStage("done");
          } else if (event.type === "error") {
            setError(event.message);
            setStage("running"); // stay on running view to show error
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    }
  }

  // ─── Render: done ────────────────────────────────────────────────────────────
  if (stage === "done" && result) {
    return (
      <ProposalResult
        proposal={result.proposal}
        products={result.products}
        incentives={result.incentives}
        incomeEstimate={result.incomeEstimate}
        propertyIntel={result.propertyIntel}
        localMarket={result.localMarket}
        communitySignals={result.communitySignals}
        customerName={`${form.firstName} ${form.lastName}`}
        onReset={() => {
          setResult(null);
          setSteps([]);
          setStage("intake");
        }}
      />
    );
  }

  // ─── Render: running ─────────────────────────────────────────────────────────
  if (stage === "running") {
    return (
      <div className="space-y-6">
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-bold text-ecosave-800">
            Building Your Proposal
          </h1>
          <p className="text-sm text-gray-500">
            Our AI pipeline is researching {form.firstName}&apos;s property, market, and incentives…
          </p>
        </div>
        <PipelineProgress steps={steps} />
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">
            {error}
          </div>
        )}
      </div>
    );
  }

  // ─── Render: confirm ─────────────────────────────────────────────────────────
  if (stage === "confirm") {
    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-bold text-ecosave-800">
            Confirm Profile &amp; Data Sources
          </h1>
          <p className="text-sm text-gray-500">
            Select {form.firstName}&apos;s LinkedIn profile, then review what our pipeline will pull.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* LinkedIn picker */}
          <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-gray-700 text-sm uppercase tracking-wide">
                LinkedIn Profile
              </h2>
              <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-medium">
                Income &amp; career data
              </span>
            </div>

            {candidates.length === 0 ? (
              <div className="rounded-lg border border-dashed border-gray-200 p-5 text-center text-sm text-gray-400 space-y-2">
                <div className="text-2xl">🔍</div>
                <p>No LinkedIn profiles found automatically.</p>
                <p className="text-xs">Paste a URL below to add one manually.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {candidates.map((c) => (
                  <label
                    key={c.url}
                    className={`flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition-colors ${
                      selectedUrl === c.url
                        ? "border-ecosave-500 bg-ecosave-50"
                        : "border-gray-200 hover:border-ecosave-300"
                    }`}
                  >
                    <input
                      type="radio"
                      name="linkedin"
                      value={c.url}
                      checked={selectedUrl === c.url}
                      onChange={() => setSelectedUrl(c.url)}
                      className="mt-1 accent-green-600"
                    />
                    <div className="min-w-0">
                      <p className="font-medium text-gray-800 text-sm">{c.name}</p>
                      {c.headline && (
                        <p className="text-xs text-gray-500 truncate">{c.headline}</p>
                      )}
                      <p className="text-xs text-blue-500 truncate mt-0.5">{c.url}</p>
                    </div>
                  </label>
                ))}
              </div>
            )}

            {/* Manual URL input */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-500">
                Or paste LinkedIn URL directly
              </label>
              <input
                type="url"
                value={selectedUrl && selectedUrl !== "none" && !candidates.find((c) => c.url === selectedUrl) ? selectedUrl : ""}
                onChange={(e) => setSelectedUrl(e.target.value || null)}
                placeholder="https://www.linkedin.com/in/username"
                className="input text-sm"
              />
            </div>

            <label className="flex items-center gap-2 text-sm text-gray-500 cursor-pointer">
              <input
                type="radio"
                name="linkedin"
                value="none"
                checked={selectedUrl === "none"}
                onChange={() => setSelectedUrl("none")}
                className="accent-gray-400"
              />
              Skip LinkedIn — generate without income data
            </label>
          </section>

          {/* Data sources panel */}
          <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-gray-700 text-sm uppercase tracking-wide">
                Data Sources
              </h2>
              <span className="flex items-center gap-1 text-xs text-green-600 font-medium">
                <span className="w-2 h-2 rounded-full bg-green-500 inline-block"></span>
                All Connected
              </span>
            </div>

            <div className="space-y-3">
              {DATA_SOURCES.map((src) => (
                <div
                  key={src.id}
                  className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg"
                >
                  <span className="text-xl">{src.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-700">{src.label}</p>
                    <p className="text-xs text-gray-400">{src.desc}</p>
                  </div>
                  <span className="shrink-0 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                    Ready
                  </span>
                </div>
              ))}

              {/* Instagram — optional, with input */}
              <div className="p-3 bg-gray-50 rounded-lg space-y-2">
                <div className="flex items-center gap-3">
                  <span className="text-xl">📸</span>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-700">Instagram</p>
                    <p className="text-xs text-gray-400">Social tone & lifestyle signals</p>
                  </div>
                  <span
                    className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${
                      instagramHandle
                        ? "bg-green-100 text-green-700"
                        : "bg-gray-200 text-gray-500"
                    }`}
                  >
                    {instagramHandle ? "Ready" : "Optional"}
                  </span>
                </div>
                <input
                  type="text"
                  value={instagramHandle}
                  onChange={(e) => setInstagramHandle(e.target.value)}
                  placeholder="@handle (optional)"
                  className="input text-sm"
                />
              </div>
            </div>

            {/* Selected interests recap */}
            <div className="pt-2 border-t border-gray-100">
              <p className="text-xs text-gray-500 mb-2">Products requested</p>
              <div className="flex flex-wrap gap-1.5">
                {PRODUCTS.filter((p) => form.interests.includes(p.id)).map((p) => (
                  <span
                    key={p.id}
                    className="text-xs bg-ecosave-50 text-ecosave-700 border border-ecosave-200 px-2 py-0.5 rounded-full"
                  >
                    {p.icon} {p.label}
                  </span>
                ))}
              </div>
            </div>
          </section>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setStage("intake")}
            className="px-5 py-2.5 rounded-xl border border-gray-300 text-gray-600 text-sm font-medium hover:bg-gray-50 transition-colors"
          >
            ← Back
          </button>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={selectedUrl === null}
            className="flex-1 bg-ecosave-600 hover:bg-ecosave-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-2.5 px-6 rounded-xl transition-colors shadow-sm text-sm"
          >
            Generate My Proposal →
          </button>
        </div>

        {selectedUrl === null && (
          <p className="text-center text-xs text-gray-400">
            Select a LinkedIn profile above — or choose &quot;Skip LinkedIn&quot; to continue.
          </p>
        )}
      </div>
    );
  }

  // ─── Render: searching ───────────────────────────────────────────────────────
  if (stage === "searching") {
    return (
      <div className="flex flex-col items-center justify-center py-24 space-y-4">
        <div className="w-12 h-12 border-4 border-ecosave-200 border-t-ecosave-600 rounded-full animate-spin" />
        <p className="text-gray-600 font-medium">Searching LinkedIn for {form.firstName} {form.lastName}…</p>
        <p className="text-xs text-gray-400">This takes a few seconds</p>
      </div>
    );
  }

  // ─── Render: intake (step 1) ─────────────────────────────────────────────────
  return (
    <div className="space-y-8">
      {/* Hero */}
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold text-ecosave-800">
          Get Your Free Energy Proposal
        </h1>
        <p className="text-gray-500 max-w-lg mx-auto text-sm">
          Enter the customer&apos;s basic info. Our AI pipeline finds their profile, researches
          their property, and writes a hyper-personalized proposal in under 60 seconds.
        </p>
      </div>

      <form onSubmit={handleSearch} className="space-y-6">
        {/* Name */}
        <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
          <h2 className="font-semibold text-gray-700 text-sm uppercase tracking-wide">
            Customer
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="First Name" required>
              <input
                type="text"
                required
                value={form.firstName}
                onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
                className="input"
                placeholder="Jane"
              />
            </FormField>
            <FormField label="Last Name" required>
              <input
                type="text"
                required
                value={form.lastName}
                onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
                className="input"
                placeholder="Smith"
              />
            </FormField>
          </div>
        </section>

        {/* Address */}
        <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
          <h2 className="font-semibold text-gray-700 text-sm uppercase tracking-wide">
            Property Address
          </h2>
          <FormField label="Street Address" required>
            <input
              type="text"
              required
              value={form.address}
              onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
              className="input"
              placeholder="123 Maple Street"
            />
          </FormField>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <FormField label="City" required>
              <input
                type="text"
                required
                value={form.city}
                onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                className="input"
                placeholder="Boston"
              />
            </FormField>
            <FormField label="State" required>
              <input
                type="text"
                required
                maxLength={2}
                value={form.state}
                onChange={(e) => setForm((f) => ({ ...f, state: e.target.value.toUpperCase() }))}
                className="input"
                placeholder="MA"
              />
            </FormField>
            <FormField label="ZIP Code" required>
              <input
                type="text"
                required
                pattern="\d{5}"
                value={form.zipCode}
                onChange={(e) => setForm((f) => ({ ...f, zipCode: e.target.value }))}
                className="input"
                placeholder="02134"
              />
            </FormField>
          </div>
        </section>

        {/* Product interests */}
        <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-700 text-sm uppercase tracking-wide">
              What Are They Interested In?
            </h2>
            <span className="text-xs text-gray-400">Select all that apply</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {PRODUCTS.map((p) => {
              const active = form.interests.includes(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => toggleInterest(p.id)}
                  className={`flex items-center gap-2 px-4 py-3 rounded-lg border-2 text-sm font-medium transition-colors ${
                    active
                      ? "border-ecosave-600 bg-ecosave-50 text-ecosave-800"
                      : "border-gray-200 text-gray-600 hover:border-ecosave-300"
                  }`}
                >
                  <span className="text-lg">{p.icon}</span>
                  {p.label}
                </button>
              );
            })}
          </div>
        </section>

        <button
          type="submit"
          className="w-full bg-ecosave-600 hover:bg-ecosave-700 text-white font-semibold py-3 px-6 rounded-xl transition-colors shadow-sm text-base"
        >
          Search &amp; Find Profile →
        </button>

        <p className="text-center text-xs text-gray-400">
          We&apos;ll search for the most likely LinkedIn match — you pick the right one before generating.
        </p>
      </form>
    </div>
  );
}

// ─── FormField helper ─────────────────────────────────────────────────────────
function FormField({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label className="text-sm font-medium text-gray-600">
        {label}
        {required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}
