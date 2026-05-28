import Anthropic from "@anthropic-ai/sdk";
import type {
  CustomerInput,
  ProposalState,
  StepLogEntry,
  StreamEvent,
  ProductRecommendation,
} from "../types";
import { geocodeAddress } from "../tools/geocode";
import { fetchSolarData } from "../tools/solar";
import { lookupIncentives } from "../tools/incentives";
import { scrapeLinkedInProfile } from "../tools/linkedin";
import { estimateIncome } from "../tools/income-estimator";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function log(state: ProposalState, step: string, detail: string): StepLogEntry {
  const entry: StepLogEntry = { step, status: "done", detail, timestamp: Date.now() };
  state.stepLog.push(entry);
  state.currentStep = step;
  return entry;
}

async function askClaude(systemPrompt: string, userPrompt: string): Promise<string> {
  const msg = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
    messages: [{ role: "user", content: userPrompt }],
    system: systemPrompt,
  });
  const block = msg.content[0];
  return block.type === "text" ? block.text : "";
}

// Node 0 — LinkedIn profile scrape + income estimation (optional)
async function nodeLinkedIn(state: ProposalState): Promise<void> {
  const url = state.customer.linkedinUrl?.trim();
  if (!url) return; // skip if not provided

  state.currentStep = "linkedin";
  const profile = await scrapeLinkedInProfile(url);
  state.linkedinProfile = profile;

  if (!profile) {
    log(state, "linkedin", "LinkedIn profile not found or private — proceeding without it");
    return;
  }

  const info = profile.basic_info;
  const currentRole = profile.experience?.find((e) => e.is_current) ?? profile.experience?.[0];

  log(
    state,
    "linkedin",
    `Found: ${info.fullname} — ${currentRole?.title ?? info.headline} at ${info.current_company}`
  );

  // Income estimation
  const locationStr = state.location?.city
    ? `${state.location.city}, ${state.location.state}`
    : state.customer.address;

  const estimate = await estimateIncome(profile, locationStr);
  state.incomeEstimate = estimate;

  // Auto-upgrade budget if LinkedIn suggests higher capacity
  const budgetOrder = ["under_10k", "10k_25k", "25k_50k", "over_50k"] as const;
  const currentIdx = budgetOrder.indexOf(state.customer.budget);
  const suggestedIdx = budgetOrder.indexOf(estimate.suggestedBudget);
  if (suggestedIdx > currentIdx) {
    state.customer.budget = estimate.suggestedBudget;
  }

  log(
    state,
    "income",
    `Estimated income: ${estimate.label} (${estimate.confidence} confidence) → budget: ${state.customer.budget}`
  );
}

// Node 1 — Geocode address
async function nodeGeocode(state: ProposalState): Promise<void> {
  state.currentStep = "geocode";
  const loc = await geocodeAddress(state.customer.address, state.customer.zipCode);
  state.location = loc;
  if (!state.customer.state && loc.state) state.customer.state = loc.state;
  log(state, "geocode", `Located: ${loc.city}, ${loc.state} (${loc.lat.toFixed(4)}, ${loc.lng.toFixed(4)})`);
}

// Node 2 — NREL solar data
async function nodeSolar(state: ProposalState): Promise<void> {
  if (!state.location) throw new Error("No location available");
  state.currentStep = "solar";
  const solar = await fetchSolarData(state.location.lat, state.location.lng, state.customer.monthlyBill);
  state.solarData = solar;
  log(state, "solar", `Solar: ${solar.annualKwhAc.toLocaleString()} kWh/yr from ${solar.systemSizeKw}kW (~${solar.estimatedOffset}% offset)`);
}

// Node 3 — Incentive lookup
async function nodeIncentives(state: ProposalState): Promise<void> {
  state.currentStep = "incentives";
  state.incentives = lookupIncentives(state.customer);
  log(state, "incentives", `Found ${state.incentives.length} programs (federal + ${state.customer.state} state/utility)`);
}

// Node 4 — Claude product matching
async function nodeProducts(state: ProposalState): Promise<void> {
  state.currentStep = "products";

  const incomeContext = state.incomeEstimate
    ? `\nEstimated Income (LinkedIn-derived): ${state.incomeEstimate.label} — ${state.incomeEstimate.reasoning}`
    : "";

  const linkedinContext = state.linkedinProfile
    ? `\nLinkedIn Profile: ${state.linkedinProfile.basic_info.fullname}, ${state.linkedinProfile.basic_info.headline}
Current company: ${state.linkedinProfile.basic_info.current_company}
Top skills: ${state.linkedinProfile.basic_info.top_skills?.join(", ") ?? ""}`
    : "";

  const systemPrompt = `You are an EcoSave senior energy consultant. Select 3-5 products from: solar_ppa, hvac (heat pumps), insulation, electrical, roofing, battery_storage.

Return ONLY valid JSON — array of objects. No prose, no markdown fences.

Schema:
{
  "category": "solar_ppa"|"hvac"|"insulation"|"electrical"|"roofing"|"battery_storage",
  "productName": string,
  "rationale": string (2-3 sentences),
  "priority": "high"|"medium"|"low",
  "estimatedTimeline": string,
  "compatibleIncentives": string[]
}

Do NOT fabricate specific savings amounts. Reference program names only.`;

  const userPrompt = `Customer: ${state.customer.sqft} sqft ${state.customer.homeType}, built ${state.customer.yearBuilt}
Location: ${state.location?.city}, ${state.location?.state}
Heating: ${state.customer.heatingType} | Monthly bill: $${state.customer.monthlyBill}
Budget: ${state.customer.budget} | Goals: ${state.customer.goals.join(", ")}
Roof age: ${state.customer.roofAge} yrs | Attic: ${state.customer.hasAttic}${linkedinContext}${incomeContext}

Solar (NREL PVWatts):
- System: ${state.solarData?.systemSizeKw}kW → ${state.solarData?.annualKwhAc?.toLocaleString()} kWh/yr (~${state.solarData?.estimatedOffset}% offset)
- Solar resource: ${state.solarData?.annualSolarRadiation} kWh/m²/day

Incentives available:
${state.incentives.map((i) => `- ${i.name}: ${i.amount} (applies to: ${i.appliesTo.join(", ")})`).join("\n")}`;

  const raw = await askClaude(systemPrompt, userPrompt);
  let products: ProductRecommendation[] = [];
  try {
    products = JSON.parse(raw.replace(/```json|```/g, "").trim());
  } catch {
    const match = raw.match(/\[[\s\S]*\]/);
    if (match) products = JSON.parse(match[0]);
  }

  state.products = products;
  log(state, "products", `Recommended ${products.length} products: ${products.map((p) => p.category).join(", ")}`);
}

// Node 5 — Claude proposal narrative
async function nodeProposal(state: ProposalState): Promise<void> {
  state.currentStep = "proposal";

  const incomeSection = state.incomeEstimate
    ? `\nIncome estimate (LinkedIn, ${state.incomeEstimate.confidence} confidence): ${state.incomeEstimate.label}
${state.incomeEstimate.incomeNotes}`
    : "";

  const linkedinSection = state.linkedinProfile
    ? `\nLinkedIn: ${state.linkedinProfile.basic_info.fullname}, ${state.linkedinProfile.basic_info.headline} at ${state.linkedinProfile.basic_info.current_company}`
    : "";

  const systemPrompt = `You are a senior EcoSave proposal writer. Write a personalized home energy proposal in Markdown (~600 words).

Include: Executive Summary, Home Energy Profile, Recommended Solutions (one section per product), Incentives & Financing Overview, Implementation Sequence, Why EcoSave.

Tone: warm, expert, specific. Use the customer's name throughout.

COMPLIANCE: Never state specific savings, tax credit dollar amounts, or eligibility conclusions.
Use: "may qualify for," "based on program documentation," "consult a tax professional."

If LinkedIn/income data is present, briefly personalize the financing section to their career profile — but never state income explicitly.`;

  const userPrompt = `**Customer:** ${state.customer.name}
**Address:** ${state.customer.address}, ${state.customer.zipCode}
**Home:** ${state.customer.sqft} sqft ${state.customer.homeType}, built ${state.customer.yearBuilt}
**Heating:** ${state.customer.heatingType} | **Bill:** $${state.customer.monthlyBill}/mo
**Budget:** ${state.customer.budget} | **Goals:** ${state.customer.goals.join(", ")}${linkedinSection}${incomeSection}

**Solar (NREL PVWatts):**
- ${state.solarData?.systemSizeKw}kW system → ${state.solarData?.annualKwhAc?.toLocaleString()} kWh/yr
- Solar resource: ${state.solarData?.annualSolarRadiation} kWh/m²/day | ~${state.solarData?.estimatedOffset}% bill offset

**Recommended products:**
${state.products.map((p) => `- [${p.priority.toUpperCase()}] ${p.productName}: ${p.rationale}`).join("\n")}

**Incentive programs:**
${state.incentives.map((i) => `- ${i.name} (${i.scope}): ${i.amount}`).join("\n")}`;

  state.proposalMarkdown = await askClaude(systemPrompt, userPrompt);
  log(state, "proposal", "Proposal generated successfully");
}

// Pipeline step definitions — LinkedIn node is conditional
function buildSteps(hasLinkedIn: boolean) {
  type PipelineStep = {
    key: string;
    label: string;
    detail: string;
    fn: (s: ProposalState) => Promise<void>;
  };

  const steps: PipelineStep[] = [];

  if (hasLinkedIn) {
    steps.push({
      key: "linkedin",
      label: "Reading LinkedIn profile",
      detail: "Apify → apimaestro/linkedin-profile-detail + Claude income estimation",
      fn: nodeLinkedIn,
    });
  }

  steps.push(
    { key: "geocode", label: "Locating your property", detail: "Geocoding via OpenStreetMap Nominatim", fn: nodeGeocode },
    { key: "solar", label: "Fetching solar potential", detail: "NREL PVWatts v8 API", fn: nodeSolar },
    { key: "incentives", label: "Researching incentives", detail: "Federal IRA, state & utility program lookup", fn: nodeIncentives },
    { key: "products", label: "Matching products", detail: "Claude analyzing home + income profile → product selection", fn: nodeProducts },
    { key: "proposal", label: "Writing your proposal", detail: "Claude drafting personalized proposal narrative", fn: nodeProposal }
  );

  return steps;
}

export async function* runProposalPipeline(customer: CustomerInput): AsyncGenerator<StreamEvent> {
  const state: ProposalState = {
    customer,
    location: null,
    solarData: null,
    incentives: [],
    products: [],
    proposalMarkdown: "",
    linkedinProfile: null,
    incomeEstimate: null,
    currentStep: "start",
    stepLog: [],
    error: null,
  };

  const hasLinkedIn = !!(customer.linkedinUrl?.trim());
  const steps = buildSteps(hasLinkedIn);

  for (const step of steps) {
    yield { type: "step", step: step.label, detail: step.detail };
    try {
      await step.fn(state);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // Non-fatal: LinkedIn failures shouldn't block the proposal
      if (step.key === "linkedin") {
        yield { type: "step", step: "LinkedIn skipped", detail: `Could not scrape profile: ${message}` };
        continue;
      }
      yield { type: "error", message: `Step "${step.label}" failed: ${message}` };
      return;
    }
  }

  yield {
    type: "done",
    proposal: state.proposalMarkdown,
    products: state.products,
    incentives: state.incentives,
    incomeEstimate: state.incomeEstimate,
  };
}
