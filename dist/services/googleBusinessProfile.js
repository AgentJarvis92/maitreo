"use strict";
/**
 * Google Business Profile API Service
 * Fetches reviews and posts replies using authenticated OAuth tokens.
 *
 * This replaces googlePlacesNew.ts for authenticated review operations.
 * The Places API (public, API-key-based) is still used for initial place search.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchLocations = fetchLocations;
exports.fetchReviews = fetchReviews;
exports.postReply = postReply;
const client_js_1 = require("../db/client.js");
const googleOAuth_js_1 = require("./googleOAuth.js");
const GBP_BASE = 'https://mybusiness.googleapis.com/v4';
const STAR_MAP = {
    ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5,
};
/**
 * Fetch all locations for a Google Business account.
 */
async function fetchLocations(restaurantId) {
    const accessToken = await (0, googleOAuth_js_1.getValidAccessToken)(restaurantId);
    if (!accessToken)
        throw new Error('No valid Google access token');
    const accountId = await (0, googleOAuth_js_1.getGoogleAccountId)(restaurantId);
    if (!accountId)
        throw new Error('No Google account ID stored');
    const response = await fetch(`https://mybusinessbusinessinformation.googleapis.com/v1/${accountId}/locations?readMask=name,title,storefrontAddress`, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!response.ok) {
        const err = await response.text();
        console.error(`❌ [GBP] Failed to fetch locations: ${response.status} ${err}`);
        throw new Error(`Failed to fetch locations: ${response.status}`);
    }
    const data = await response.json();
    return data.locations || [];
}
/**
 * Fetch reviews for a specific location via Business Profile API.
 * Stores them in the reviews table, avoiding duplicates.
 */
async function fetchReviews(restaurantId, locationName, // e.g., "locations/123456"
pageSize = 50) {
    const accessToken = await (0, googleOAuth_js_1.getValidAccessToken)(restaurantId);
    if (!accessToken)
        throw new Error('No valid Google access token');
    const accountId = await (0, googleOAuth_js_1.getGoogleAccountId)(restaurantId);
    if (!accountId)
        throw new Error('No Google account ID stored');
    let fetched = 0;
    let newReviews = 0;
    let nextPageToken;
    do {
        const url = new URL(`${GBP_BASE}/${accountId}/${locationName}/reviews`);
        url.searchParams.set('pageSize', String(pageSize));
        if (nextPageToken)
            url.searchParams.set('pageToken', nextPageToken);
        const response = await fetch(url.toString(), {
            headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!response.ok) {
            const err = await response.text();
            console.error(`❌ [GBP] Fetch reviews failed: ${response.status} ${err}`);
            throw new Error(`Failed to fetch reviews: ${response.status}`);
        }
        const data = await response.json();
        const reviews = data.reviews || [];
        nextPageToken = data.nextPageToken;
        for (const review of reviews) {
            fetched++;
            const stored = await storeReview(restaurantId, review);
            if (stored)
                newReviews++;
        }
        console.log(`📥 [GBP] Fetched ${reviews.length} reviews (page), ${newReviews} new so far`);
    } while (nextPageToken);
    console.log(`✅ [GBP] Total: ${fetched} fetched, ${newReviews} new for restaurant ${restaurantId}`);
    return { fetched, newReviews };
}
/**
 * Store a single GBP review in the database. Returns true if new.
 */
async function storeReview(restaurantId, review) {
    var _a, _b, _c;
    const reviewId = review.name; // Unique resource name
    // Check for duplicate
    const existing = await (0, client_js_1.query)(`SELECT id FROM reviews WHERE platform = 'google' AND review_id = $1`, [reviewId]);
    if (existing.rows.length > 0)
        return false;
    await (0, client_js_1.query)(`INSERT INTO reviews (restaurant_id, platform, review_id, author, rating, text, review_date, metadata)
     VALUES ($1, 'google', $2, $3, $4, $5, $6, $7)`, [
        restaurantId,
        reviewId,
        ((_a = review.reviewer) === null || _a === void 0 ? void 0 : _a.displayName) || 'Anonymous',
        STAR_MAP[review.starRating] || 0,
        review.comment || '',
        review.createTime,
        JSON.stringify({
            googleReviewName: review.name,
            profilePhoto: (_b = review.reviewer) === null || _b === void 0 ? void 0 : _b.profilePhotoUrl,
            updateTime: review.updateTime,
            hasReply: !!review.reviewReply,
            existingReply: (_c = review.reviewReply) === null || _c === void 0 ? void 0 : _c.comment,
        }),
    ]);
    return true;
}
/**
 * Post a reply to a Google review.
 */
async function postReply(restaurantId, reviewResourceName, // Full resource name: accounts/X/locations/Y/reviews/Z
replyText) {
    const accessToken = await (0, googleOAuth_js_1.getValidAccessToken)(restaurantId);
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
    const data = await response.json();
    console.log(`✅ [GBP] Reply posted successfully to ${reviewResourceName}`);
    return { success: true };
}
