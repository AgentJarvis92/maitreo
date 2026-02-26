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
import type { ReplyDraft, Review } from '../types/models.js';
export interface PostResult {
    success: boolean;
    platform: string;
    externalResponseId?: string;
    error?: string;
}
export declare class ResponsePoster {
    /**
     * Post an approved reply to the originating platform.
     */
    postResponse(draft: ReplyDraft, review: Review): Promise<PostResult>;
    /**
     * Post response to Google via Business Profile API (OAuth-authenticated).
     */
    private postToGoogle;
    /**
     * Post response to Yelp.
     * Yelp does NOT have a public API for posting review responses.
     * This is a placeholder for future browser automation or partner API integration.
     */
    private postToYelp;
    /**
     * Process all approved drafts that haven't been posted yet.
     * Run this on a schedule (e.g., every minute).
     */
    processApprovedDrafts(): Promise<void>;
}
export declare const responsePoster: ResponsePoster;
