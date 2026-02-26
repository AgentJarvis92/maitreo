/**
 * Yelp Fusion API Service
 * Enhanced service for fetching Yelp reviews and business data
 */
export interface YelpReview {
    id: string;
    author: string;
    rating: number;
    text: string;
    date: Date;
    url: string;
    metadata: {
        platform: 'yelp';
        profileUrl?: string;
        timeCreated?: string;
    };
}
export interface YelpBusiness {
    id: string;
    alias: string;
    name: string;
    rating: number;
    reviewCount: number;
    categories: string[];
    location: {
        address: string;
        city: string;
        state: string;
        zipCode: string;
        coordinates: {
            latitude: number;
            longitude: number;
        };
    };
    phone: string;
    price?: string;
    photos: string[];
}
export interface YelpSearchResult {
    businesses: YelpBusiness[];
    total: number;
}
export declare class YelpService {
    private apiKey;
    private baseUrl;
    constructor();
    private request;
    /**
     * Fetch reviews for a Yelp business
     * Note: Yelp Fusion API returns up to 3 highlighted reviews
     */
    fetchReviews(businessIdOrAlias: string, since?: Date): Promise<YelpReview[]>;
    /**
     * Get business details
     */
    getBusinessDetails(businessIdOrAlias: string): Promise<YelpBusiness | null>;
    /**
     * Search for businesses near a location
     * @param term Search term (e.g., "pizza")
     * @param location Location (e.g., "New York, NY")
     * @param radiusMeters Radius in meters (max 40000)
     * @param limit Number of results (max 50)
     */
    searchBusinesses(term: string, location: string, radiusMeters?: number, // 5 miles
    limit?: number): Promise<YelpSearchResult>;
    /**
     * Search by coordinates
     */
    searchByCoordinates(term: string, latitude: number, longitude: number, radiusMeters?: number, limit?: number): Promise<YelpSearchResult>;
}
export declare const yelpService: YelpService;
//# sourceMappingURL=yelpService.d.ts.map