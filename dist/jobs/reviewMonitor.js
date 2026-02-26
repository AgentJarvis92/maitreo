"use strict";
/**
 * Review Monitor Job
 * Polls Google and Yelp every 5 minutes for new reviews.
 * Classifies sentiment, generates AI responses, sends SMS alerts.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.reviewMonitor = exports.ReviewMonitorJob = void 0;
const client_js_1 = require("../db/client.js");
const google_js_1 = require("../sources/google.js");
const yelp_js_1 = require("../sources/yelp.js");
const sentimentClassifier_js_1 = require("../services/sentimentClassifier.js");
const replyGenerator_js_1 = require("../services/replyGenerator.js");
const smsService_js_1 = require("../sms/smsService.js");
const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS || '300000'); // default 5 minutes
class ReviewMonitorJob {
    constructor() {
        this.running = false;
    }
    /**
     * Get all restaurants with their platform IDs from competitors_json
     */
    async getRestaurants() {
        const result = await (0, client_js_1.query)(`SELECT * FROM restaurants WHERE monitoring_paused IS NOT TRUE ORDER BY created_at`);
        return result.rows;
    }
    /**
     * Check if review already exists
     */
    async reviewExists(platform, reviewId) {
        var _a;
        const result = await (0, client_js_1.query)(`SELECT COUNT(*) as count FROM reviews WHERE platform = $1 AND review_id = $2`, [platform, reviewId]);
        return parseInt(((_a = result.rows[0]) === null || _a === void 0 ? void 0 : _a.count) || '0') > 0;
    }
    /**
     * Get last review date for a restaurant+platform
     */
    async getLastReviewDate(restaurantId, platform) {
        var _a;
        const result = await (0, client_js_1.query)(`SELECT MAX(review_date) as max_date FROM reviews WHERE restaurant_id = $1 AND platform = $2`, [restaurantId, platform]);
        return ((_a = result.rows[0]) === null || _a === void 0 ? void 0 : _a.max_date) || null;
    }
    /**
     * Process a single restaurant — fetch, store, classify, generate reply, send SMS
     */
    async processRestaurant(restaurant) {
        let newCount = 0;
        const competitors = restaurant.competitors_json || [];
        for (const comp of competitors) {
            const platform = comp.platform;
            const platformId = comp.id;
            if (!platformId)
                continue;
            if (platform !== 'google' && platform !== 'yelp')
                continue;
            const since = await this.getLastReviewDate(restaurant.id, platform);
            let rawReviews = [];
            try {
                if (platform === 'google') {
                    rawReviews = await google_js_1.googleReviewSource.fetchReviews(platformId, since || undefined);
                }
                else if (platform === 'yelp') {
                    rawReviews = await yelp_js_1.yelpReviewSource.fetchReviews(platformId, since || undefined);
                }
            }
            catch (err) {
                console.error(`  ❌ Error fetching ${platform} for ${restaurant.name}:`, err);
                continue;
            }
            for (const raw of rawReviews) {
                if (await this.reviewExists(platform, raw.id))
                    continue;
                // Classify sentiment
                const sentiment = (0, sentimentClassifier_js_1.classifySentiment)(raw.rating, raw.text);
                // Insert review + draft in a transaction to prevent orphaned reviews
                const { review, draft } = await (0, client_js_1.transaction)(async (client) => {
                    const insertResult = await client.query(`INSERT INTO reviews (
              restaurant_id, platform, review_id, author, rating, text,
              review_date, metadata, sentiment, sentiment_score
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING id`, [
                        restaurant.id, platform, raw.id, raw.author, raw.rating, raw.text,
                        raw.date, JSON.stringify(raw.metadata || {}),
                        sentiment.sentiment, sentiment.score,
                    ]);
                    const reviewId = insertResult.rows[0].id;
                    // Fetch full review
                    const reviewResult = await client.query(`SELECT * FROM reviews WHERE id = $1`, [reviewId]);
                    const review = reviewResult.rows[0];
                    // Generate AI reply
                    const replyOutput = await replyGenerator_js_1.replyGenerator.generateReply({ review, restaurant });
                    const draftResult = await client.query(`INSERT INTO reply_drafts (
              review_id, draft_text, escalation_flag, escalation_reasons, status, metadata
            ) VALUES ($1, $2, $3, $4, 'pending', $5)
            RETURNING *`, [
                        reviewId,
                        replyOutput.draft_text,
                        replyOutput.escalation_flag,
                        JSON.stringify(replyOutput.escalation_reasons),
                        JSON.stringify({ confidence_score: replyOutput.confidence_score }),
                    ]);
                    return { review, draft: draftResult.rows[0] };
                });
                // Send SMS if owner has phone
                const ownerPhone = restaurant.owner_phone;
                if (ownerPhone) {
                    try {
                        await smsService_js_1.smsService.sendReviewAlert(review, draft, restaurant, ownerPhone);
                    }
                    catch (err) {
                        console.error(`  ❌ SMS failed for ${ownerPhone}:`, err);
                        // Mark review for SMS retry
                        await (0, client_js_1.query)(`UPDATE reviews SET metadata = jsonb_set(COALESCE(metadata::jsonb, '{}'), '{sms_alert_failed}', 'true') WHERE id = $1`, [review.id]).catch(retryErr => console.error('Failed to mark SMS retry:', retryErr));
                    }
                }
                else {
                    console.log(`  ⚠️  No phone for ${restaurant.name}, skipping SMS`);
                }
                newCount++;
                console.log(`  ✅ New ${raw.rating}⭐ ${platform} review → ${sentiment.sentiment} → draft ${draft.id}`);
            }
        }
        return newCount;
    }
    /**
     * Run one poll cycle
     */
    async runOnce() {
        console.log(`\n🔍 Review monitor polling at ${new Date().toISOString()}`);
        const restaurants = await this.getRestaurants();
        let totalNew = 0;
        for (const r of restaurants) {
            const count = await this.processRestaurant(r);
            totalNew += count;
        }
        console.log(`📊 Poll complete: ${totalNew} new reviews across ${restaurants.length} restaurants`);
    }
    /**
     * Start continuous polling (every 5 minutes)
     */
    async start() {
        if (this.running)
            return;
        this.running = true;
        console.log('🚀 Review monitor started (polling every 5 min)');
        while (this.running) {
            try {
                await this.runOnce();
            }
            catch (err) {
                console.error('❌ Monitor cycle error:', err);
            }
            await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
        }
    }
    stop() {
        this.running = false;
        console.log('⏹️  Review monitor stopped');
    }
}
exports.ReviewMonitorJob = ReviewMonitorJob;
exports.reviewMonitor = new ReviewMonitorJob();
// CLI runner
if (import.meta.url === `file://${process.argv[1]}`) {
    exports.reviewMonitor.start().catch(console.error);
}
