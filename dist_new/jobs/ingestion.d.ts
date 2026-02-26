/**
 * Review Ingestion Job
 *
 * Polls Google and Yelp for new reviews, deduplicates, and stores in database.
 * Triggers reply generation for new reviews.
 *
 * Schedule: Every 4 hours
 *
 * TODO: Wait for data-api-agent's ingestion spec before implementing.
 * This is a placeholder showing the expected flow.
 */
interface ReviewSource {
    platform: 'google' | 'yelp';
    fetchReviews(restaurantId: string, since?: Date): Promise<any[]>;
}
export declare class IngestionJob {
    private sources;
    /**
     * Register review sources (Google, Yelp, etc.)
     */
    registerSource(source: ReviewSource): void;
    /**
     * Fetch all restaurants from database
     */
    private getAllRestaurants;
    /**
     * Get the last ingestion time for a restaurant/platform
     */
    private getLastIngestionTime;
    /**
     * Check if review already exists (deduplication)
     */
    private reviewExists;
    /**
     * Insert new review into database
     */
    private insertReview;
    /**
     * Generate and store reply draft
     */
    private generateAndStoreReply;
    /**
     * Process a single restaurant
     */
    private processRestaurant;
    /**
     * Run the ingestion job
     */
    run(): Promise<void>;
}
export declare const ingestionJob: IngestionJob;
export {};
