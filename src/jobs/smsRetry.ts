/**
 * SMS Retry Job
 * Retries failed SMS alerts with exponential backoff (max 3 attempts).
 */

import { query } from '../db/client.js';
import { smsService } from '../sms/smsService.js';
import type { Review, ReplyDraft, Restaurant } from '../types/models.js';

const MAX_ATTEMPTS = 3;
const BASE_DELAY_MS = 60_000; // 1 minute base delay

export class SmsRetryJob {
  /**
   * Find reviews with failed SMS alerts and retry sending.
   */
  async run(): Promise<void> {
    console.log('🔄 SMS retry job started');

    const result = await query<Review & { restaurant_id: string }>(
      `SELECT r.* FROM reviews r
       WHERE r.metadata::jsonb->>'sms_alert_failed' = 'true'
         AND COALESCE((r.metadata::jsonb->>'sms_retry_count')::int, 0) < $1
         AND (
           r.metadata::jsonb->>'sms_retry_after' IS NULL
           OR NOW() >= (r.metadata::jsonb->>'sms_retry_after')::timestamptz
         )
       ORDER BY r.ingested_at ASC
       LIMIT 50`,
      [MAX_ATTEMPTS]
    );

    if (result.rows.length === 0) {
      console.log('📊 SMS retry: no failed alerts to retry');
      return;
    }

    console.log(`📊 SMS retry: found ${result.rows.length} failed alerts to retry`);

    for (const review of result.rows) {
      const retryCount = parseInt((review.metadata as any)?.sms_retry_count || '0', 10);

      // Get restaurant + owner phone
      const restResult = await query<Restaurant>(
        `SELECT * FROM restaurants WHERE id = $1`,
        [review.restaurant_id]
      );
      const restaurant = restResult.rows[0];
      if (!restaurant?.owner_phone) {
        // No phone, mark as permanently failed
        await query(
          `UPDATE reviews SET metadata = jsonb_set(
            COALESCE(metadata::jsonb, '{}'), '{sms_alert_failed}', '"permanent"'
          ) WHERE id = $1`,
          [review.id]
        );
        continue;
      }

      // Get draft
      const draftResult = await query<ReplyDraft>(
        `SELECT * FROM reply_drafts WHERE review_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [review.id]
      );
      const draft = draftResult.rows[0];
      if (!draft) continue;

      try {
        await smsService.sendReviewAlert(review, draft, restaurant, restaurant.owner_phone);
        // Success — clear failed flag
        await query(
          `UPDATE reviews SET metadata = metadata::jsonb - 'sms_alert_failed' - 'sms_retry_count' - 'sms_retry_after' WHERE id = $1`,
          [review.id]
        );
        console.log(`  ✅ SMS retry succeeded for review ${review.id}`);
      } catch (err) {
        const newCount = retryCount + 1;
        const delayMs = BASE_DELAY_MS * Math.pow(2, newCount); // exponential backoff
        const retryAfter = new Date(Date.now() + delayMs).toISOString();

        if (newCount >= MAX_ATTEMPTS) {
          // Max retries reached — mark as permanently failed
          await query(
            `UPDATE reviews SET metadata = jsonb_set(
              jsonb_set(COALESCE(metadata::jsonb, '{}'), '{sms_alert_failed}', '"permanent"'),
              '{sms_retry_count}', $2::jsonb
            ) WHERE id = $1`,
            [review.id, JSON.stringify(newCount)]
          );
          console.error(`  ❌ SMS retry exhausted for review ${review.id} after ${MAX_ATTEMPTS} attempts`);
        } else {
          await query(
            `UPDATE reviews SET metadata = jsonb_set(
              jsonb_set(
                jsonb_set(COALESCE(metadata::jsonb, '{}'), '{sms_retry_count}', $2::jsonb),
                '{sms_retry_after}', $3::jsonb
              ),
              '{sms_alert_failed}', 'true'
            ) WHERE id = $1`,
            [review.id, JSON.stringify(newCount), JSON.stringify(retryAfter)]
          );
          console.log(`  🔄 SMS retry ${newCount}/${MAX_ATTEMPTS} for review ${review.id}, next retry after ${retryAfter}`);
        }
      }
    }

    console.log('📊 SMS retry job complete');
  }
}

export const smsRetryJob = new SmsRetryJob();
