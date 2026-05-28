import type { GeoLocation } from "../types";

export async function geocodeAddress(address: string, zipCode: string): Promise<GeoLocation> {
  const query = encodeURIComponent(`${address} ${zipCode} USA`);
  const url = `https://nominatim.openstreetmap.org/search?q=${query}&format=json&addressdetails=1&limit=1`;

  const res = await fetch(url, {
    headers: { "User-Agent": "EcoSave-Proposal-Tool/1.0 (achar.pranav@gmail.com)" },
  });

  if (!res.ok) throw new Error(`Geocoding failed: ${res.status}`);
  const data = await res.json();

  if (!data.length) {
    // Fallback: use zip-based centroid via the Census Geocoder
    return geocodeByZip(zipCode);
  }

  const result = data[0];
  const addr = result.address ?? {};

  return {
    lat: parseFloat(result.lat),
    lng: parseFloat(result.lon),
    city: addr.city ?? addr.town ?? addr.village ?? "",
    state: addr.state ?? "",
    county: addr.county ?? "",
  };
}

async function geocodeByZip(zipCode: string): Promise<GeoLocation> {
  const url = `https://nominatim.openstreetmap.org/search?postalcode=${zipCode}&country=us&format=json&addressdetails=1&limit=1`;
  const res = await fetch(url, {
    headers: { "User-Agent": "EcoSave-Proposal-Tool/1.0 (achar.pranav@gmail.com)" },
  });
  const data = await res.json();
  if (!data.length) throw new Error("Could not geocode address or ZIP code");
  const result = data[0];
  const addr = result.address ?? {};
  return {
    lat: parseFloat(result.lat),
    lng: parseFloat(result.lon),
    city: addr.city ?? addr.town ?? addr.village ?? "",
    state: addr.state ?? "",
    county: addr.county ?? "",
  };
}
