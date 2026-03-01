/**
 * Response Posting Service
 * Posts approved reply drafts to Google Business Profile.
 * 
 * Google Business Profile API requires OAuth + business verification.
 */

import { query } from '../db/client.js';
import { postReply } from './googleBusinessProfile.js';
import type { ReplyDraft, Review } from '../types/models.js';

export interface PostResult {
  success: boolean;
  platform: string;
  externalResponseId?: string;
  error?: string;
}

export class ResponsePoster {
  /**
   * Post an approved reply to the originating platform.
   */
  async postResponse(draft: ReplyDraft, review: Review): Promise<PostResult> {
    console.log(`📤 Posting response for review ${review.id} on ${review.platform}`);

    // Extract the actual response text (Option 1 from the draft, or custom text)
    let responseText = draft.draft_text;
    const opt1Match = responseText.match(/Option 1[:\s]*(.+?)(?=Option 2|$)/is);
    if (opt1Match) responseText = opt1Match[1].trim();

    let result: PostResult;

    switch (review.platform) {
      case 'google':
        result = await this.postToGoogle(review, responseText);
        break;
      default:
        result = { success: false, platform: review.platform, error: `Unsupported platform: ${review.platform}` };
    }

    // Track in database
    await query(
      `UPDATE reply_drafts 
       SET status = $1, 
           metadata = jsonb_set(
             COALESCE(metadata, '{}'), 
             '{post_result}', 
             $2::jsonb
           )
       WHERE id = $3`,
      [
        result.success ? 'sent' : 'approved',
        JSON.stringify(result),
        draft.id,
      ]
    );

    // Log to posted_responses table
    if (result.success) {
      await query(
        `INSERT INTO posted_responses (
          reply_draft_id, review_id, platform, response_text, 
          external_response_id, posted_at
        ) VALUES ($1, $2, $3, $4, $5, NOW())`,
        [draft.id, review.id, review.platform, responseText, result.externalResponseId || null]
      );
    }

    return result;
  }

  /**
   * Post response to Google via Business Profile API (OAuth-authenticated).
   */
  private async postToGoogle(review: Review, text: string): Promise<PostResult> {
    const reviewName = review.metadata?.googleReviewName;
    if (!reviewName) {
      return { success: false, platform: 'google', error: 'Missing Google review resource name in metadata' };
    }

    try {
      const result = await postReply(review.restaurant_id, reviewName, text);
      if (result.success) {
        console.log('✅ Posted to Google successfully');
        return { success: true, platform: 'google', externalResponseId: reviewName };
      } else {
        return { success: false, platform: 'google', error: result.error };
      }
    } catch (error) {
      console.error('❌ Google post error:', error);
      return { success: false, platform: 'google', error: (error as Error).message };
    }
  }

  /**
   * Process all approved drafts that haven't been posted yet.
   */
  async processApprovedDrafts(): Promise<void> {
    const result = await query<ReplyDraft & { review_platform: string }>(
      `SELECT rd.*, r.platform as review_platform
       FROM reply_drafts rd
       JOIN reviews r ON r.id = rd.review_id
       WHERE rd.status = 'approved'
         AND NOT EXISTS (
           SELECT 1 FROM posted_responses pr WHERE pr.reply_draft_id = rd.id
         )
       ORDER BY rd.approved_at ASC
       LIMIT 10`
    );

    if (result.rows.length === 0) return;

    console.log(`📤 Processing ${result.rows.length} approved drafts...`);

    for (const draft of result.rows) {
      const reviewResult = await query<Review>(
        `SELECT * FROM reviews WHERE id = $1`, [draft.review_id]
      );
      if (reviewResult.rows.length === 0) continue;

      const review = reviewResult.rows[0];
      await this.postResponse(draft, review);
    }
  }
}

export const responsePoster = new ResponsePoster();
