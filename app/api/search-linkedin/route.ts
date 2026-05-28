import { NextRequest, NextResponse } from "next/server";
import type { LinkedInCandidate } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 30;

const APIFY_TOKEN = process.env.APIFY_API_TOKEN ?? "";
// apify/google-search-scraper — finds LinkedIn profiles via Google
const ACTOR_ID = "nFJndFXA5zjCTuudP";

interface GoogleOrganicResult {
  url?: string;
  title?: string;
  description?: string;
}

interface GoogleSearchItem {
  organicResults?: GoogleOrganicResult[];
}

function extractName(title: string): string {
  // "John Smith - Senior Engineer at Google | LinkedIn" → "John Smith"
  const beforeDash = title.split(" - ")[0];
  const beforePipe = beforeDash.split(" | ")[0];
  return beforePipe.trim();
}

function extractHeadline(title: string): string {
  // "John Smith - Senior Engineer at Google | LinkedIn" → "Senior Engineer at Google"
  const afterDash = title.split(" - ")[1] ?? "";
  const beforePipe = afterDash.split(" | ")[0];
  return beforePipe.trim();
}

export async function POST(req: NextRequest) {
  const { firstName, lastName, city, state } = await req.json();

  if (!firstName || !lastName) {
    return NextResponse.json({ candidates: [] });
  }

  if (!APIFY_TOKEN) {
    return NextResponse.json({ candidates: [] });
  }

  const query = `site:linkedin.com/in "${firstName} ${lastName}" "${city}" ${state}`;

  try {
    const runRes = await fetch(
      `https://api.apify.com/v2/acts/${ACTOR_ID}/run-sync-get-dataset-items?token=${APIFY_TOKEN}&timeout=20`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          queries: query,
          resultsPerPage: 5,
          maxPagesPerQuery: 1,
          languageCode: "en",
          countryCode: "us",
        }),
      }
    );

    if (!runRes.ok) {
      return NextResponse.json({ candidates: [] });
    }

    const items: GoogleSearchItem[] = await runRes.json();
    const organicResults: GoogleOrganicResult[] = items[0]?.organicResults ?? [];

    const candidates: LinkedInCandidate[] = organicResults
      .filter((r) => r.url?.includes("linkedin.com/in/"))
      .slice(0, 3)
      .map((r) => ({
        url: r.url!,
        name: extractName(r.title ?? ""),
        headline: extractHeadline(r.title ?? ""),
        snippet: r.description ?? "",
      }));

    return NextResponse.json({ candidates });
  } catch {
    return NextResponse.json({ candidates: [] });
  }
}
