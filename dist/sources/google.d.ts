/**
 * Google Places Review Scraper
 * Uses Google Places API (New) to fetch reviews for a business.
 */
export interface GoogleReviewRaw {
    id: string;
    author: string;
    rating: number;
    text: string;
    date: Date;
    metadata: {
        platform: 'google';
        profileUrl?: string;
        language?: string;
        relativeTime?: string;
    };
}
export declare class GoogleReviewSource {
    readonly platform: "google";
    private apiKey;
    constructor();
    /**
     * Fetch reviews for a Google Place ID.
     * Uses Places API v1 (New) — returns up to 5 most recent reviews per call.
     * For more, use the legacy Places API with pagetoken.
     */
    fetchReviews(placeId: string, since?: Date): Promise<GoogleReviewRaw[]>;
}
export declare const googleReviewSource: GoogleReviewSource;
//# sourceMappingURL=google.d.ts.map