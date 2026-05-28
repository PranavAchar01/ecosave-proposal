import type { SolarData } from "../types";

// NREL PVWatts v8 — https://developer.nrel.gov/docs/solar/pvwatts/v8/
export async function fetchSolarData(
  lat: number,
  lng: number,
  monthlyBill: number
): Promise<SolarData> {
  const apiKey = process.env.NREL_API_KEY ?? "DEMO_KEY";

  // Estimate system size from monthly bill (avg $0.18/kWh US, ~75% offset target)
  const monthlyKwh = monthlyBill / 0.18;
  const annualKwh = monthlyKwh * 12;
  const targetKwh = annualKwh * 0.75;
  // 1kW produces ~1,200-1,800 kWh/year depending on location
  const systemSizeKw = Math.max(4, Math.min(20, Math.round(targetKwh / 1400)));

  const params = new URLSearchParams({
    api_key: apiKey,
    lat: lat.toString(),
    lon: lng.toString(),
    system_capacity: systemSizeKw.toString(),
    azimuth: "180",
    tilt: "20",
    array_type: "1",
    module_type: "1",
    losses: "14",
    timeframe: "monthly",
  });

  const url = `https://developer.nrel.gov/api/pvwatts/v8.json?${params}`;
  const res = await fetch(url);

  if (!res.ok) throw new Error(`NREL API error: ${res.status}`);
  const data = await res.json();

  if (data.errors?.length) throw new Error(data.errors.join(", "));

  const annualKwhAc: number = data.outputs?.ac_annual ?? systemSizeKw * 1400;
  const capacityFactor: number = data.outputs?.capacity_factor ?? 0.17;
  const annualSolarRadiation: number =
    (data.outputs?.solrad_annual as number) ?? 4.5;

  const estimatedOffset = Math.round((annualKwhAc / annualKwh) * 100);

  return {
    annualKwhAc: Math.round(annualKwhAc),
    systemSizeKw,
    capacityFactor: Math.round(capacityFactor * 100) / 100,
    annualSolarRadiation: Math.round(annualSolarRadiation * 10) / 10,
    estimatedOffset: Math.min(100, estimatedOffset),
  };
}
