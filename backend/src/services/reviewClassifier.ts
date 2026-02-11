/**
 * Review Classifier
 * Wraps the sentiment classifier with business logic for routing decisions.
 */

import { classifySentiment, type SentimentResult } from './sentimentClassifier.js';
import type { Review } from '../types/models.js';

/**
 * Classify a review's sentiment.
 * 4-5 stars = positive, 1-3 stars = negative
 */
export function classifyReview(review: Review): 'positive' | 'negative' {
  return review.rating >= 4 ? 'positive' : 'negative';
}

/**
 * Determine if a review needs SMS approval before posting.
 * Positive reviews: auto-post (no approval needed)
 * Negative reviews: require SMS approval from owner
 */
export function needsApproval(review: Review): boolean {
  return classifyReview(review) === 'negative';
}

/**
 * Get full sentiment analysis with score and signals.
 */
export function getFullSentiment(review: Review): SentimentResult {
  return classifySentiment(review.rating, review.text || '');
}
