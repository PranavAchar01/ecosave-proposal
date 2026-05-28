// Apify actor: apimaestro/linkedin-profile-detail (ID: VhxlqQXRwhW8H5hNV)
// 31M+ runs, no cookies required, returns structured profile data

export interface LinkedInExperience {
  title: string;
  company: string;
  location: string;
  duration: string;
  start_date: { year: number; month: string };
  end_date: { year: number; month: string } | null;
  is_current: boolean;
  employment_type: string;
  description: string;
}

export interface LinkedInEducation {
  school: string;
  degree: string;
  degree_name: string;
  field_of_study: string;
  duration: string;
}

export interface LinkedInBasicInfo {
  fullname: string;
  first_name: string;
  last_name: string;
  headline: string;
  about: string;
  location: {
    country: string;
    city: string;
    full: string;
    postal_code: string;
    country_code: string;
  };
  current_company: string;
  current_company_url: string;
  follower_count: number;
  connection_count: number;
  top_skills: string[];
  is_premium: boolean;
  is_top_voice: boolean;
  is_influencer: boolean;
}

export interface LinkedInProfile {
  basic_info: LinkedInBasicInfo;
  experience: LinkedInExperience[];
  education: LinkedInEducation[];
  skills: string[];
  certifications: unknown[];
  languages: unknown[];
}

const ACTOR_ID = "VhxlqQXRwhW8H5hNV"; // apimaestro/linkedin-profile-detail

export async function scrapeLinkedInProfile(profileUrl: string): Promise<LinkedInProfile | null> {
  const token = process.env.APIFY_API_TOKEN;
  if (!token) throw new Error("APIFY_API_TOKEN not set");

  // Normalize URL
  const url = profileUrl.trim().replace(/\/$/, "");
  if (!url.includes("linkedin.com/in/")) {
    throw new Error("Invalid LinkedIn URL — must be a /in/ profile URL");
  }

  // Start run and wait up to 90s for completion
  const runRes = await fetch(
    `https://api.apify.com/v2/acts/${ACTOR_ID}/runs?token=${token}&waitForFinish=90`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profileUrl: url }),
    }
  );

  if (!runRes.ok) {
    const err = await runRes.text();
    throw new Error(`Apify run failed: ${runRes.status} — ${err.slice(0, 200)}`);
  }

  const runData = await runRes.json();
  const run = runData.data;

  if (run.status !== "SUCCEEDED") {
    throw new Error(`Apify run ended with status: ${run.status} — ${run.statusMessage ?? ""}`);
  }

  const datasetId: string = run.defaultDatasetId;

  const itemsRes = await fetch(
    `https://api.apify.com/v2/datasets/${datasetId}/items?token=${token}`,
    { headers: { Accept: "application/json" } }
  );

  if (!itemsRes.ok) throw new Error(`Dataset fetch failed: ${itemsRes.status}`);

  const items: LinkedInProfile[] = await itemsRes.json();
  return items.length > 0 ? items[0] : null;
}

// Calculate total years of professional experience from the experience array
export function calcYearsExperience(experience: LinkedInExperience[]): number {
  if (!experience.length) return 0;

  const earliest = experience
    .filter((e) => e.start_date?.year)
    .map((e) => e.start_date.year)
    .sort((a, b) => a - b)[0];

  if (!earliest) return 0;
  return new Date().getFullYear() - earliest;
}

// Extract seniority level from job title
export function extractSeniority(title: string): string {
  const t = title.toLowerCase();
  if (/\b(ceo|cto|cfo|coo|chief|president|founder|owner|partner)\b/.test(t)) return "executive";
  if (/\b(vp|vice president|svp|evp)\b/.test(t)) return "vp";
  if (/\b(director|head of|managing)\b/.test(t)) return "director";
  if (/\b(manager|lead|principal|architect|staff)\b/.test(t)) return "manager";
  if (/\b(senior|sr\.|sr )\b/.test(t)) return "senior";
  if (/\b(junior|jr\.|jr |associate|entry)\b/.test(t)) return "junior";
  return "mid";
}
