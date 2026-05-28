// Actor: afanasenko/zillow-property-agent-data-scraper (YwkoMBHoFxCLI4gpM)

export interface ZillowProperty {
  streetAddress: string;
  city: string;
  state: string;
  zipcode: string;
  zestimate: number | null;
  lastSoldPrice: number | null;
  lastSoldDate: string | null;
  lastTaxAssessedValue: number | null;
  propertyTax: number | null;
  yearBuilt: number | null;
  livingArea: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  homeType: string | null;
  heating: string | null;
  cooling: string | null;
  roofType: string | null;
  hasBasement: boolean | null;
  hasGarage: boolean | null;
  garageSpaces: number | null;
  flooring: string | null;
  walkScore: number | null;
  transitScore: number | null;
  bikeScore: number | null;
  pricePerSqft: number | null;
  rentZestimate: number | null;
  schools: ZillowSchool[];
  priceHistory: ZillowPriceEvent[];
}

interface ZillowSchool {
  name: string;
  rating: number;
  distance: number;
  type: string;
}

interface ZillowPriceEvent {
  date: string;
  price: number;
  event: string;
}

export interface PropertyIntelligence {
  property: ZillowProperty | null;
  estimatedEquity: number | null;
  homeValueTier: "entry" | "mid" | "premium" | "luxury" | null;
  financingCapacity: "conservative" | "moderate" | "strong" | null;
  specsVerified: Partial<Record<string, boolean>>;
  notes: string[];
}

const ACTOR_ID = "YwkoMBHoFxCLI4gpM"; // afanasenko/zillow-property-agent-data-scraper

export async function scrapeZillowProperty(
  address: string,
  zipCode: string,
  customerSqft: number,
  customerYearBuilt: number
): Promise<PropertyIntelligence> {
  const token = process.env.APIFY_API_TOKEN;
  if (!token) throw new Error("APIFY_API_TOKEN not set");

  const searchQuery = `${address} ${zipCode}`;

  const runRes = await fetch(
    `https://api.apify.com/v2/acts/${ACTOR_ID}/runs?token=${token}&waitForFinish=90`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ search: searchQuery, maxItems: 5 }),
    }
  );

  if (!runRes.ok) throw new Error(`Zillow run failed: ${runRes.status}`);
  const { data: run } = await runRes.json();
  if (run.status !== "SUCCEEDED") throw new Error(`Zillow run status: ${run.status}`);

  const itemsRes = await fetch(
    `https://api.apify.com/v2/datasets/${run.defaultDatasetId}/items?token=${token}`
  );
  const items: ZillowProperty[] = await itemsRes.json();

  // Find the best match by zip code and address similarity
  const match = items.find(
    (p) =>
      String(p.zipcode) === String(zipCode) ||
      p.streetAddress?.toLowerCase().includes(address.split(" ")[1]?.toLowerCase() ?? "")
  ) ?? items[0] ?? null;

  if (!match) return { property: null, estimatedEquity: null, homeValueTier: null, financingCapacity: null, specsVerified: {}, notes: ["No Zillow data found for this address"] };

  // Estimate equity: Zestimate – assumed mortgage (rough: last sold price * 0.7 outstanding if sold >5yrs ago)
  let estimatedEquity: number | null = null;
  if (match.zestimate && match.lastSoldPrice && match.lastSoldDate) {
    const yearsSinceSale = new Date().getFullYear() - new Date(match.lastSoldDate).getFullYear();
    const estimatedMortgageBalance = yearsSinceSale > 5
      ? match.lastSoldPrice * Math.max(0.2, 1 - yearsSinceSale * 0.04)
      : match.lastSoldPrice * 0.75;
    estimatedEquity = Math.max(0, match.zestimate - estimatedMortgageBalance);
  } else if (match.zestimate) {
    estimatedEquity = match.zestimate * 0.35; // rough assumption: 35% equity
  }

  // Home value tier
  const value = match.zestimate ?? match.lastSoldPrice ?? 0;
  const homeValueTier =
    value > 1_500_000 ? "luxury" :
    value > 600_000 ? "premium" :
    value > 300_000 ? "mid" : "entry";

  // Financing capacity based on equity
  const financingCapacity =
    (estimatedEquity ?? 0) > 150_000 ? "strong" :
    (estimatedEquity ?? 0) > 50_000 ? "moderate" : "conservative";

  // Verify what the customer told us matches Zillow
  const specsVerified: Partial<Record<string, boolean>> = {
    sqft: match.livingArea ? Math.abs(match.livingArea - customerSqft) < 300 : false,
    yearBuilt: match.yearBuilt ? Math.abs(match.yearBuilt - customerYearBuilt) <= 5 : false,
  };

  const notes: string[] = [];
  if (match.roofType) notes.push(`Roof type on record: ${match.roofType}`);
  if (match.heating) notes.push(`Heating system: ${match.heating}`);
  if (match.cooling) notes.push(`Cooling: ${match.cooling}`);
  if (match.hasBasement) notes.push("Has basement (insulation opportunity)");
  if (match.propertyTax) notes.push(`Annual property tax: $${match.propertyTax.toLocaleString()}`);

  return { property: match, estimatedEquity, homeValueTier, financingCapacity, specsVerified, notes };
}
