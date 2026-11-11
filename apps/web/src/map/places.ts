/** Place search through Photon (komoot): free, no key. Debounced and cached by the caller to respect its fair-use policy. */
const ENDPOINT = "https://photon.komoot.io/api/";

export interface Place {
  id: string;
  label: string;
  lon: number;
  lat: number;
  /** `[west, south, east, north]` when the place has an extent. */
  extent: [number, number, number, number] | null;
}

interface PhotonFeature {
  geometry: { coordinates: [number, number] };
  properties: {
    osm_id?: number;
    osm_type?: string;
    name?: string;
    city?: string;
    state?: string;
    country?: string;
    extent?: [number, number, number, number];
  };
}

function labelOf(p: PhotonFeature["properties"]): string {
  const parts = [p.name, p.city && p.city !== p.name ? p.city : undefined, p.state, p.country];
  return [...new Set(parts.filter((x): x is string => Boolean(x)))].join(", ");
}

export async function searchPlaces(query: string, signal: AbortSignal): Promise<Place[]> {
  const url = new URL(ENDPOINT);
  url.searchParams.set("q", query);
  url.searchParams.set("limit", "5");
  url.searchParams.set("lang", "en");
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`Place search failed: HTTP ${response.status}`);
  const body = (await response.json()) as { features?: PhotonFeature[] };
  return (body.features ?? []).flatMap((f, i): Place[] => {
    const label = labelOf(f.properties);
    const [lon, lat] = f.geometry.coordinates;
    if (!label || !Number.isFinite(lon) || !Number.isFinite(lat)) return [];
    const { osm_type: type, osm_id: id } = f.properties;
    return [
      {
        id: `${type ?? "p"}${id ?? i}-${lon}-${lat}`,
        label,
        lon,
        lat,
        extent: f.properties.extent ?? null,
      },
    ];
  });
}
