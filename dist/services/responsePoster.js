"use strict";
/**
 * Response Posting Service
 * Posts approved reply drafts to Yelp and Google.
 *
 * IMPORTANT: Neither Yelp nor Google provide public APIs for posting review responses.
 * - Google: Business Profile API requires OAuth + business verification
 * - Yelp: No public API for responding to reviews
 *
 * This module provides the interface and tracking. Actual posting requires either:
 * 1. Google Business Profile API (OAuth flow) for Google
 * 2. Browser automation / Yelp for Business API (partner-only) for Yelp
 * 3. A third-party service like Birdeye, Podium, etc.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.responsePoster = exports.ResponsePoster = void 0;
const client_js_1 = require("../db/client.js");
const googleBusinessProfile_js_1 = require("./googleBusinessProfile.js");
class ResponsePoster {
    /**
     * Post an approved reply to the originating platform.
     */
    async postResponse(draft, review) {
        console.log(`📤 Posting response for review ${review.id} on ${review.platform}`);
        // Extract the actual response text (Option 1 from the draft, or custom text)
        let responseText = draft.draft_text;
        const opt1Match = responseText.match(/Option 1[:\s]*(.+?)(?=Option 2|$)/is);
        if (opt1Match)
            responseText = opt1Match[1].trim();
        let result;
        switch (review.platform) {
            case 'google':
                result = await this.postToGoogle(review, responseText);
                break;
            case 'yelp':
                result = await this.postToYelp(review, responseText);
                break;
            default:
                result = { success: false, platform: review.platform, error: `Unsupported platform: ${review.platform}` };
        }
        // Track in database
        await (0, client_js_1.query)(`UPDATE reply_drafts 
       SET status = $1, 
           metadata = jsonb_set(
             COALESCE(metadata, '{}'), 
             '{post_result}', 
             $2::jsonb
           )
       WHERE id = $3`, [
            result.success ? 'sent' : 'approved', // keep 'approved' if posting failed
            JSON.stringify(result),
            draft.id,
        ]);
        // Log to posted_responses table
        if (result.success) {
            await (0, client_js_1.query)(`INSERT INTO posted_responses (
          reply_draft_id, review_id, platform, response_text, 
          external_response_id, posted_at
        ) VALUES ($1, $2, $3, $4, $5, NOW())`, [draft.id, review.id, review.platform, responseText, result.externalResponseId || null]);
        }
        return result;
    }
    /**
     * Post response to Google via Business Profile API (OAuth-authenticated).
     */
    async postToGoogle(review, text) {
        var _a;
        const reviewName = (_a = review.metadata) === null || _a === void 0 ? void 0 : _a.googleReviewName;
        if (!reviewName) {
            return { success: false, platform: 'google', error: 'Missing Google review resource name in metadata' };
        }
        try {
            const result = await (0, googleBusinessProfile_js_1.postReply)(review.restaurant_id, reviewName, text);
            if (result.success) {
                console.log('✅ Posted to Google successfully');
                return { success: true, platform: 'google', externalResponseId: reviewName };
            }
            else {
                return { success: false, platform: 'google', error: result.error };
            }
        }
        catch (error) {
            console.error('❌ Google post error:', error);
            return { success: false, platform: 'google', error: error.message };
        }
    }
    /**
     * Post response to Yelp.
     * Yelp does NOT have a public API for posting review responses.
     * This is a placeholder for future browser automation or partner API integration.
     */
    async postToYelp(review, text) {
        console.warn('⚠️  Yelp response posting not yet implemented (no public API)');
        // TODO: Implement via browser automation (Puppeteer) or Yelp partner API
        return {
            success: false,
            platform: 'yelp',
            error: 'Yelp does not provide a public API for posting responses. Browser automation integration pending.',
        };
    }
    /**
     * Process all approved drafts that haven't been posted yet.
     * Run this on a schedule (e.g., every minute).
     */
    async processApprovedDrafts() {
        const result = await (0, client_js_1.query)(`SELECT rd.*, r.platform as review_platform
       FROM reply_drafts rd
       JOIN reviews r ON r.id = rd.review_id
       WHERE rd.status = 'approved'
         AND NOT EXISTS (
           SELECT 1 FROM posted_responses pr WHERE pr.reply_draft_id = rd.id
         )
       ORDER BY rd.approved_at ASC
       LIMIT 10`);
        if (result.rows.length === 0)
            return;
        console.log(`📤 Processing ${result.rows.length} approved drafts...`);
        for (const draft of result.rows) {
            const reviewResult = await (0, client_js_1.query)(`SELECT * FROM reviews WHERE id = $1`, [draft.review_id]);
            if (reviewResult.rows.length === 0)
                continue;
            const review = reviewResult.rows[0];
            await this.postResponse(draft, review);
        }
    }
}
exports.ResponsePoster = ResponsePoster;
exports.responsePoster = new ResponsePoster();
