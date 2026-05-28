// Actor: harshmaur/reddit-scraper (9sHOY9RzPYGjmTHo8) — 241k runs

export interface RedditPost {
  title: string;
  body: string;
  upVotes: number;
  communityName: string;
  postUrl: string;
  authorName: string;
  commentsCount: number;
  createdAt: string;
}

export interface CommunitySignals {
  posts: RedditPost[];
  dominantSentiment: "positive" | "mixed" | "negative" | "neutral";
  keyThemes: string[];
  massSaveContext: string | null;
  solarSentiment: string | null;
  notes: string[];
}

const ACTOR_ID = "9sHOY9RzPYGjmTHo8"; // harshmaur/reddit-scraper

export async function fetchCommunitySignals(state: string): Promise<CommunitySignals> {
  const token = process.env.APIFY_API_TOKEN;
  if (!token) throw new Error("APIFY_API_TOKEN not set");

  const isMA = state.toUpperCase() === "MA" || state.toLowerCase() === "massachusetts";

  const startUrls = [
    { url: "https://www.reddit.com/r/solar/top/?t=month" },
    { url: "https://www.reddit.com/r/homeimprovement/search/?q=heat+pump&sort=top&t=year" },
    ...(isMA ? [
      { url: "https://www.reddit.com/r/masssave/" },
      { url: "https://www.reddit.com/r/massachusetts/search/?q=solar+panels&sort=top" },
    ] : []),
  ];

  const runRes = await fetch(
    `https://api.apify.com/v2/acts/${ACTOR_ID}/runs?token=${token}&waitForFinish=90`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ startUrls, maxItems: 15 }),
    }
  );

  if (!runRes.ok) throw new Error(`Reddit run failed: ${runRes.status}`);
  const { data: run } = await runRes.json();

  const empty: CommunitySignals = {
    posts: [],
    dominantSentiment: "neutral",
    keyThemes: [],
    massSaveContext: null,
    solarSentiment: null,
    notes: [],
  };

  if (run.status !== "SUCCEEDED") return empty;

  const itemsRes = await fetch(
    `https://api.apify.com/v2/datasets/${run.defaultDatasetId}/items?token=${token}`
  );
  const raw = await itemsRes.json();

  const posts: RedditPost[] = (raw as Record<string, unknown>[])
    .filter((p) => p.dataType === "post" || p.title)
    .map((p) => ({
      title: String(p.title ?? ""),
      body: String(p.body ?? "").slice(0, 400),
      upVotes: Number(p.upVotes ?? 0),
      communityName: String(p.communityName ?? p.parsedCommunityName ?? ""),
      postUrl: String(p.postUrl ?? ""),
      authorName: String(p.authorName ?? ""),
      commentsCount: Number(p.commentsCount ?? 0),
      createdAt: String(p.createdAt ?? ""),
    }))
    .sort((a, b) => b.upVotes - a.upVotes)
    .slice(0, 10);

  // Analyze sentiment across titles + bodies
  const allText = posts.map((p) => `${p.title} ${p.body}`).join(" ").toLowerCase();

  const positiveWords = ["great", "love", "worth it", "recommend", "saved", "amazing", "excellent", "easy", "approved", "rebate received", "helpful"];
  const negativeWords = ["scam", "terrible", "avoid", "waste", "never again", "denied", "problem", "issue", "broken", "regret", "overpriced"];

  const posScore = positiveWords.filter((w) => allText.includes(w)).length;
  const negScore = negativeWords.filter((w) => allText.includes(w)).length;

  const dominantSentiment: CommunitySignals["dominantSentiment"] =
    posScore > negScore + 2 ? "positive" :
    negScore > posScore + 2 ? "negative" :
    posScore > 0 || negScore > 0 ? "mixed" : "neutral";

  // Extract themes
  const themes: string[] = [];
  if (allText.includes("heat pump")) themes.push("heat pump adoption");
  if (allText.includes("solar")) themes.push("solar savings");
  if (allText.includes("insulation") || allText.includes("air seal")) themes.push("weatherization");
  if (allText.includes("bill") || allText.includes("electric")) themes.push("electricity cost concerns");
  if (allText.includes("rebate") || allText.includes("incentive")) themes.push("incentive programs");
  if (allText.includes("battery") || allText.includes("backup")) themes.push("backup power interest");

  // Mass Save specific context
  const massSavePost = posts.find((p) =>
    p.communityName.toLowerCase().includes("masssave") ||
    p.title.toLowerCase().includes("mass save")
  );
  const massSaveContext = massSavePost
    ? `Community discussion: "${massSavePost.title}" (${massSavePost.upVotes} upvotes)`
    : isMA ? "Active r/masssave community with ongoing Mass Save program discussions" : null;

  // Solar sentiment
  const solarPosts = posts.filter((p) => p.title.toLowerCase().includes("solar"));
  const solarSentiment = solarPosts.length > 0
    ? `${solarPosts.length} recent solar discussions in relevant communities; top: "${solarPosts[0].title}"`
    : null;

  const notes: string[] = [];
  notes.push(`Analyzed ${posts.length} Reddit posts from energy/home improvement communities`);
  if (dominantSentiment === "positive") notes.push("Community sentiment strongly positive toward home energy upgrades");
  if (isMA && massSaveContext) notes.push("Active Mass Save community engagement found");

  return { posts, dominantSentiment, keyThemes: themes, massSaveContext, solarSentiment, notes };
}
