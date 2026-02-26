/**
 * Review Classifier
 * Wraps the sentiment classifier with business logic for routing decisions.
 */
import { type SentimentResult } from './sentimentClassifier.js';
import type { Review } from '../types/models.js';
/**
 * Classify a review's sentiment.
 * 4-5 stars = positive, 1-3 stars = negative
 */
export declare function classifyReview(review: Review): 'positive' | 'negative';
/**
 * Determine if a review needs SMS approval before posting.
 * Positive reviews: auto-post (no approval needed)
 * Negative reviews: require SMS approval from owner
 */
export declare function needsApproval(review: Review): boolean;
/**
 * Get full sentiment analysis with score and signals.
 */
export declare function getFullSentiment(review: Review): SentimentResult;
//# sourceMappingURL=reviewClassifier.d.ts.map