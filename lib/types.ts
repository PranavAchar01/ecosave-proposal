import type { LinkedInProfile } from "./tools/linkedin";
import type { IncomeEstimate } from "./tools/income-estimator";
import type { PropertyIntelligence } from "./tools/zillow";
import type { LocalMarketIntel } from "./tools/local-market";
import type { CommunitySignals } from "./tools/community-signals";
import type { SocialPersonality } from "./tools/social-profile";

export type {
  LinkedInProfile,
  IncomeEstimate,
  PropertyIntelligence,
  LocalMarketIntel,
  CommunitySignals,
  SocialPersonality,
};

// What the simplified form sends — just the essentials
export interface CustomerFormInput {
  firstName: string;
  lastName: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  interests: string[]; // ["solar","hvac","insulation","roofing","battery_storage","electrical"]
  linkedinUrl?: string;
  instagramHandle?: string;
}

// Resolved full customer used internally by the pipeline (with defaults filled in)
export interface CustomerInput {
  name: string;
  address: string;
  zipCode: string;
  state: string;
  homeType: "single_family" | "condo" | "townhouse" | "multi_family";
  sqft: number;
  yearBuilt: number;
  heatingType: "gas" | "oil" | "electric" | "propane";
  monthlyBill: number;
  budget: "under_10k" | "10k_25k" | "25k_50k" | "over_50k";
  goals: string[];
  interests: string[];
  roofAge: number;
  hasAttic: boolean;
  linkedinUrl?: string;
  instagramHandle?: string;
}

// A single LinkedIn profile candidate returned by the search step
export interface LinkedInCandidate {
  url: string;
  name: string;
  headline: string;
  snippet: string;
}

export interface GeoLocation {
  lat: number;
  lng: number;
  city: string;
  state: string;
  county: string;
}

export interface SolarData {
  annualKwhAc: number;
  systemSizeKw: number;
  capacityFactor: number;
  annualSolarRadiation: number;
  estimatedOffset: number;
}

export interface Incentive {
  name: string;
  type: "tax_credit" | "rebate" | "loan" | "grant";
  scope: "federal" | "state" | "utility";
  amount: string;
  eligibilityNotes: string;
  sourceUrl: string;
  appliesTo: string[];
}

export interface ProductRecommendation {
  category:
    | "solar_ppa"
    | "hvac"
    | "insulation"
    | "electrical"
    | "roofing"
    | "battery_storage";
  productName: string;
  rationale: string;
  priority: "high" | "medium" | "low";
  estimatedTimeline: string;
  compatibleIncentives: string[];
}

export interface ProposalState {
  customer: CustomerInput;
  location: GeoLocation | null;
  solarData: SolarData | null;
  incentives: Incentive[];
  products: ProductRecommendation[];
  proposalMarkdown: string;
  linkedinProfile: LinkedInProfile | null;
  incomeEstimate: IncomeEstimate | null;
  propertyIntel: PropertyIntelligence | null;
  localMarket: LocalMarketIntel | null;
  communitySignals: CommunitySignals | null;
  socialPersonality: SocialPersonality | null;
  currentStep: string;
  stepLog: StepLogEntry[];
  error: string | null;
}

export interface StepLogEntry {
  step: string;
  status: "running" | "done" | "error";
  detail: string;
  timestamp: number;
}

export type StreamEvent =
  | { type: "step"; step: string; detail: string }
  | {
      type: "done";
      proposal: string;
      products: ProductRecommendation[];
      incentives: Incentive[];
      incomeEstimate: IncomeEstimate | null;
      propertyIntel: PropertyIntelligence | null;
      localMarket: LocalMarketIntel | null;
      communitySignals: CommunitySignals | null;
    }
  | { type: "error"; message: string };
