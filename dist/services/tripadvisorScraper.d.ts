/**
 * TripAdvisor Scraper Service
 * Since TripAdvisor doesn't have a public API, we use web scraping
 * Note: Web scraping may break if TripAdvisor changes their HTML structure
 */
export interface TripAdvisorReview {
    id: string;
    author: string;
    rating: number;
    title: string;
    text: string;
    date: Date;
    url: string;
    metadata: {
        platform: 'tripadvisor';
        contributions?: number;
        helpfulVotes?: number;
        visitDate?: string;
    };
}
export interface TripAdvisorBusiness {
    id: string;
    name: string;
    rating: number;
    reviewCount: number;
    ranking?: string;
    priceRange?: string;
    cuisines: string[];
    url: string;
}
export declare class TripAdvisorScraper {
    private baseUrl;
    private userAgent;
    /**
     * Scrape reviews from a TripAdvisor restaurant URL
     * @param restaurantUrl Full TripAdvisor URL (e.g., https://www.tripadvisor.com/Restaurant_Review-g123-d456-Reviews-Restaurant_Name.html)
     * @param maxPages Number of review pages to scrape (default: 1)
     */
    scrapeReviews(restaurantUrl: string, maxPages?: number, since?: Date): Promise<TripAdvisorReview[]>;
    /**
     * Scrape basic business information
     */
    scrapeBusinessInfo(restaurantUrl: string): Promise<TripAdvisorBusiness | null>;
    /**
     * Search for restaurants (uses TripAdvisor search)
     */
    searchRestaurants(query: string, location: string, limit?: number): Promise<TripAdvisorBusiness[]>;
    /**
     * Parse various date formats TripAdvisor uses
     */
    private parseDate;
    /**
     * Extract number from text (e.g., "123 contributions" -> 123)
     */
    private extractNumber;
    /**
     * Delay helper
     */
    private delay;
}
export declare const tripadvisorScraper: TripAdvisorScraper;
//# sourceMappingURL=tripadvisorScraper.d.ts.map