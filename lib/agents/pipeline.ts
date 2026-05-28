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

// Node 1 — Geocode address into lat/lng + state info
async function nodeGeocode(state: ProposalState): Promise<void> {
  state.currentStep = "geocode";
  const loc = await geocodeAddress(state.customer.address, state.customer.zipCode);
  state.location = loc;
  // Fill in state from geocoding if not explicitly set
  if (!state.customer.state && loc.state) {
    state.customer.state = loc.state;
  }
  log(state, "geocode", `Located: ${loc.city}, ${loc.state} (${loc.lat.toFixed(4)}, ${loc.lng.toFixed(4)})`);
}

// Node 2 — Fetch solar potential from NREL PVWatts
async function nodeSolar(state: ProposalState): Promise<void> {
  if (!state.location) throw new Error("No location available");
  state.currentStep = "solar";
  const solar = await fetchSolarData(
    state.location.lat,
    state.location.lng,
    state.customer.monthlyBill
  );
  state.solarData = solar;
  log(
    state,
    "solar",
    `Solar potential: ${solar.annualKwhAc.toLocaleString()} kWh/yr from ${solar.systemSizeKw}kW system (~${solar.estimatedOffset}% offset)`
  );
}

// Node 3 — Look up applicable incentive programs
async function nodeIncentives(state: ProposalState): Promise<void> {
  state.currentStep = "incentives";
  const incentives = lookupIncentives(state.customer);
  state.incentives = incentives;
  log(state, "incentives", `Found ${incentives.length} applicable incentive programs (federal + ${state.customer.state} state/utility)`);
}

// Node 4 — Claude selects and ranks products based on home profile
async function nodeProducts(state: ProposalState): Promise<void> {
  state.currentStep = "products";

  const systemPrompt = `You are an EcoSave senior energy consultant. Based on the customer's home profile and data provided,
select and rank the most appropriate EcoSave products. EcoSave offers: solar PPA, HVAC (heat pumps),
insulation, electrical panel upgrades, roofing, and battery storage.

Return ONLY valid JSON — an array of ProductRecommendation objects. No prose, no markdown fences.

Schema for each item:
{
  "category": "solar_ppa"|"hvac"|"insulation"|"electrical"|"roofing"|"battery_storage",
  "productName": string,
  "rationale": string (2-3 sentences max),
  "priority": "high"|"medium"|"low",
  "estimatedTimeline": string (e.g. "2-4 weeks"),
  "compatibleIncentives": string[] (names of incentives from the list that apply)
}

IMPORTANT: Do not fabricate specific dollar amounts or rebate values. Reference program names only.`;

  const userPrompt = `Customer profile:
- Home: ${state.customer.sqft} sqft ${state.customer.homeType}, built ${state.customer.yearBuilt}
- Location: ${state.location?.city}, ${state.location?.state}
- Heating: ${state.customer.heatingType}
- Monthly electric bill: $${state.customer.monthlyBill}
- Budget range: ${state.customer.budget}
- Goals: ${state.customer.goals.join(", ")}
- Roof age: ${state.customer.roofAge} years
- Has attic: ${state.customer.hasAttic}

Solar data (NREL PVWatts):
- Recommended system: ${state.solarData?.systemSizeKw}kW
- Estimated annual production: ${state.solarData?.annualKwhAc?.toLocaleString()} kWh/yr
- Estimated bill offset: ~${state.solarData?.estimatedOffset}%
- Solar radiation: ${state.solarData?.annualSolarRadiation} kWh/m²/day

Available incentive programs:
${state.incentives.map((i) => `- ${i.name}: ${i.amount} (applies to: ${i.appliesTo.join(", ")})`).join("\n")}

Select 3-5 products. Prioritize based on ROI, the customer's stated goals, and what the home profile suggests.`;

  const raw = await askClaude(systemPrompt, userPrompt);

  let products: ProductRecommendation[] = [];
  try {
    // Strip any accidental markdown fences
    const cleaned = raw.replace(/```json|```/g, "").trim();
    products = JSON.parse(cleaned);
  } catch {
    // Fallback: extract JSON array from response
    const match = raw.match(/\[[\s\S]*\]/);
    if (match) products = JSON.parse(match[0]);
  }

  state.products = products;
  log(state, "products", `Recommended ${products.length} products: ${products.map((p) => p.category).join(", ")}`);
}

// Node 5 — Claude writes the full proposal narrative
async function nodeProposal(state: ProposalState): Promise<void> {
  state.currentStep = "proposal";

  const systemPrompt = `You are a senior EcoSave proposal writer. Write a clear, professional,
personalized home energy proposal for the customer.

Format as Markdown. Include:
1. Executive Summary (3-4 sentences, personalized)
2. Your Home's Energy Profile (what we found)
3. Recommended Solutions (one section per product, with rationale)
4. Incentives & Financing Overview (reference programs by name, DO NOT state specific dollar savings — always direct to program administrator for exact amounts)
5. Recommended Implementation Sequence
6. Why EcoSave

Tone: warm, clear, expert. Length: ~600 words.
CRITICAL COMPLIANCE: Never state specific savings amounts, rebate dollar values, or eligibility conclusions.
Always use language like "may qualify for," "based on the program description," "consult a tax professional."`;

  const userPrompt = `Write a proposal for:

**Customer:** ${state.customer.name}
**Address:** ${state.customer.address}, ${state.customer.zipCode}
**Location:** ${state.location?.city}, ${state.location?.state}
**Home:** ${state.customer.sqft} sqft ${state.customer.homeType}, built ${state.customer.yearBuilt}
**Heating:** ${state.customer.heatingType} | **Monthly Bill:** $${state.customer.monthlyBill}
**Budget:** ${state.customer.budget} | **Goals:** ${state.customer.goals.join(", ")}

**Solar Data (NREL PVWatts — actual API data):**
- Estimated system: ${state.solarData?.systemSizeKw}kW
- Estimated production: ${state.solarData?.annualKwhAc?.toLocaleString()} kWh/yr
- Solar resource: ${state.solarData?.annualSolarRadiation} kWh/m²/day
- Estimated bill offset: ~${state.solarData?.estimatedOffset}%

**Recommended Products:**
${state.products.map((p) => `- [${p.priority.toUpperCase()}] ${p.productName}: ${p.rationale}`).join("\n")}

**Applicable Incentive Programs (confirmed real programs, exact amounts require professional verification):**
${state.incentives.map((i) => `- ${i.name} (${i.scope}): ${i.amount}`).join("\n")}`;

  const proposal = await askClaude(systemPrompt, userPrompt);
  state.proposalMarkdown = proposal;
  log(state, "proposal", "Proposal generated successfully");
}

// Main pipeline — returns an async generator of StreamEvents
export async function* runProposalPipeline(
  customer: CustomerInput
): AsyncGenerator<StreamEvent> {
  const state: ProposalState = {
    customer,
    location: null,
    solarData: null,
    incentives: [],
    products: [],
    proposalMarkdown: "",
    currentStep: "start",
    stepLog: [],
    error: null,
  };

  const steps: Array<{
    key: string;
    label: string;
    detail: string;
    fn: (s: ProposalState) => Promise<void>;
  }> = [
    { key: "geocode", label: "Locating your property", detail: "Geocoding address via OpenStreetMap Nominatim", fn: nodeGeocode },
    { key: "solar", label: "Fetching solar potential", detail: "Querying NREL PVWatts API for your location", fn: nodeSolar },
    { key: "incentives", label: "Researching incentives", detail: "Looking up federal, state & utility programs", fn: nodeIncentives },
    { key: "products", label: "Matching products", detail: "Claude analyzing home profile → product selection", fn: nodeProducts },
    { key: "proposal", label: "Writing your proposal", detail: "Claude drafting personalized proposal narrative", fn: nodeProposal },
  ];

  for (const step of steps) {
    yield { type: "step", step: step.label, detail: step.detail };
    try {
      await step.fn(state);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      yield { type: "error", message: `Step "${step.label}" failed: ${message}` };
      return;
    }
  }

  yield {
    type: "done",
    proposal: state.proposalMarkdown,
    products: state.products,
    incentives: state.incentives,
  };
}
