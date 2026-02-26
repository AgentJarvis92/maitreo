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
import { query } from '../db/client.js';
import { replyGenerator } from '../services/replyGenerator.js';
import { emailService } from '../services/emailService.js';
export class IngestionJob {
    constructor() {
        this.sources = [];
    }
    /**
     * Register review sources (Google, Yelp, etc.)
     */
    registerSource(source) {
        this.sources.push(source);
        console.log(`✅ Registered review source: ${source.platform}`);
    }
    /**
     * Fetch all restaurants from database
     */
    async getAllRestaurants() {
        const result = await query(`SELECT * FROM restaurants ORDER BY created_at ASC`);
        return result.rows;
    }
    /**
     * Get the last ingestion time for a restaurant/platform
     */
    async getLastIngestionTime(restaurantId, platform) {
        var _a;
        const result = await query(`SELECT MAX(review_date) as max_date 
       FROM reviews 
       WHERE restaurant_id = $1 AND platform = $2`, [restaurantId, platform]);
        return ((_a = result.rows[0]) === null || _a === void 0 ? void 0 : _a.max_date) || null;
    }
    /**
     * Check if review already exists (deduplication)
     */
    async reviewExists(platform, reviewId) {
        var _a;
        const result = await query(`SELECT COUNT(*) as count FROM reviews WHERE platform = $1 AND review_id = $2`, [platform, reviewId]);
        return parseInt(String(((_a = result.rows[0]) === null || _a === void 0 ? void 0 : _a.count) || 0)) > 0;
    }
    /**
     * Insert new review into database
     */
    async insertReview(review) {
        const result = await query(`INSERT INTO reviews (
        restaurant_id, platform, review_id, author, rating, text, review_date, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id`, [
            review.restaurant_id,
            review.platform,
            review.review_id,
            review.author,
            review.rating,
            review.text,
            review.review_date,
            JSON.stringify(review.metadata || {}),
        ]);
        return result.rows[0].id;
    }
    /**
     * Generate and store reply draft
     */
    async generateAndStoreReply(review, restaurant) {
        // Generate reply using GPT-4
        const replyOutput = await replyGenerator.generateReply({ review, restaurant });
        // Store in database
        const result = await query(`INSERT INTO reply_drafts (
        review_id, draft_text, escalation_flag, escalation_reasons, status, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *`, [
            review.id,
            replyOutput.draft_text,
            replyOutput.escalation_flag,
            JSON.stringify(replyOutput.escalation_reasons),
            'pending',
            JSON.stringify({ confidence_score: replyOutput.confidence_score }),
        ]);
        return result.rows[0];
    }
    /**
     * Process a single restaurant
     */
    async processRestaurant(restaurant) {
        console.log(`\n📍 Processing restaurant: ${restaurant.name}`);
        let newReviewsCount = 0;
        for (const source of this.sources) {
            try {
                console.log(`  Fetching reviews from ${source.platform}...`);
                // Get last ingestion time
                const since = await this.getLastIngestionTime(restaurant.id, source.platform);
                // TODO: Replace with actual API call once data-api-agent provides spec
                // const rawReviews = await source.fetchReviews(restaurant.id, since || undefined);
                const rawReviews = []; // Placeholder
                console.log(`  Found ${rawReviews.length} potential new reviews`);
                for (const rawReview of rawReviews) {
                    // Check for duplicates
                    if (await this.reviewExists(source.platform, rawReview.id)) {
                        console.log(`  ⏭️  Skipping duplicate: ${rawReview.id}`);
                        continue;
                    }
                    // Insert review
                    const reviewId = await this.insertReview({
                        restaurant_id: restaurant.id,
                        platform: source.platform,
                        review_id: rawReview.id,
                        author: rawReview.author,
                        rating: rawReview.rating,
                        text: rawReview.text,
                        review_date: rawReview.date,
                        metadata: rawReview.metadata,
                    });
                    console.log(`  ✅ Inserted review: ${reviewId}`);
                    // Fetch full review object
                    const reviewResult = await query(`SELECT * FROM reviews WHERE id = $1`, [reviewId]);
                    const review = reviewResult.rows[0];
                    // Generate reply draft
                    const replyDraft = await this.generateAndStoreReply(review, restaurant);
                    console.log(`  💬 Generated reply draft: ${replyDraft.id}`);
                    // Send email to owner
                    await emailService.sendReplyDraftEmail(restaurant.owner_email, restaurant.name, review, replyDraft);
                    console.log(`  📧 Email sent to ${restaurant.owner_email}`);
                    newReviewsCount++;
                }
            }
            catch (error) {
                console.error(`  ❌ Error processing ${source.platform}:`, error);
                // Continue with other sources
            }
        }
        console.log(`  📊 Total new reviews processed: ${newReviewsCount}`);
    }
    /**
     * Run the ingestion job
     */
    async run() {
        console.log('🚀 Starting review ingestion job...');
        console.log(`   Registered sources: ${this.sources.map(s => s.platform).join(', ')}`);
        const startTime = Date.now();
        try {
            const restaurants = await this.getAllRestaurants();
            console.log(`\n📋 Processing ${restaurants.length} restaurants...\n`);
            for (const restaurant of restaurants) {
                await this.processRestaurant(restaurant);
            }
            const duration = ((Date.now() - startTime) / 1000).toFixed(2);
            console.log(`\n✅ Ingestion job completed in ${duration}s`);
        }
        catch (error) {
            console.error('❌ Ingestion job failed:', error);
            throw error;
        }
    }
}
// CLI runner
if (import.meta.url === `file://${process.argv[1]}`) {
    const job = new IngestionJob();
    // TODO: Register actual review sources once data-api-agent provides them
    // import { googleReviewSource } from '../sources/google.js';
    // import { yelpReviewSource } from '../sources/yelp.js';
    // job.registerSource(googleReviewSource);
    // job.registerSource(yelpReviewSource);
    console.log('⚠️  No review sources registered yet.');
    console.log('    Waiting for data-api-agent to provide ingestion spec.');
    console.log('    This job will remain a placeholder until then.\n');
    // Uncomment when sources are ready:
    // job.run()
    //   .then(() => process.exit(0))
    //   .catch((error) => {
    //     console.error(error);
    //     process.exit(1);
    //   });
}
export const ingestionJob = new IngestionJob();
//# sourceMappingURL=ingestion.js.map