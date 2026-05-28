import Anthropic from "@anthropic-ai/sdk";
import type { LinkedInProfile } from "./linkedin";
import { calcYearsExperience, extractSeniority } from "./linkedin";

export interface IncomeEstimate {
  rangeLow: number;
  rangeHigh: number;
  label: string;
  confidence: "high" | "medium" | "low";
  reasoning: string;
  suggestedBudget: "under_10k" | "10k_25k" | "25k_50k" | "over_50k";
  incomeNotes: string;
}

export async function estimateIncome(
  profile: LinkedInProfile,
  homeLocation: string
): Promise<IncomeEstimate> {
  const info = profile.basic_info;
  const experience = profile.experience ?? [];
  const education = profile.education ?? [];

  const yearsExp = calcYearsExperience(experience);
  const currentRole = experience.find((e) => e.is_current) ?? experience[0];
  const seniority = currentRole ? extractSeniority(currentRole.title) : "mid";

  const prompt = `You are an expert compensation analyst. Based on this LinkedIn profile, estimate the person's total annual household income range.

## Profile Data
- **Name:** ${info.fullname}
- **Headline:** ${info.headline}
- **Current Role:** ${currentRole?.title ?? "Unknown"} at ${currentRole?.company ?? "Unknown"}
- **Location:** ${info.location?.full ?? homeLocation}
- **Years of Experience:** ${yearsExp}
- **Seniority Level (derived):** ${seniority}
- **Education:** ${education.map((e) => `${e.degree_name} ${e.field_of_study} — ${e.school}`).join("; ") || "Not listed"}
- **Top Skills:** ${info.top_skills?.join(", ") || (profile.skills ?? []).slice(0, 8).join(", ")}
- **Is LinkedIn Premium:** ${info.is_premium}
- **Is Top Voice / Influencer:** ${info.is_top_voice || info.is_influencer}
- **Connections:** ${info.connection_count}
- **About Summary:** ${(info.about ?? "").slice(0, 300)}

## Recent Experience
${experience
  .slice(0, 3)
  .map((e) => `- ${e.title} @ ${e.company} (${e.duration}) ${e.employment_type ?? ""}`)
  .join("\n")}

## Task
Return ONLY valid JSON (no markdown fences) with this exact schema:
{
  "rangeLow": <number — annual USD, no commas>,
  "rangeHigh": <number — annual USD, no commas>,
  "label": "<short label like '$80k–$120k' or '$200k–$300k'>",
  "confidence": "<'high'|'medium'|'low'>",
  "reasoning": "<1-2 sentence explanation of key factors>",
  "suggestedBudget": "<'under_10k'|'10k_25k'|'25k_50k'|'over_50k'>",
  "incomeNotes": "<1 sentence caveat about estimate accuracy>"
}

Rules:
- Base estimates on US market rates for the role, company type, and location
- If non-US location, note that and adjust confidence to 'low'
- suggestedBudget: under_10k if income<60k, 10k_25k if 60-120k, 25k_50k if 120-200k, over_50k if 200k+
- This is a rough range for proposal personalization only — never claim it is precise`;

  const msg = await new Anthropic().messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 512,
    messages: [{ role: "user", content: prompt }],
  });

  const raw = msg.content[0].type === "text" ? msg.content[0].text : "{}";

  try {
    const cleaned = raw.replace(/```json|```/g, "").trim();
    return JSON.parse(cleaned) as IncomeEstimate;
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]) as IncomeEstimate;

    // Fallback if Claude response is unparseable
    return {
      rangeLow: 80000,
      rangeHigh: 150000,
      label: "$80k–$150k (estimated)",
      confidence: "low",
      reasoning: "Could not parse income estimate from profile data.",
      suggestedBudget: "10k_25k",
      incomeNotes: "Estimate unavailable — using default range.",
    };
  }
}
