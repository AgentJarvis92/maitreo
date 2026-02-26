/**
 * Review Monitor Job
 * Polls Google and Yelp every 5 minutes for new reviews.
 * Classifies sentiment, generates AI responses, sends SMS alerts.
 */
export declare class ReviewMonitorJob {
    private running;
    /**
     * Get all restaurants with their platform IDs from competitors_json
     */
    private getRestaurants;
    /**
     * Check if review already exists
     */
    private reviewExists;
    /**
     * Get last review date for a restaurant+platform
     */
    private getLastReviewDate;
    /**
     * Process a single restaurant — fetch, store, classify, generate reply, send SMS
     */
    private processRestaurant;
    /**
     * Run one poll cycle
     */
    runOnce(): Promise<void>;
    /**
     * Start continuous polling (every 5 minutes)
     */
    start(): Promise<void>;
    stop(): void;
}
export declare const reviewMonitor: ReviewMonitorJob;
//# sourceMappingURL=reviewMonitor.d.ts.map