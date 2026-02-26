/**
 * Google Places API (New) - Reviews Fetcher
 * Uses the new Places API v1 instead of legacy
 */
export interface GoogleReview {
    name: string;
    relativePublishTimeDescription: string;
    rating: number;
    text: {
        text: string;
        languageCode: string;
    };
    originalText?: {
        text: string;
        languageCode: string;
    };
    authorAttribution: {
        displayName: string;
        uri: string;
        photoUri?: string;
    };
    publishTime: string;
}
export interface PlaceDetails {
    name: string;
    displayName: {
        text: string;
        languageCode: string;
    };
    rating: number;
    userRatingCount: number;
    reviews?: GoogleReview[];
}
/**
 * Fetch place details and reviews using new Places API
 */
export declare function fetchPlaceReviews(placeId: string): Promise<PlaceDetails>;
/**
 * Convert Google review to our Review format
 */
export declare function convertGoogleReview(googleReview: GoogleReview, restaurantId: string): {
    restaurant_id: string;
    platform: string;
    review_id: string;
    author: string;
    rating: number;
    text: string;
    review_date: string;
    metadata: any;
};
//# sourceMappingURL=googlePlacesNew.d.ts.map