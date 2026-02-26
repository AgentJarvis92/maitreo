/**
 * Google Places API (New) - Reviews Fetcher
 * Uses the new Places API v1 instead of legacy
 */
/**
 * Fetch place details and reviews using new Places API
 */
export async function fetchPlaceReviews(placeId) {
    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (!apiKey) {
        throw new Error('Missing GOOGLE_PLACES_API_KEY');
    }
    // Step 1: Get basic place info
    const placeUrl = `https://places.googleapis.com/v1/places/${placeId}?fields=displayName,rating,userRatingCount&key=${apiKey}`;
    const placeResponse = await fetch(placeUrl);
    const placeData = (await placeResponse.json());
    if (!placeResponse.ok) {
        throw new Error(`Places API error: ${placeData?.error?.message || placeResponse.statusText}`);
    }
    // Step 2: Get reviews (separate endpoint in new API)
    const reviewsUrl = `https://places.googleapis.com/v1/places/${placeId}?fields=reviews&key=${apiKey}`;
    const reviewsResponse = await fetch(reviewsUrl);
    const reviewsData = (await reviewsResponse.json());
    const reviews = [];
    if (reviewsResponse.ok && Array.isArray(reviewsData.reviews)) {
        reviews.push(...reviewsData.reviews);
    }
    else {
        console.warn(`Failed to fetch reviews: ${reviewsData?.error?.message}`);
    }
    return {
        name: placeData.name || '',
        displayName: placeData.displayName || { text: '', languageCode: 'en' },
        rating: placeData.rating || 0,
        userRatingCount: placeData.userRatingCount || 0,
        reviews,
    };
}
/**
 * Convert Google review to our Review format
 */
export function convertGoogleReview(googleReview, restaurantId) {
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
//# sourceMappingURL=googlePlacesNew.js.map