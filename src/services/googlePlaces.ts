/**
 * Google Places API Service — Competitor Discovery
 * Used by Competitor Watch (Phase 6) and SMS COMPETITOR commands.
 * All methods fail gracefully — never throw to caller.
 */

const PLACES_API_BASE = 'https://maps.googleapis.com/maps/api/place';
const SCAN_RADIUS_M = 8046; // 5 miles
const MIN_REVIEWS = 50;
const MAX_RESULTS = 10;

function getApiKey(): string {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) throw new Error('GOOGLE_PLACES_API_KEY not set');
  return key;
}

export interface PlaceResult {
  place_id: string;
  name: string;
  rating: number | null;
  user_ratings_total: number | null;
  lat: number;
  lng: number;
  types: string[];
}

/**
 * Nearby Search — finds restaurants within 5 miles of a location.
 * Excludes the restaurant itself (by place_id) and businesses with <50 reviews.
 */
export async function nearbySearch(
  lat: number,
  lng: number,
  excludePlaceId?: string
): Promise<PlaceResult[]> {
  const key = getApiKey();
  const url = new URL(`${PLACES_API_BASE}/nearbysearch/json`);
  url.searchParams.set('location', `${lat},${lng}`);
  url.searchParams.set('radius', SCAN_RADIUS_M.toString());
  url.searchParams.set('type', 'restaurant');
  url.searchParams.set('key', key);

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Places API error: ${res.status}`);
  const data = await res.json() as any;

  const results: PlaceResult[] = (data.results || [])
    .filter((p: any) =>
      p.place_id !== excludePlaceId &&
      (p.user_ratings_total ?? 0) >= MIN_REVIEWS
    )
    .slice(0, MAX_RESULTS)
    .map((p: any) => ({
      place_id: p.place_id,
      name: p.name,
      rating: p.rating ?? null,
      user_ratings_total: p.user_ratings_total ?? null,
      lat: p.geometry?.location?.lat ?? lat,
      lng: p.geometry?.location?.lng ?? lng,
      types: p.types ?? [],
    }));

  return results;
}

/**
 * Text Search — finds a business by name near a location.
 * Used by COMPETITOR ADD <name>.
 */
export async function textSearch(
  name: string,
  lat: number,
  lng: number
): Promise<PlaceResult[]> {
  const key = getApiKey();
  const url = new URL(`${PLACES_API_BASE}/textsearch/json`);
  url.searchParams.set('query', name);
  url.searchParams.set('location', `${lat},${lng}`);
  url.searchParams.set('radius', SCAN_RADIUS_M.toString());
  url.searchParams.set('type', 'restaurant');
  url.searchParams.set('key', key);

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Places Text Search error: ${res.status}`);
  const data = await res.json() as any;

  return (data.results || []).slice(0, 5).map((p: any) => ({
    place_id: p.place_id,
    name: p.name,
    rating: p.rating ?? null,
    user_ratings_total: p.user_ratings_total ?? null,
    lat: p.geometry?.location?.lat ?? lat,
    lng: p.geometry?.location?.lng ?? lng,
    types: p.types ?? [],
  }));
}

/**
 * Fetch current rating + review count for a single place_id.
 * Used during weekly snapshot ingestion.
 */
export async function getPlaceDetails(placeId: string): Promise<{ rating: number | null; user_ratings_total: number | null } | null> {
  try {
    const key = getApiKey();
    const url = new URL(`${PLACES_API_BASE}/details/json`);
    url.searchParams.set('place_id', placeId);
    url.searchParams.set('fields', 'rating,user_ratings_total');
    url.searchParams.set('key', key);

    const res = await fetch(url.toString());
    if (!res.ok) return null;
    const data = await res.json() as any;
    const r = data.result;
    return {
      rating: r?.rating ?? null,
      user_ratings_total: r?.user_ratings_total ?? null,
    };
  } catch {
    return null;
  }
}
