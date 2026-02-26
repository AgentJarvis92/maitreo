/**
 * Review Processor - Main Pipeline
 *
 * Orchestrates: Fetch → Classify → Generate Reply → Route (auto-post or SMS approval)
 *
 * Uses real OpenAI GPT-4o for reply generation with fallback to mock generator on API errors.
 */
import type { Review, Restaurant } from '../types/models.js';
export interface ProcessResult {
    reviewId: string;
    sentiment: string;
    action: 'auto_posted' | 'sms_approval' | 'error';
    draftId?: string;
    error?: string;
}
/**
 * Process a single review through the full pipeline.
 */
export declare function processReview(review: Review, restaurant: Restaurant): Promise<ProcessResult>;
/**
 * Process all new reviews for a restaurant.
 */
export declare function processNewReviews(reviews: Review[], restaurant: Restaurant): Promise<ProcessResult[]>;
//# sourceMappingURL=reviewProcessor.d.ts.map