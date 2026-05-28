import { NextRequest } from "next/server";
import { runProposalPipeline } from "@/lib/agents/pipeline";
import type { CustomerFormInput, CustomerInput } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

const INTEREST_GOALS: Record<string, string> = {
  solar: "Reduce energy bills",
  battery_storage: "Energy independence / backup power",
  hvac: "Increase home comfort",
  insulation: "Increase home comfort",
  roofing: "Increase home value",
  electrical: "Prepare for EV charging",
};

function resolveCustomer(form: CustomerFormInput): CustomerInput {
  const goals = [...new Set(form.interests.map((i) => INTEREST_GOALS[i]).filter(Boolean))];
  if (goals.length === 0) goals.push("Reduce energy bills");
  return {
    name: `${form.firstName} ${form.lastName}`,
    address: `${form.address}, ${form.city}, ${form.state} ${form.zipCode}`,
    zipCode: form.zipCode,
    state: form.state,
    homeType: "single_family",  // Zillow will correct this
    sqft: 1800,                 // Zillow will correct this
    yearBuilt: 1985,            // Zillow will correct this
    heatingType: "gas",         // Zillow will correct this
    monthlyBill: 180,           // default; no longer collected from form
    budget: "10k_25k",         // income estimate will upgrade this
    goals,
    interests: form.interests,
    roofAge: 10,
    hasAttic: true,
    linkedinUrl: form.linkedinUrl,
    instagramHandle: form.instagramHandle,
  };
}

export async function POST(req: NextRequest) {
  const body: CustomerFormInput = await req.json();
  const customer: CustomerInput = resolveCustomer(body);

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of runProposalPipeline(customer)) {
          const line = `data: ${JSON.stringify(event)}\n\n`;
          controller.enqueue(encoder.encode(line));
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: "error", message: msg })}\n\n`)
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
