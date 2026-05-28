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
import { scrapeZillowProperty } from "../tools/zillow";
import { fetchLocalMarketIntel } from "../tools/local-market";
import { fetchCommunitySignals } from "../tools/community-signals";
import { fetchSocialPersonality } from "../tools/social-profile";

function getClient() {
  return new Anthropic();
}

function log(state: ProposalState, step: string, detail: string): StepLogEntry {
  const entry: StepLogEntry = { step, status: "done", detail, timestamp: Date.now() };
  state.stepLog.push(entry);
  state.currentStep = step;
  return entry;
}

async function askClaude(system: string, user: string, maxTokens = 2048): Promise<string> {
  const msg = await getClient().messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: user }],
  });
  const block = msg.content[0];
  return block.type === "text" ? block.text : "";
}

// ─── Node 1: Geocode ──────────────────────────────────────────────────────────
async function nodeGeocode(state: ProposalState): Promise<void> {
  const loc = await geocodeAddress(state.customer.address, state.customer.zipCode);
  state.location = loc;
  if (!state.customer.state && loc.state) state.customer.state = loc.state;
  log(state, "geocode", `${loc.city}, ${loc.state} (${loc.lat.toFixed(4)}, ${loc.lng.toFixed(4)})`);
}

// ─── Node 2: Parallel data enrichment ────────────────────────────────────────
// All 6 external data sources run concurrently after geocode.
async function nodeDataEnrichment(
  state: ProposalState,
  emit: (step: string, detail: string) => void
): Promise<void> {
  const { customer, location } = state;
  const city = location?.city ?? "";
  const stateCode = customer.state;

  emit("Gathering property & market intelligence", "Zillow · Google Maps · Reddit · LinkedIn · Instagram (parallel)");

  const results = await Promise.allSettled([
    // 0 — Solar (NREL PVWatts)
    fetchSolarData(location!.lat, location!.lng, customer.monthlyBill),
    // 1 — LinkedIn + income (if URL provided)
    customer.linkedinUrl?.trim()
      ? scrapeLinkedInProfile(customer.linkedinUrl.trim())
      : Promise.resolve(null),
    // 2 — Zillow property
    scrapeZillowProperty(customer.address, customer.zipCode, customer.sqft, customer.yearBuilt),
    // 3 — Google Maps local market
    fetchLocalMarketIntel(city, stateCode),
    // 4 — Reddit community signals
    fetchCommunitySignals(stateCode),
    // 5 — Instagram (if handle provided)
    customer.instagramHandle?.trim()
      ? fetchSocialPersonality(customer.instagramHandle.trim())
      : Promise.resolve(null),
  ]);

  // ── Solar ──
  if (results[0].status === "fulfilled") {
    state.solarData = results[0].value;
    log(state, "solar", `${state.solarData.systemSizeKw}kW → ${state.solarData.annualKwhAc.toLocaleString()} kWh/yr (~${state.solarData.estimatedOffset}% offset)`);
  } else {
    log(state, "solar", `Solar data unavailable: ${results[0].reason}`);
  }

  // ── LinkedIn / income ──
  if (results[1].status === "fulfilled" && results[1].value) {
    state.linkedinProfile = results[1].value;
    const info = results[1].value.basic_info;
    const currentRole = results[1].value.experience?.find((e) => e.is_current) ?? results[1].value.experience?.[0];
    const locationStr = `${city}, ${stateCode}`;
    try {
      const estimate = await estimateIncome(results[1].value, locationStr);
      state.incomeEstimate = estimate;
      const budgetOrder = ["under_10k", "10k_25k", "25k_50k", "over_50k"] as const;
      const currentIdx = budgetOrder.indexOf(customer.budget);
      const suggestedIdx = budgetOrder.indexOf(estimate.suggestedBudget);
      if (suggestedIdx > currentIdx) state.customer.budget = estimate.suggestedBudget;
      log(state, "linkedin", `${info.fullname} — ${currentRole?.title ?? info.headline} → income: ${estimate.label}`);
    } catch {
      log(state, "linkedin", `${info.fullname} found; income estimation failed`);
    }
  } else if (customer.linkedinUrl?.trim()) {
    log(state, "linkedin", "LinkedIn profile unavailable — proceeding without it");
  }

  // ── Zillow ──
  if (results[2].status === "fulfilled") {
    state.propertyIntel = results[2].value;
    const p = results[2].value.property;
    const zest = p?.zestimate ? `Zestimate $${Math.round(p.zestimate / 1000)}k` : "no Zestimate";
    const eq = results[2].value.estimatedEquity
      ? `, equity ~$${Math.round(results[2].value.estimatedEquity / 1000)}k`
      : "";
    log(state, "zillow", `Property found: ${zest}${eq} | financing: ${results[2].value.financingCapacity}`);
  } else {
    log(state, "zillow", "Property data unavailable");
  }

  // ── Local market ──
  if (results[3].status === "fulfilled") {
    state.localMarket = results[3].value;
    const lm = results[3].value;
    log(state, "local_market", `${lm.solarInstallers.length} solar + ${lm.hvacContractors.length} HVAC contractors nearby | market: ${lm.marketCompetitiveness}`);
  } else {
    log(state, "local_market", "Local market data unavailable");
  }

  // ── Reddit community ──
  if (results[4].status === "fulfilled") {
    state.communitySignals = results[4].value;
    const cs = results[4].value;
    log(state, "community", `${cs.posts.length} community posts | sentiment: ${cs.dominantSentiment} | themes: ${cs.keyThemes.slice(0, 3).join(", ")}`);
  } else {
    log(state, "community", "Community signals unavailable");
  }

  // ── Instagram ──
  if (results[5].status === "fulfilled" && results[5].value) {
    state.socialPersonality = results[5].value;
    const sp = results[5].value;
    log(state, "instagram", `@${sp.profile?.username} | tone: ${sp.toneRecommendation} | eco interest: ${sp.environmentalInterest}`);
  } else if (customer.instagramHandle?.trim()) {
    log(state, "instagram", "Instagram profile unavailable");
  }
}

// ─── Node 3: Incentives ───────────────────────────────────────────────────────
async function nodeIncentives(state: ProposalState): Promise<void> {
  state.incentives = lookupIncentives(state.customer);
  log(state, "incentives", `${state.incentives.length} programs (federal + ${state.customer.state} state/utility)`);
}

// ─── Node 4: Claude product matching ─────────────────────────────────────────
async function nodeProducts(state: ProposalState): Promise<void> {
  const { customer, solarData, location, incomeEstimate, propertyIntel, localMarket, communitySignals, socialPersonality } = state;

  const systemPrompt = `You are an EcoSave senior energy consultant. Select 3-5 products from:
solar_ppa, hvac, insulation, electrical, roofing, battery_storage.

Use ALL provided intelligence — property data, income, local market, community signals, and social personality — to make the most personalized selection possible.

Return ONLY valid JSON array. No prose, no markdown fences.

Schema:
{
  "category": "solar_ppa"|"hvac"|"insulation"|"electrical"|"roofing"|"battery_storage",
  "productName": string,
  "rationale": string (2-3 sentences, specific to this customer's data),
  "priority": "high"|"medium"|"low",
  "estimatedTimeline": string,
  "compatibleIncentives": string[]
}

COMPLIANCE: Never state specific savings amounts. Reference program names only.`;

  const sections: string[] = [];

  sections.push(`## Customer
- Home: ${customer.sqft} sqft ${customer.homeType}, built ${customer.yearBuilt}
- Location: ${location?.city}, ${location?.state}
- Heating: ${customer.heatingType} | Bill: $${customer.monthlyBill}/mo
- Budget: ${customer.budget} | Goals: ${customer.goals.join(", ")}
- Roof: ${customer.roofAge} yrs old | Attic: ${customer.hasAttic}`);

  if (solarData) {
    sections.push(`## Solar (NREL PVWatts — real data)
- ${solarData.systemSizeKw}kW → ${solarData.annualKwhAc.toLocaleString()} kWh/yr
- Solar resource: ${solarData.annualSolarRadiation} kWh/m²/day
- ~${solarData.estimatedOffset}% bill offset`);
  }

  if (propertyIntel?.property) {
    const p = propertyIntel.property;
    sections.push(`## Property Intelligence (Zillow)
- Zestimate: ${p.zestimate ? `$${Math.round(p.zestimate / 1000)}k` : "unavailable"}
- Estimated equity: ${propertyIntel.estimatedEquity ? `$${Math.round(propertyIntel.estimatedEquity / 1000)}k` : "unknown"}
- Financing capacity: ${propertyIntel.financingCapacity}
- Home value tier: ${propertyIntel.homeValueTier}
- Roof type (Zillow): ${p.roofType ?? "unknown"}
- Heating (Zillow): ${p.heating ?? "unknown"}
- Cooling (Zillow): ${p.cooling ?? "unknown"}
- Has basement: ${p.hasBasement}
- Notes: ${propertyIntel.notes.join("; ")}`);
  }

  if (incomeEstimate) {
    sections.push(`## Income Estimate (LinkedIn)
- Range: ${incomeEstimate.label} (${incomeEstimate.confidence} confidence)
- Reasoning: ${incomeEstimate.reasoning}`);
  }

  if (localMarket) {
    sections.push(`## Local Market (Google Maps)
- Solar installers nearby: ${localMarket.solarInstallers.map((c) => `${c.name} (${c.rating}★, ${c.reviewCount} reviews)`).join(", ")}
- Market competitiveness: ${localMarket.marketCompetitiveness}
- Notes: ${localMarket.notes.join("; ")}`);
  }

  if (communitySignals && communitySignals.posts.length > 0) {
    sections.push(`## Community Signals (Reddit)
- Sentiment: ${communitySignals.dominantSentiment}
- Key themes: ${communitySignals.keyThemes.join(", ")}
- Mass Save context: ${communitySignals.massSaveContext ?? "N/A"}
- Top community post: "${communitySignals.posts[0]?.title ?? "N/A"}"`);
  }

  if (socialPersonality?.profile) {
    sections.push(`## Social Personality (Instagram)
- Tone recommendation: ${socialPersonality.toneRecommendation}
- Environmental interest: ${socialPersonality.environmentalInterest}
- Home improvement interest: ${socialPersonality.homeImprovementInterest}
- Lifestyle tier: ${socialPersonality.lifestyleTier}
- Signals: ${socialPersonality.interestSignals.join("; ")}`);
  }

  sections.push(`## Available Incentives
${state.incentives.map((i) => `- ${i.name}: ${i.amount} → applies to: ${i.appliesTo.join(", ")}`).join("\n")}`);

  const raw = await askClaude(systemPrompt, sections.join("\n\n"));

  let products: ProductRecommendation[] = [];
  try {
    products = JSON.parse(raw.replace(/```json|```/g, "").trim());
  } catch {
    const match = raw.match(/\[[\s\S]*\]/);
    if (match) products = JSON.parse(match[0]);
  }

  state.products = products;
  log(state, "products", `${products.length} products: ${products.map((p) => p.category).join(", ")}`);
}

// ─── Node 5: Claude proposal narrative ───────────────────────────────────────
async function nodeProposal(state: ProposalState): Promise<void> {
  const { customer, solarData, location, incomeEstimate, propertyIntel, localMarket, communitySignals, socialPersonality } = state;

  // Determine tone from social signals
  const tone = socialPersonality?.toneRecommendation ?? "savings-focused";
  const toneInstruction =
    tone === "environmental" ? "Lead with sustainability and climate impact. This customer cares deeply about the environment." :
    tone === "aspirational" ? "Lead with home value, prestige, and premium craftsmanship. This customer appreciates quality and exclusivity." :
    tone === "technical" ? "Lead with specs, efficiency ratings, and system performance data. This customer wants the details." :
    "Lead with financial returns and bill savings. Keep it practical and ROI-focused.";

  const systemPrompt = `You are a senior EcoSave proposal writer crafting a hyper-personalized home energy proposal.

Tone instruction: ${toneInstruction}

Write in Markdown (~650 words). Sections:
1. Executive Summary (4 sentences, use the customer's name, reference specific data points from their profile)
2. Your Home's Energy Profile (reference Zillow data, solar resource, heating system)
3. Recommended Solutions (one subsection per product, with personalized rationale)
4. Incentives & Financing (reference programs by name; if strong equity/income signals, mention home equity financing as an option; NEVER state specific dollar amounts or eligibility conclusions)
5. What Your Neighbors Are Saying (reference community signals — real Reddit themes, not fake quotes)
6. Local Market Context (briefly reference local contractor landscape)
7. Implementation Sequence
8. Why EcoSave

COMPLIANCE: Never state specific savings amounts, tax credit values, or eligibility conclusions.
Use: "may qualify for," "based on published program parameters," "consult a tax professional."`;

  const sections: string[] = [
    `**Customer:** ${customer.name}`,
    `**Address:** ${customer.address}, ${customer.zipCode} | **Location:** ${location?.city}, ${location?.state}`,
    `**Home:** ${customer.sqft} sqft ${customer.homeType}, built ${customer.yearBuilt} | **Heating:** ${customer.heatingType} | **Bill:** $${customer.monthlyBill}/mo`,
    `**Budget:** ${customer.budget} | **Goals:** ${customer.goals.join(", ")}`,
  ];

  if (solarData) sections.push(`**Solar (NREL):** ${solarData.systemSizeKw}kW → ${solarData.annualKwhAc.toLocaleString()} kWh/yr, ${solarData.annualSolarRadiation} kWh/m²/day, ~${solarData.estimatedOffset}% offset`);

  if (propertyIntel?.property) {
    const p = propertyIntel.property;
    sections.push(`**Zillow Property Data:** Zestimate ${p.zestimate ? `$${Math.round(p.zestimate / 1000)}k` : "N/A"}, equity ~${propertyIntel.estimatedEquity ? `$${Math.round(propertyIntel.estimatedEquity / 1000)}k` : "unknown"}, financing capacity: ${propertyIntel.financingCapacity}, home tier: ${propertyIntel.homeValueTier}`);
    sections.push(`**Property Notes:** ${propertyIntel.notes.join(" | ")}`);
  }

  if (incomeEstimate) sections.push(`**Income Estimate (LinkedIn):** ${incomeEstimate.label} (${incomeEstimate.confidence}) — ${incomeEstimate.reasoning}`);

  sections.push(`**Products Recommended:**\n${state.products.map((p) => `- [${p.priority.toUpperCase()}] ${p.productName}: ${p.rationale}`).join("\n")}`);

  sections.push(`**Incentives:**\n${state.incentives.map((i) => `- ${i.name} (${i.scope}): ${i.amount}`).join("\n")}`);

  if (communitySignals && communitySignals.posts.length > 0) {
    sections.push(`**Community Signals:**
- Sentiment: ${communitySignals.dominantSentiment}
- Key themes homeowners discuss: ${communitySignals.keyThemes.join(", ")}
- Mass Save context: ${communitySignals.massSaveContext ?? "N/A"}
- Top post topics: ${communitySignals.posts.slice(0, 3).map((p) => `"${p.title}"`).join("; ")}`);
  }

  if (localMarket) {
    sections.push(`**Local Market:**
- ${localMarket.solarInstallers.length} solar installers in area (market: ${localMarket.marketCompetitiveness})
- Top-rated local: ${localMarket.topRatedLocal ? `${localMarket.topRatedLocal.name} (${localMarket.topRatedLocal.rating}★, ${localMarket.topRatedLocal.reviewCount} reviews)` : "N/A"}`);
  }

  if (socialPersonality?.interestSignals.length) {
    sections.push(`**Customer Personality:** ${socialPersonality.interestSignals.join(" | ")}`);
  }

  state.proposalMarkdown = await askClaude(systemPrompt, sections.join("\n"), 2500);
  log(state, "proposal", "Hyper-personalized proposal generated");
}

// ─── Main pipeline ────────────────────────────────────────────────────────────
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
    propertyIntel: null,
    localMarket: null,
    communitySignals: null,
    socialPersonality: null,
    currentStep: "start",
    stepLog: [],
    error: null,
  };

  const emitStep = (step: string, detail: string) => {
    // captured by the outer generator via the queue below
    stepQueue.push({ type: "step", step, detail });
  };

  // Simple queue so nested async calls can emit steps
  const stepQueue: StreamEvent[] = [];

  // Step 1: Geocode (fast, needed for everything else)
  yield { type: "step", step: "Locating your property", detail: "OpenStreetMap Nominatim geocoding" };
  try {
    await nodeGeocode(state);
  } catch (err) {
    yield { type: "error", message: `Geocoding failed: ${err instanceof Error ? err.message : err}` };
    return;
  }

  // Step 2: Parallel data enrichment
  yield { type: "step", step: "Gathering property & market intelligence", detail: "Zillow · NREL · Google Maps · Reddit · LinkedIn · Instagram running in parallel…" };
  try {
    await nodeDataEnrichment(state, emitStep);
    // Flush any queued sub-steps
    for (const ev of stepQueue) yield ev;
    stepQueue.length = 0;
  } catch (err) {
    yield { type: "step", step: "Enrichment partial", detail: `Some data sources unavailable: ${err instanceof Error ? err.message : err}` };
  }

  // Step 3: Incentives (synchronous lookup)
  yield { type: "step", step: "Researching incentive programs", detail: "Federal IRA (25C/25D/ITC) + state & utility programs" };
  await nodeIncentives(state);

  // Step 4: Product matching
  yield { type: "step", step: "Matching products to your profile", detail: "Claude Sonnet analyzing all intelligence signals → product selection" };
  try {
    await nodeProducts(state);
  } catch (err) {
    yield { type: "error", message: `Product matching failed: ${err instanceof Error ? err.message : err}` };
    return;
  }

  // Step 5: Proposal generation
  yield { type: "step", step: "Writing your hyper-personalized proposal", detail: "Claude Sonnet drafting proposal with all 6 data sources" };
  try {
    await nodeProposal(state);
  } catch (err) {
    yield { type: "error", message: `Proposal generation failed: ${err instanceof Error ? err.message : err}` };
    return;
  }

  yield {
    type: "done",
    proposal: state.proposalMarkdown,
    products: state.products,
    incentives: state.incentives,
    incomeEstimate: state.incomeEstimate,
    propertyIntel: state.propertyIntel,
    localMarket: state.localMarket,
    communitySignals: state.communitySignals,
  };
}
