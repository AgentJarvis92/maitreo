/**
 * Google Business Profile API Service
 * Fetches reviews and posts replies using authenticated OAuth tokens.
 *
 * This replaces googlePlacesNew.ts for authenticated review operations.
 * The Places API (public, API-key-based) is still used for initial place search.
 */
export interface GBPReview {
    reviewId: string;
    reviewer: {
        displayName: string;
        profilePhotoUrl?: string;
    };
    starRating: string;
    comment?: string;
    createTime: string;
    updateTime: string;
    name: string;
    reviewReply?: {
        comment: string;
        updateTime: string;
    };
}
/**
 * Fetch all locations for a Google Business account.
 */
export declare function fetchLocations(restaurantId: string): Promise<any[]>;
/**
 * Fetch reviews for a specific location via Business Profile API.
 * Stores them in the reviews table, avoiding duplicates.
 */
export declare function fetchReviews(restaurantId: string, locationName: string, // e.g., "locations/123456"
pageSize?: number): Promise<{
    fetched: number;
    newReviews: number;
}>;
/**
 * Post a reply to a Google review.
 */
export declare function postReply(restaurantId: string, reviewResourceName: string, // Full resource name: accounts/X/locations/Y/reviews/Z
replyText: string): Promise<{
    success: boolean;
    error?: string;
}>;
//# sourceMappingURL=googleBusinessProfile.d.ts.map