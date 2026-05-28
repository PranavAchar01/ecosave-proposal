// Actor: apify/instagram-profile-scraper (dSCLg0C3YEZ83HzYX) — 83M+ runs

export interface InstagramProfile {
  username: string;
  fullName: string;
  biography: string;
  followersCount: number;
  followsCount: number;
  postsCount: number;
  isBusinessAccount: boolean;
  businessCategoryName: string | null;
  externalUrl: string | null;
  verified: boolean;
  recentHashtags: string[];
  recentCaptions: string[];
}

export interface SocialPersonality {
  profile: InstagramProfile | null;
  environmentalInterest: "high" | "medium" | "low" | "unknown";
  homeImprovementInterest: "high" | "medium" | "low" | "unknown";
  lifestyleTier: "luxury" | "premium" | "mainstream" | "unknown";
  toneRecommendation: "technical" | "aspirational" | "savings-focused" | "environmental";
  interestSignals: string[];
  notes: string[];
}

const ACTOR_ID = "dSCLg0C3YEZ83HzYX"; // apify/instagram-profile-scraper

export async function fetchSocialPersonality(
  instagramHandle: string
): Promise<SocialPersonality> {
  const token = process.env.APIFY_API_TOKEN;
  if (!token) throw new Error("APIFY_API_TOKEN not set");

  const handle = instagramHandle.replace(/^@/, "").replace(/^https?:\/\/(www\.)?instagram\.com\//, "").replace(/\/$/, "");

  const runRes = await fetch(
    `https://api.apify.com/v2/acts/${ACTOR_ID}/runs?token=${token}&waitForFinish=60`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ usernames: [handle] }),
    }
  );

  if (!runRes.ok) throw new Error(`Instagram run failed: ${runRes.status}`);
  const { data: run } = await runRes.json();

  const empty: SocialPersonality = {
    profile: null,
    environmentalInterest: "unknown",
    homeImprovementInterest: "unknown",
    lifestyleTier: "unknown",
    toneRecommendation: "savings-focused",
    interestSignals: [],
    notes: ["Instagram profile not found or private"],
  };

  if (run.status !== "SUCCEEDED") return empty;

  const itemsRes = await fetch(
    `https://api.apify.com/v2/datasets/${run.defaultDatasetId}/items?token=${token}`
  );
  const items = await itemsRes.json();
  if (!items.length) return empty;

  const raw = items[0] as Record<string, unknown>;
  const posts = (raw.latestPosts as Record<string, unknown>[] | undefined) ?? [];

  const allCaptions = posts
    .map((p) => String(p.caption ?? "").toLowerCase())
    .join(" ");

  const allHashtags = posts
    .flatMap((p) => (p.hashtags as string[] | undefined) ?? [])
    .map((h) => h.toLowerCase());

  const bio = String(raw.biography ?? "").toLowerCase();
  const allText = `${bio} ${allCaptions} ${allHashtags.join(" ")}`;

  const profile: InstagramProfile = {
    username: String(raw.username ?? handle),
    fullName: String(raw.fullName ?? ""),
    biography: String(raw.biography ?? ""),
    followersCount: Number(raw.followersCount ?? 0),
    followsCount: Number(raw.followsCount ?? 0),
    postsCount: Number(raw.postsCount ?? 0),
    isBusinessAccount: Boolean(raw.isBusinessAccount),
    businessCategoryName: raw.businessCategoryName ? String(raw.businessCategoryName) : null,
    externalUrl: raw.externalUrl ? String(raw.externalUrl) : null,
    verified: Boolean(raw.verified),
    recentHashtags: allHashtags.slice(0, 20),
    recentCaptions: posts.slice(0, 3).map((p) => String(p.caption ?? "").slice(0, 120)),
  };

  // Environmental interest signals
  const ecoKeywords = ["sustainability", "sustainable", "eco", "green", "climate", "solar", "renewable", "nature", "environment", "carbon", "zero waste", "organic", "planet"];
  const ecoScore = ecoKeywords.filter((k) => allText.includes(k)).length;
  const environmentalInterest: SocialPersonality["environmentalInterest"] =
    ecoScore >= 3 ? "high" : ecoScore >= 1 ? "medium" : "low";

  // Home improvement signals
  const homeKeywords = ["home", "house", "renovation", "remodel", "interior", "diy", "garden", "backyard", "homeowner", "property", "real estate"];
  const homeScore = homeKeywords.filter((k) => allText.includes(k)).length;
  const homeImprovementInterest: SocialPersonality["homeImprovementInterest"] =
    homeScore >= 3 ? "high" : homeScore >= 1 ? "medium" : "low";

  // Lifestyle tier from follower count + content signals
  const luxuryKeywords = ["luxury", "premium", "exclusive", "yacht", "private", "bespoke", "mansion", "villa"];
  const isLuxury = luxuryKeywords.some((k) => allText.includes(k)) || profile.followersCount > 100_000;
  const isPremium = profile.followersCount > 10_000 || profile.verified;
  const lifestyleTier: SocialPersonality["lifestyleTier"] =
    isLuxury ? "luxury" : isPremium ? "premium" : "mainstream";

  // Tone recommendation
  const toneRecommendation: SocialPersonality["toneRecommendation"] =
    environmentalInterest === "high" ? "environmental" :
    lifestyleTier === "luxury" ? "aspirational" :
    homeImprovementInterest === "high" ? "technical" : "savings-focused";

  // Interest signals summary
  const interestSignals: string[] = [];
  if (environmentalInterest === "high") interestSignals.push("Strong sustainability/eco values");
  if (environmentalInterest === "medium") interestSignals.push("Some environmental interest");
  if (homeImprovementInterest === "high") interestSignals.push("Active home improvement interest");
  if (allHashtags.some((h) => h.includes("solar"))) interestSignals.push("Already following solar content");
  if (allHashtags.some((h) => h.includes("tesla") || h.includes("ev"))) interestSignals.push("EV/tech interest");
  if (lifestyleTier === "luxury") interestSignals.push("Luxury lifestyle — lead with premium product line");
  if (lifestyleTier === "premium") interestSignals.push("Premium buyer — emphasize quality and long-term value");

  const notes: string[] = [
    `@${profile.username} — ${profile.followersCount.toLocaleString()} followers`,
    `Tone recommendation: ${toneRecommendation}`,
  ];

  return {
    profile,
    environmentalInterest,
    homeImprovementInterest,
    lifestyleTier,
    toneRecommendation,
    interestSignals,
    notes,
  };
}
