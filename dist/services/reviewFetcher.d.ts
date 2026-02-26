/**
 * Review Fetching Service
 * Fetches reviews from Google Places API and syncs to database.
 * Deduplicates by platform + review_id.
 */
import type { Review } from '../types/models.js';
export interface SyncResult {
    total: number;
    newReviews: number;
    duplicates: number;
    reviews: Review[];
}
/**
 * Fetch reviews for a restaurant from Google Places API.
 */
export declare function fetchReviewsForRestaurant(placeId: string): Promise<import("../sources/google.js").GoogleReviewRaw[]>;
/**
 * Sync new reviews to database, skipping duplicates.
 * Returns only newly inserted reviews.
 */
export declare function syncNewReviews(restaurantId: string, placeId: string): Promise<SyncResult>;
//# sourceMappingURL=reviewFetcher.d.ts.map