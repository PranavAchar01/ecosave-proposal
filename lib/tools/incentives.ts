import type { Incentive, CustomerInput } from "../types";

// Real federal and state incentive programs — sourced from official documentation.
// Amounts are program limits, NOT guarantees. Actual eligibility determined by
// licensed tax professional and program administrator.

const FEDERAL_INCENTIVES: Incentive[] = [
  {
    name: "Federal Investment Tax Credit (ITC) — Solar & Battery",
    type: "tax_credit",
    scope: "federal",
    amount: "30% of installed cost (no cap)",
    eligibilityNotes:
      "Residential solar and standalone battery storage ≥3 kWh. Credit applies to federal income tax liability. Consult a tax professional. Expires 2032 at 30%, steps down 2033–2034.",
    sourceUrl: "https://www.irs.gov/credits-deductions/residential-clean-energy-credit",
    appliesTo: ["solar_ppa", "battery_storage"],
  },
  {
    name: "Energy Efficient Home Improvement Credit (25C)",
    type: "tax_credit",
    scope: "federal",
    amount: "Up to $1,200/year (30% of cost); heat pumps up to $2,000/year",
    eligibilityNotes:
      "Air sealing/insulation: 30%, max $1,200/yr. Heat pump HVAC: 30%, max $2,000/yr. Must meet energy efficiency requirements. Annual limit resets each tax year.",
    sourceUrl: "https://www.irs.gov/credits-deductions/energy-efficient-home-improvement-credit",
    appliesTo: ["hvac", "insulation"],
  },
];

const MASS_SAVE_INCENTIVES: Incentive[] = [
  {
    name: "Mass Save — Whole Home Air Sealing & Insulation Rebate",
    type: "rebate",
    scope: "utility",
    amount: "75%–100% of project cost (income-qualified may receive 100%)",
    eligibilityNotes:
      "Available to MA residential utility customers of Cape Light Compact, Eversource, National Grid, Unitil. Requires energy assessment. Book at masssave.com.",
    sourceUrl: "https://www.masssave.com/saving/rebates-and-incentives/weatherization",
    appliesTo: ["insulation"],
  },
  {
    name: "Mass Save — Heat Pump Rebate",
    type: "rebate",
    scope: "utility",
    amount: "Up to $10,000 per system (air source); up to $15,000 (ground source)",
    eligibilityNotes:
      "For qualifying cold-climate heat pumps replacing fossil-fuel systems. Rebate amounts vary by system type and capacity. Income-qualified customers may receive additional support.",
    sourceUrl: "https://www.masssave.com/saving/rebates-and-incentives/heating-and-cooling",
    appliesTo: ["hvac"],
  },
  {
    name: "Mass Save — 0% HEAT Loan",
    type: "loan",
    scope: "utility",
    amount: "0% interest, up to $25,000 over 7 years",
    eligibilityNotes:
      "Interest-free financing for qualifying energy efficiency improvements. Available through participating Mass Save lenders. Subject to credit approval.",
    sourceUrl: "https://www.masssave.com/saving/rebates-and-incentives/loans",
    appliesTo: ["hvac", "insulation", "battery_storage"],
  },
];

const NEHPA_INCENTIVES: Incentive[] = [
  {
    name: "NEHPA — Clean Energy Financing",
    type: "loan",
    scope: "utility",
    amount: "Low-interest financing (varies by program cycle)",
    eligibilityNotes:
      "New England Heat Pump Accelerator provides subsidized financing for heat pump adoption across New England states. Verify current availability at nehpa.org.",
    sourceUrl: "https://www.neep.org/initiatives/high-efficiency-products/heat-pumps",
    appliesTo: ["hvac"],
  },
];

const MA_STATE_INCENTIVES: Incentive[] = [
  {
    name: "MA Clean Peak Standard (CPS) — Battery Storage Incentive",
    type: "grant",
    scope: "state",
    amount: "Market-based certificate value (varies quarterly)",
    eligibilityNotes:
      "Battery storage systems qualifying under MA's Clean Peak Standard earn tradeable certificates. Value fluctuates with market. Consult a solar/storage installer for current estimates.",
    sourceUrl: "https://www.mass.gov/info-details/clean-peak-energy-standard",
    appliesTo: ["battery_storage"],
  },
  {
    name: "MA SMART Program — Solar Compensation",
    type: "grant",
    scope: "state",
    amount: "Fixed compensation rate per kWh (rate block varies; check current availability)",
    eligibilityNotes:
      "Solar Massachusetts Renewable Target (SMART) provides long-term compensation for solar generation. Rate depends on utility, system size, and current program block. Subject to capacity limits.",
    sourceUrl: "https://www.mass.gov/solar-massachusetts-renewable-target-smart-program",
    appliesTo: ["solar_ppa"],
  },
];

export function lookupIncentives(customer: CustomerInput): Incentive[] {
  const all: Incentive[] = [...FEDERAL_INCENTIVES];

  const state = customer.state.toUpperCase();
  if (state === "MA" || state === "MASSACHUSETTS") {
    all.push(...MASS_SAVE_INCENTIVES, ...MA_STATE_INCENTIVES, ...NEHPA_INCENTIVES);
  }

  return all;
}
