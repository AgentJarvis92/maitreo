/**
 * Review Monitor Job
 * Polls Google every 5 minutes for new reviews.
 * Classifies sentiment, generates AI responses, sends SMS alerts.
 * Google-only — Yelp/TripAdvisor removed (locked product decision).
 */

import { query, transaction } from '../db/client.js';
import { googleReviewSource } from '../sources/google.js';
import { classifySentiment } from '../services/sentimentClassifier.js';
import { replyGenerator } from '../services/replyGenerator.js';
import { smsService } from '../sms/smsService.js';
import type { Restaurant, Review, ReplyDraft } from '../types/models.js';

const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS || '300000'); // default 5 minutes

export class ReviewMonitorJob {
  private running = false;

  /**
   * Get all restaurants with their platform IDs from competitors_json
   */
  private async getRestaurants(): Promise<Restaurant[]> {
    const result = await query<Restaurant>(`SELECT * FROM restaurants WHERE monitoring_paused IS NOT TRUE AND COALESCE(subscription_state, 'trialing') NOT IN ('canceled', 'past_due') ORDER BY created_at`);
    return result.rows;
  }

  /**
   * Check if review already exists
   */
  private async reviewExists(platform: string, reviewId: string): Promise<boolean> {
    const result = await query<{ count: string }>(
      `SELECT COUNT(*) as count FROM reviews WHERE platform = $1 AND review_id = $2`,
      [platform, reviewId]
    );
    return parseInt(result.rows[0]?.count || '0') > 0;
  }

  /**
   * Get last review date for a restaurant+platform
   */
  private async getLastReviewDate(restaurantId: string, platform: string): Promise<Date | null> {
    const result = await query<{ max_date: Date | null }>(
      `SELECT MAX(review_date) as max_date FROM reviews WHERE restaurant_id = $1 AND platform = $2`,
      [restaurantId, platform]
    );
    return result.rows[0]?.max_date || null;
  }

  /**
   * Process a single restaurant — fetch, store, classify, generate reply, send SMS
   */
  private async processRestaurant(restaurant: Restaurant): Promise<number> {
    let newCount = 0;
    const competitors = restaurant.competitors_json || [];

    for (const comp of competitors) {
      const platform = comp.platform;
      const platformId = comp.id;

      if (!platformId) continue;
      if (platform !== 'google') continue; // Google-only

      const since = await this.getLastReviewDate(restaurant.id, platform);
      let rawReviews: any[] = [];

      try {
        rawReviews = await googleReviewSource.fetchReviews(platformId, since || undefined);
      } catch (err) {
        console.error(`  ❌ Error fetching Google reviews for ${restaurant.name}:`, err);
        continue;
      }

      for (const raw of rawReviews) {
        if (await this.reviewExists(platform, raw.id)) continue;

        // Classify sentiment
        const sentiment = classifySentiment(raw.rating, raw.text);

        // Insert review + draft in a transaction to prevent orphaned reviews
        const { review, draft } = await transaction(async (client) => {
          const insertResult = await client.query<{ id: string }>(
            `INSERT INTO reviews (
              restaurant_id, platform, review_id, author, rating, text,
              review_date, metadata, sentiment, sentiment_score
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING id`,
            [
              restaurant.id, platform, raw.id, raw.author, raw.rating, raw.text,
              raw.date, JSON.stringify(raw.metadata || {}),
              sentiment.sentiment, sentiment.score,
            ]
          );
          const reviewId = insertResult.rows[0].id;

          // Fetch full review
          const reviewResult = await client.query<Review>(`SELECT * FROM reviews WHERE id = $1`, [reviewId]);
          const review = reviewResult.rows[0];

          // Generate AI reply
          const replyOutput = await replyGenerator.generateReply({ review, restaurant });
          const draftResult = await client.query<ReplyDraft>(
            `INSERT INTO reply_drafts (
              review_id, draft_text, escalation_flag, escalation_reasons, status, metadata
            ) VALUES ($1, $2, $3, $4, 'pending', $5)
            RETURNING *`,
            [
              reviewId,
              replyOutput.draft_text,
              replyOutput.escalation_flag,
              JSON.stringify(replyOutput.escalation_reasons),
              JSON.stringify({ confidence_score: replyOutput.confidence_score }),
            ]
          );
          return { review, draft: draftResult.rows[0] };
        });

        // Send SMS if owner has phone
        const ownerPhone = restaurant.owner_phone;
        if (ownerPhone) {
          try {
            await smsService.sendReviewAlert(review, draft, restaurant, ownerPhone);
          } catch (err) {
            console.error(`  ❌ SMS failed for ${ownerPhone}:`, err);
            // Mark review for SMS retry
            await query(
              `UPDATE reviews SET metadata = jsonb_set(COALESCE(metadata::jsonb, '{}'), '{sms_alert_failed}', 'true') WHERE id = $1`,
              [review.id]
            ).catch(retryErr => console.error('Failed to mark SMS retry:', retryErr));
          }
        } else {
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
  async runOnce(): Promise<void> {
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
  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    console.log('🚀 Review monitor started (polling every 5 min)');

    while (this.running) {
      try {
        await this.runOnce();
      } catch (err) {
        console.error('❌ Monitor cycle error:', err);
      }
      await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
    }
  }

  stop(): void {
    this.running = false;
    console.log('⏹️  Review monitor stopped');
  }
}

export const reviewMonitor = new ReviewMonitorJob();

// CLI runner
if (import.meta.url === `file://${process.argv[1]}`) {
  reviewMonitor.start().catch(console.error);
}
