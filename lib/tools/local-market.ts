// Actor: compass/crawler-google-places (nwua9Gu5YrADL7ZDj) — 25M+ runs

export interface LocalContractor {
  name: string;
  category: string;
  rating: number | null;
  reviewCount: number | null;
  address: string | null;
  phone: string | null;
  website: string | null;
}

export interface LocalMarketIntel {
  solarInstallers: LocalContractor[];
  hvacContractors: LocalContractor[];
  insulationContractors: LocalContractor[];
  marketCompetitiveness: "low" | "medium" | "high";
  topRatedLocal: LocalContractor | null;
  notes: string[];
}

const ACTOR_ID = "nwua9Gu5YrADL7ZDj"; // compass/crawler-google-places

async function searchGoogleMaps(
  query: string,
  token: string,
  maxResults = 4
): Promise<LocalContractor[]> {
  const runRes = await fetch(
    `https://api.apify.com/v2/acts/${ACTOR_ID}/runs?token=${token}&waitForFinish=90`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        searchStringsArray: [query],
        maxCrawledPlacesPerSearch: maxResults,
        language: "en",
        countryCode: "us",
      }),
    }
  );

  if (!runRes.ok) throw new Error(`Google Maps run failed: ${runRes.status}`);
  const { data: run } = await runRes.json();
  if (run.status !== "SUCCEEDED") return [];

  const itemsRes = await fetch(
    `https://api.apify.com/v2/datasets/${run.defaultDatasetId}/items?token=${token}`
  );
  const items = await itemsRes.json();

  return (items as Record<string, unknown>[]).map((p) => ({
    name: String(p.title ?? ""),
    category: String(p.categoryName ?? ""),
    rating: typeof p.totalScore === "number" ? p.totalScore : null,
    reviewCount: typeof p.reviewsCount === "number" ? p.reviewsCount : null,
    address: String(p.address ?? ""),
    phone: p.phone ? String(p.phone) : null,
    website: p.website ? String(p.website) : null,
  }));
}

export async function fetchLocalMarketIntel(
  city: string,
  state: string
): Promise<LocalMarketIntel> {
  const token = process.env.APIFY_API_TOKEN;
  if (!token) throw new Error("APIFY_API_TOKEN not set");

  const location = `${city} ${state}`;

  // Run all three searches in parallel
  const [solar, hvac, insulation] = await Promise.all([
    searchGoogleMaps(`solar panel installer near ${location}`, token, 4),
    searchGoogleMaps(`heat pump HVAC contractor near ${location}`, token, 4),
    searchGoogleMaps(`home insulation contractor near ${location}`, token, 3),
  ]);

  const allContractors = [...solar, ...hvac, ...insulation];
  const totalCount = allContractors.length;

  const marketCompetitiveness: LocalMarketIntel["marketCompetitiveness"] =
    totalCount >= 9 ? "high" : totalCount >= 5 ? "medium" : "low";

  const topRatedLocal =
    allContractors
      .filter((c) => (c.rating ?? 0) >= 4.5 && (c.reviewCount ?? 0) > 20)
      .sort((a, b) => (b.reviewCount ?? 0) - (a.reviewCount ?? 0))[0] ?? null;

  const notes: string[] = [];
  if (solar.length > 0)
    notes.push(`${solar.length} solar installers found near ${city}`);
  if (hvac.length > 0)
    notes.push(`${hvac.length} HVAC/heat pump contractors nearby`);
  if (marketCompetitiveness === "high")
    notes.push("Competitive local market — multiple installers driving competitive pricing");
  else if (marketCompetitiveness === "low")
    notes.push("Limited local competition — EcoSave's regional expertise is a key differentiator");

  return {
    solarInstallers: solar,
    hvacContractors: hvac,
    insulationContractors: insulation,
    marketCompetitiveness,
    topRatedLocal,
    notes,
  };
}
