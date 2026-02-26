/**
 * Yelp Review Scraper
 * Uses Yelp Fusion API to fetch reviews for a business.
 * Note: Yelp API only returns up to 3 reviews. For full scraping,
 * consider Yelp's GraphQL API or a scraping service.
 */
export interface YelpReviewRaw {
    id: string;
    author: string;
    rating: number;
    text: string;
    date: Date;
    metadata: {
        platform: 'yelp';
        profileUrl?: string;
        timeCreated?: string;
    };
}
export declare class YelpReviewSource {
    readonly platform: "yelp";
    private apiKey;
    private baseUrl;
    constructor();
    /**
     * Fetch reviews for a Yelp business ID/alias.
     * Yelp Fusion API returns up to 3 "highlighted" reviews per business.
     * For production, you'd want Yelp's GraphQL endpoint or a scraping layer.
     */
    fetchReviews(businessId: string, since?: Date): Promise<YelpReviewRaw[]>;
}
export declare const yelpReviewSource: YelpReviewSource;
