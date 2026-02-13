/**
 * Google Business Profile API Service
 * Fetches reviews and posts replies using authenticated OAuth tokens.
 * 
 * This replaces googlePlacesNew.ts for authenticated review operations.
 * The Places API (public, API-key-based) is still used for initial place search.
 */

import { query } from '../db/client.js';
import { getValidAccessToken, getGoogleAccountId } from './googleOAuth.js';

const GBP_BASE = 'https://mybusiness.googleapis.com/v4';

export interface GBPReview {
  reviewId: string;
  reviewer: { displayName: string; profilePhotoUrl?: string };
  starRating: string; // "ONE" | "TWO" | "THREE" | "FOUR" | "FIVE"
  comment?: string;
  createTime: string;
  updateTime: string;
  name: string; // Resource name: accounts/X/locations/Y/reviews/Z
  reviewReply?: { comment: string; updateTime: string };
}

const STAR_MAP: Record<string, number> = {
  ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5,
};

/**
 * Fetch all locations for a Google Business account.
 */
export async function fetchLocations(restaurantId: string): Promise<any[]> {
  const accessToken = await getValidAccessToken(restaurantId);
  if (!accessToken) throw new Error('No valid Google access token');

  const accountId = await getGoogleAccountId(restaurantId);
  if (!accountId) throw new Error('No Google account ID stored');

  const response = await fetch(
    `https://mybusinessbusinessinformation.googleapis.com/v1/${accountId}/locations?readMask=name,title,storefrontAddress`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!response.ok) {
    const err = await response.text();
    console.error(`❌ [GBP] Failed to fetch locations: ${response.status} ${err}`);
    throw new Error(`Failed to fetch locations: ${response.status}`);
  }

  const data = await response.json() as any;
  return data.locations || [];
}

/**
 * Fetch reviews for a specific location via Business Profile API.
 * Stores them in the reviews table, avoiding duplicates.
 */
export async function fetchReviews(
  restaurantId: string,
  locationName: string, // e.g., "locations/123456"
  pageSize = 50
): Promise<{ fetched: number; newReviews: number }> {
  const accessToken = await getValidAccessToken(restaurantId);
  if (!accessToken) throw new Error('No valid Google access token');

  const accountId = await getGoogleAccountId(restaurantId);
  if (!accountId) throw new Error('No Google account ID stored');

  let fetched = 0;
  let newReviews = 0;
  let nextPageToken: string | undefined;

  do {
    const url = new URL(`${GBP_BASE}/${accountId}/${locationName}/reviews`);
    url.searchParams.set('pageSize', String(pageSize));
    if (nextPageToken) url.searchParams.set('pageToken', nextPageToken);

    const response = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      const err = await response.text();
      console.error(`❌ [GBP] Fetch reviews failed: ${response.status} ${err}`);
      throw new Error(`Failed to fetch reviews: ${response.status}`);
    }

    const data = await response.json() as any;
    const reviews: GBPReview[] = data.reviews || [];
    nextPageToken = data.nextPageToken;

    for (const review of reviews) {
      fetched++;
      const stored = await storeReview(restaurantId, review);
      if (stored) newReviews++;
    }

    console.log(`📥 [GBP] Fetched ${reviews.length} reviews (page), ${newReviews} new so far`);
  } while (nextPageToken);

  console.log(`✅ [GBP] Total: ${fetched} fetched, ${newReviews} new for restaurant ${restaurantId}`);
  return { fetched, newReviews };
}

/**
 * Store a single GBP review in the database. Returns true if new.
 */
async function storeReview(restaurantId: string, review: GBPReview): Promise<boolean> {
  const reviewId = review.name; // Unique resource name

  // Check for duplicate
  const existing = await query(
    `SELECT id FROM reviews WHERE platform = 'google' AND review_id = $1`,
    [reviewId]
  );
  if (existing.rows.length > 0) return false;

  await query(
    `INSERT INTO reviews (restaurant_id, platform, review_id, author, rating, text, review_date, metadata)
     VALUES ($1, 'google', $2, $3, $4, $5, $6, $7)`,
    [
      restaurantId,
      reviewId,
      review.reviewer?.displayName || 'Anonymous',
      STAR_MAP[review.starRating] || 0,
      review.comment || '',
      review.createTime,
      JSON.stringify({
        googleReviewName: review.name,
        profilePhoto: review.reviewer?.profilePhotoUrl,
        updateTime: review.updateTime,
        hasReply: !!review.reviewReply,
        existingReply: review.reviewReply?.comment,
      }),
    ]
  );

  return true;
}

/**
 * Post a reply to a Google review.
 */
export async function postReply(
  restaurantId: string,
  reviewResourceName: string, // Full resource name: accounts/X/locations/Y/reviews/Z
  replyText: string
): Promise<{ success: boolean; error?: string }> {
  const accessToken = await getValidAccessToken(restaurantId);
  if (!accessToken) {
    return { success: false, error: 'No valid Google access token. Owner must re-authorize.' };
  }

  const url = `${GBP_BASE}/${reviewResourceName}/reply`;

  console.log(`📤 [GBP] Posting reply to ${reviewResourceName}`);

  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ comment: replyText }),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error(`❌ [GBP] Reply failed ${response.status}: ${errText}`);

    if (response.status === 401) {
      return { success: false, error: 'Authentication failed. Token may be expired or revoked.' };
    }
    if (response.status === 403) {
      return { success: false, error: 'Permission denied. Account may not have management access to this location.' };
    }
    return { success: false, error: `Google API error ${response.status}: ${errText}` };
  }

  const data = await response.json() as any;
  console.log(`✅ [GBP] Reply posted successfully to ${reviewResourceName}`);
  return { success: true };
}
