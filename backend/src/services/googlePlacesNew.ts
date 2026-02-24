/**
 * Google Places API (New) - Reviews Fetcher
 * Uses the new Places API v1 instead of legacy
 */

export interface GoogleReview {
  name: string;
  relativePublishTimeDescription: string;
  rating: number;
  text: { text: string; languageCode: string };
  originalText?: { text: string; languageCode: string };
  authorAttribution: {
    displayName: string;
    uri: string;
    photoUri?: string;
  };
  publishTime: string;
}

export interface PlaceDetails {
  name: string;
  displayName: { text: string; languageCode: string };
  rating: number;
  userRatingCount: number;
  reviews?: GoogleReview[];
}

/**
 * Fetch place details and reviews using new Places API
 */
export async function fetchPlaceReviews(placeId: string): Promise<PlaceDetails> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    throw new Error('Missing GOOGLE_PLACES_API_KEY');
  }

  // Step 1: Get basic place info
  const placeUrl = `https://places.googleapis.com/v1/places/${placeId}?fields=displayName,rating,userRatingCount&key=${apiKey}`;
  
  const placeResponse = await fetch(placeUrl);
  const placeData = (await placeResponse.json()) as Record<string, unknown>;

  if (!placeResponse.ok) {
    throw new Error(`Places API error: ${(placeData?.error as Record<string, unknown>)?.message || placeResponse.statusText}`);
  }

  // Step 2: Get reviews (separate endpoint in new API)
  const reviewsUrl = `https://places.googleapis.com/v1/places/${placeId}?fields=reviews&key=${apiKey}`;
  
  const reviewsResponse = await fetch(reviewsUrl);
  const reviewsData = (await reviewsResponse.json()) as Record<string, unknown>;

  const reviews: GoogleReview[] = [];
  if (reviewsResponse.ok && Array.isArray(reviewsData.reviews)) {
    reviews.push(...(reviewsData.reviews as GoogleReview[]));
  } else {
    console.warn(`Failed to fetch reviews: ${(reviewsData?.error as Record<string, unknown>)?.message}`);
  }

  return {
    name: placeData.name as string || '',
    displayName: placeData.displayName as { text: string; languageCode: string } || { text: '', languageCode: 'en' },
    rating: placeData.rating as number || 0,
    userRatingCount: placeData.userRatingCount as number || 0,
    reviews,
  } as PlaceDetails;
}

/**
 * Convert Google review to our Review format
 */
export function convertGoogleReview(
  googleReview: GoogleReview,
  restaurantId: string
): {
  restaurant_id: string;
  platform: string;
  review_id: string;
  author: string;
  rating: number;
  text: string;
  review_date: string;
  metadata: any;
} {
  return {
    restaurant_id: restaurantId,
    platform: 'google',
    review_id: googleReview.name, // Unique ID from Google
    author: googleReview.authorAttribution.displayName,
    rating: googleReview.rating,
    text: googleReview.text?.text || googleReview.originalText?.text || '',
    review_date: googleReview.publishTime,
    metadata: {
      author_uri: googleReview.authorAttribution.uri,
      author_photo: googleReview.authorAttribution.photoUri,
      relative_time: googleReview.relativePublishTimeDescription,
      language: googleReview.text?.languageCode,
    },
  };
}
