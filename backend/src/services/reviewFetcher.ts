/**
 * Review Fetching Service
 * Fetches reviews from Google Places API and syncs to database.
 * Deduplicates by platform + review_id.
 */

import { supabase } from './database.js';
import { googleReviewSource } from '../sources/google.js';
import { classifySentiment } from './sentimentClassifier.js';
import type { Review } from '../types/models.js';

export interface SyncResult {
  total: number;
  newReviews: number;
  duplicates: number;
  reviews: Review[];
}

/**
 * Fetch reviews for a restaurant from Google Places API.
 */
export async function fetchReviewsForRestaurant(placeId: string) {
  return googleReviewSource.fetchReviews(placeId);
}

/**
 * Sync new reviews to database, skipping duplicates.
 * Returns only newly inserted reviews.
 */
export async function syncNewReviews(restaurantId: string, placeId: string): Promise<SyncResult> {
  const rawReviews = await fetchReviewsForRestaurant(placeId);
  const newReviews: Review[] = [];
  let duplicates = 0;

  for (const raw of rawReviews) {
    // Check for existing review
    const { data: existing } = await supabase
      .from('reviews')
      .select('id')
      .eq('platform', 'google')
      .eq('review_id', raw.id)
      .maybeSingle();

    if (existing) {
      duplicates++;
      continue;
    }

    // Classify sentiment
    const sentiment = classifySentiment(raw.rating, raw.text);

    // Insert new review
    const { data: inserted, error } = await supabase
      .from('reviews')
      .insert({
        restaurant_id: restaurantId,
        platform: 'google',
        review_id: raw.id,
        author: raw.author,
        rating: raw.rating,
        text: raw.text,
        review_date: raw.date.toISOString(),
        metadata: raw.metadata,
      })
      .select()
      .single();

    if (error) {
      // Unique constraint violation = duplicate (race condition)
      if (error.code === '23505') {
        duplicates++;
        continue;
      }
      console.error(`Failed to insert review: ${error.message}`);
      continue;
    }

    newReviews.push(inserted as Review);
    console.log(`  📥 New ${raw.rating}★ review from ${raw.author} [${sentiment.sentiment}]`);
  }

  return {
    total: rawReviews.length,
    newReviews: newReviews.length,
    duplicates,
    reviews: newReviews,
  };
}
