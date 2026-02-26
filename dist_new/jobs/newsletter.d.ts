/**
 * Weekly Newsletter Job
 *
 * Generates and sends competitive intelligence newsletters every Monday at 9am.
 * Analyzes competitor reviews from the past 7 days and provides actionable insights.
 *
 * Schedule: Every Monday at 9:00 AM
 */
export declare class NewsletterJob {
    /**
     * Fetch all active restaurants
     */
    private getAllRestaurants;
    /**
     * Get competitor reviews for the past 7 days
     */
    private getCompetitorReviews;
    /**
     * Check if newsletter already exists for this week
     */
    private newsletterExists;
    /**
     * Save newsletter to database
     */
    private saveNewsletter;
    /**
     * Process a single restaurant
     */
    private processRestaurant;
    /**
     * Run the newsletter job
     */
    run(weekStartDate?: Date): Promise<void>;
}
export declare const newsletterJob: NewsletterJob;
