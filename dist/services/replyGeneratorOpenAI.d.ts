/**
 * Reply Generator - OpenAI GPT-4o Integration
 *
 * Generates AI-powered restaurant replies using OpenAI's GPT-4o model.
 * Includes sentiment classification, escalation detection, and fallback to mock if API fails.
 */
import type { Review, Restaurant, GenerateReplyOutput } from '../types/models.js';
/**
 * Generate a reply for a single review using OpenAI GPT-4o
 */
export declare function generateReply(review: Review, restaurant: Restaurant): Promise<GenerateReplyOutput>;
/**
 * Batch generate replies for multiple reviews (parallel)
 */
export declare function generateRepliesBatch(reviews: Review[], restaurant: Restaurant): Promise<GenerateReplyOutput[]>;
//# sourceMappingURL=replyGeneratorOpenAI.d.ts.map