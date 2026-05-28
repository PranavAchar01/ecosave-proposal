"use client";

import { useState } from "react";
import type { CustomerInput, StreamEvent, ProductRecommendation, Incentive, IncomeEstimate, PropertyIntelligence, LocalMarketIntel, CommunitySignals } from "@/lib/types";
import { ProposalResult } from "./components/ProposalResult";
import { PipelineProgress } from "./components/PipelineProgress";

const GOALS = [
  "Reduce energy bills",
  "Increase home comfort",
  "Lower carbon footprint",
  "Prepare for EV charging",
  "Improve indoor air quality",
  "Increase home value",
  "Energy independence / backup power",
];

const DEFAULT_FORM: CustomerInput = {
  name: "",
  address: "",
  zipCode: "",
  email: "",
  homeType: "single_family",
  sqft: 1800,
  yearBuilt: 1985,
  heatingType: "gas",
  monthlyBill: 180,
  budget: "10k_25k",
  goals: [],
  roofAge: 12,
  hasAttic: true,
  state: "",
  linkedinUrl: "",
  instagramHandle: "",
};

interface StepInfo {
  step: string;
  detail: string;
  done: boolean;
}

export default function HomePage() {
  const [form, setForm] = useState<CustomerInput>(DEFAULT_FORM);
  const [running, setRunning] = useState(false);
  const [steps, setSteps] = useState<StepInfo[]>([]);
  const [result, setResult] = useState<{
    proposal: string;
    products: ProductRecommendation[];
    incentives: Incentive[];
    incomeEstimate: IncomeEstimate | null;
    propertyIntel: PropertyIntelligence | null;
    localMarket: LocalMarketIntel | null;
    communitySignals: CommunitySignals | null;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  function toggleGoal(goal: string) {
    setForm((f) => ({
      ...f,
      goals: f.goals.includes(goal)
        ? f.goals.filter((g) => g !== goal)
        : [...f.goals, goal],
    }));
  }

  function field<K extends keyof CustomerInput>(key: K, value: CustomerInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (form.goals.length === 0) {
      alert("Please select at least one goal.");
      return;
    }

    setRunning(true);
    setSteps([]);
    setResult(null);
    setError(null);

    try {
      const res = await fetch("/api/proposal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
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
          } else if (event.type === "error") {
            setError(event.message);
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setRunning(false);
    }
  }

  if (result) {
    return (
      <ProposalResult
        proposal={result.proposal}
        products={result.products}
        incentives={result.incentives}
        incomeEstimate={result.incomeEstimate}
        propertyIntel={result.propertyIntel}
        localMarket={result.localMarket}
        communitySignals={result.communitySignals}
        customerName={form.name}
        onReset={() => { setResult(null); setSteps([]); }}
      />
    );
  }

  return (
    <div className="space-y-8">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold text-ecosave-800">
          Your Personalized Energy Proposal
        </h1>
        <p className="text-gray-500 max-w-xl mx-auto">
          Tell us about your home. Our AI pipeline researches your solar potential,
          applicable incentives, and best-fit products — then writes a custom proposal in under 60 seconds.
        </p>
      </div>

      {running && <PipelineProgress steps={steps} />}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">
          {error}
        </div>
      )}

      {!running && (
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Contact */}
          <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
            <h2 className="font-semibold text-gray-700 text-sm uppercase tracking-wide">Contact</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField label="Full Name" required>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => field("name", e.target.value)}
                  className="input"
                  placeholder="Jane Smith"
                />
              </FormField>
              <FormField label="Email">
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => field("email", e.target.value)}
                  className="input"
                  placeholder="jane@example.com"
                />
              </FormField>
            </div>
            {/* LinkedIn — optional personalization */}
            <div className="border border-dashed border-green-200 rounded-lg p-4 bg-green-50 space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-green-700 uppercase tracking-wide">
                  LinkedIn Personalization
                </span>
                <span className="text-xs bg-green-100 text-green-600 px-2 py-0.5 rounded-full">Optional</span>
              </div>
              <p className="text-xs text-gray-500">
                Share your public LinkedIn profile URL to let our AI estimate your income range and tailor financing recommendations to your career profile.
                We only read publicly available data via Apify — never stored.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField label="LinkedIn Profile URL">
                  <input
                    type="url"
                    value={form.linkedinUrl ?? ""}
                    onChange={(e) => field("linkedinUrl", e.target.value)}
                    className="input"
                    placeholder="https://www.linkedin.com/in/your-username"
                  />
                </FormField>
                <FormField label="Instagram Handle">
                  <input
                    type="text"
                    value={form.instagramHandle ?? ""}
                    onChange={(e) => field("instagramHandle", e.target.value)}
                    className="input"
                    placeholder="@yourhandle"
                  />
                </FormField>
              </div>
            </div>
          </section>

          {/* Property */}
          <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
            <h2 className="font-semibold text-gray-700 text-sm uppercase tracking-wide">Property</h2>
            <FormField label="Street Address" required>
              <input
                type="text"
                required
                value={form.address}
                onChange={(e) => field("address", e.target.value)}
                className="input"
                placeholder="123 Maple St"
              />
            </FormField>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <FormField label="ZIP Code" required>
                <input
                  type="text"
                  required
                  pattern="\d{5}"
                  value={form.zipCode}
                  onChange={(e) => field("zipCode", e.target.value)}
                  className="input"
                  placeholder="02134"
                />
              </FormField>
              <FormField label="State (2-letter)" required>
                <input
                  type="text"
                  required
                  maxLength={2}
                  value={form.state}
                  onChange={(e) => field("state", e.target.value.toUpperCase())}
                  className="input"
                  placeholder="MA"
                />
              </FormField>
              <FormField label="Home Type">
                <select
                  value={form.homeType}
                  onChange={(e) => field("homeType", e.target.value as CustomerInput["homeType"])}
                  className="input"
                >
                  <option value="single_family">Single Family</option>
                  <option value="townhouse">Townhouse</option>
                  <option value="condo">Condo</option>
                  <option value="multi_family">Multi-family</option>
                </select>
              </FormField>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <FormField label="Square Feet">
                <input
                  type="number"
                  min={200}
                  max={10000}
                  value={form.sqft}
                  onChange={(e) => field("sqft", Number(e.target.value))}
                  className="input"
                />
              </FormField>
              <FormField label="Year Built">
                <input
                  type="number"
                  min={1900}
                  max={2024}
                  value={form.yearBuilt}
                  onChange={(e) => field("yearBuilt", Number(e.target.value))}
                  className="input"
                />
              </FormField>
              <FormField label="Roof Age (years)">
                <input
                  type="number"
                  min={0}
                  max={50}
                  value={form.roofAge}
                  onChange={(e) => field("roofAge", Number(e.target.value))}
                  className="input"
                />
              </FormField>
              <FormField label="Has Attic?">
                <select
                  value={form.hasAttic ? "yes" : "no"}
                  onChange={(e) => field("hasAttic", e.target.value === "yes")}
                  className="input"
                >
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </FormField>
            </div>
          </section>

          {/* Energy Usage */}
          <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
            <h2 className="font-semibold text-gray-700 text-sm uppercase tracking-wide">Energy Usage</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField label="Primary Heating Source">
                <select
                  value={form.heatingType}
                  onChange={(e) => field("heatingType", e.target.value as CustomerInput["heatingType"])}
                  className="input"
                >
                  <option value="gas">Natural Gas</option>
                  <option value="oil">Oil</option>
                  <option value="electric">Electric</option>
                  <option value="propane">Propane</option>
                </select>
              </FormField>
              <FormField label="Avg Monthly Electric Bill ($)">
                <input
                  type="number"
                  min={20}
                  max={2000}
                  value={form.monthlyBill}
                  onChange={(e) => field("monthlyBill", Number(e.target.value))}
                  className="input"
                />
              </FormField>
            </div>
          </section>

          {/* Budget */}
          <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-3">
            <h2 className="font-semibold text-gray-700 text-sm uppercase tracking-wide">Budget Range</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {(
                [
                  ["under_10k", "Under $10k"],
                  ["10k_25k", "$10k – $25k"],
                  ["25k_50k", "$25k – $50k"],
                  ["over_50k", "$50k+"],
                ] as const
              ).map(([val, label]) => (
                <label
                  key={val}
                  className={`cursor-pointer rounded-lg border-2 p-3 text-center text-sm font-medium transition-colors ${
                    form.budget === val
                      ? "border-ecosave-600 bg-ecosave-50 text-ecosave-800"
                      : "border-gray-200 hover:border-ecosave-300"
                  }`}
                >
                  <input
                    type="radio"
                    name="budget"
                    value={val}
                    checked={form.budget === val}
                    onChange={() => field("budget", val)}
                    className="sr-only"
                  />
                  {label}
                </label>
              ))}
            </div>
          </section>

          {/* Goals */}
          <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-3">
            <h2 className="font-semibold text-gray-700 text-sm uppercase tracking-wide">
              Your Goals <span className="text-gray-400 font-normal">(select all that apply)</span>
            </h2>
            <div className="flex flex-wrap gap-2">
              {GOALS.map((goal) => (
                <button
                  key={goal}
                  type="button"
                  onClick={() => toggleGoal(goal)}
                  className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                    form.goals.includes(goal)
                      ? "bg-ecosave-600 text-white border-ecosave-600"
                      : "bg-white text-gray-600 border-gray-300 hover:border-ecosave-400"
                  }`}
                >
                  {goal}
                </button>
              ))}
            </div>
          </section>

          <button
            type="submit"
            className="w-full bg-ecosave-600 hover:bg-ecosave-700 text-white font-semibold py-3 px-6 rounded-xl transition-colors shadow-sm text-base"
          >
            Generate My Proposal
          </button>

          <p className="text-center text-xs text-gray-400">
            Pipeline: Geocode → NREL Solar → Incentive Lookup → Claude Product Match → Claude Proposal
          </p>
        </form>
      )}
    </div>
  );
}

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
