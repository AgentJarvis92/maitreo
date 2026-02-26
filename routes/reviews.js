/**
 * Reviews Routes
 * - GET /api/reviews/fetch/:sessionId - Manual trigger to fetch reviews
 * - GET /api/reviews/list/:sessionId - List fetched reviews for a customer
 */

const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const { google } = require('googleapis');
const crypto = require('crypto');

// Initialize Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Encryption/decryption for tokens
const ENCRYPTION_KEY = Buffer.from(process.env.TOKEN_ENCRYPTION_KEY, 'hex');
const ALGORITHM = 'aes-256-gcm';

function decryptToken(encryptedData) {
  const parts = encryptedData.split(':');
  const iv = Buffer.from(parts[0], 'hex');
  const authTag = Buffer.from(parts[1], 'hex');
  const encrypted = Buffer.from(parts[2], 'hex');
  
  const decipher = crypto.createDecipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
  decipher.setAuthTag(authTag);
  
  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final()
  ]);
  
  return decrypted.toString('utf8');
}

/**
 * Get fresh access token from refresh token
 */
async function getAccessToken(encryptedRefreshToken) {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );

  const refreshToken = decryptToken(encryptedRefreshToken);
  oauth2Client.setCredentials({ refresh_token: refreshToken });

  const { credentials } = await oauth2Client.refreshAccessToken();
  return credentials.access_token;
}

/**
 * Convert Google's StarRating enum to a numeric value
 */
function starRatingToNumber(starRating) {
  const map = {
    'ONE': 1,
    'TWO': 2,
    'THREE': 3,
    'FOUR': 4,
    'FIVE': 5
  };
  return map[starRating] || 0;
}

/**
 * Fetch reviews from Google Business Profile API
 * Uses: GET https://mybusiness.googleapis.com/v4/{parent}/reviews
 * @param {string} accessToken - Valid OAuth access token
 * @param {string} locationName - Format: accounts/{accountId}/locations/{locationId}
 * @param {string} [pageToken] - Token for pagination
 * @returns {Object} { reviews, averageRating, totalReviewCount, nextPageToken }
 */
async function fetchGoogleReviews(accessToken, locationName, pageToken = null) {
  const baseUrl = `https://mybusiness.googleapis.com/v4/${locationName}/reviews`;
  const params = new URLSearchParams({
    pageSize: '50',
    orderBy: 'updateTime desc'
  });
  if (pageToken) {
    params.set('pageToken', pageToken);
  }

  const url = `${baseUrl}?${params.toString()}`;
  console.log(`Fetching reviews from: ${url}`);

  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error(`Google API error ${response.status}:`, errorBody);
    
    let parsed;
    try { parsed = JSON.parse(errorBody); } catch (_) {}
    
    const error = new Error(
      parsed?.error?.message || `Google API returned ${response.status}`
    );
    error.status = response.status;
    error.googleError = parsed?.error;
    throw error;
  }

  const data = await response.json();
  return {
    reviews: (data.reviews || []).map(review => ({
      name: review.name,
      reviewId: review.reviewId,
      reviewer: review.reviewer,
      starRating: starRatingToNumber(review.starRating),
      comment: review.comment || '',
      createTime: review.createTime,
      updateTime: review.updateTime,
      reviewReply: review.reviewReply || null
    })),
    averageRating: data.averageRating || null,
    totalReviewCount: data.totalReviewCount || 0,
    nextPageToken: data.nextPageToken || null
  };
}

/**
 * Fetch ALL reviews across pages
 */
async function fetchAllGoogleReviews(accessToken, locationName) {
  let allReviews = [];
  let pageToken = null;
  let meta = {};

  do {
    const result = await fetchGoogleReviews(accessToken, locationName, pageToken);
    allReviews = allReviews.concat(result.reviews);
    pageToken = result.nextPageToken;
    meta = { averageRating: result.averageRating, totalReviewCount: result.totalReviewCount };
  } while (pageToken);

  return { reviews: allReviews, ...meta };
}

/**
 * GET /api/reviews/fetch/:sessionId
 * Manual trigger to fetch reviews from Google Business Profile
 */
router.get('/fetch/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;

    // Find customer
    const { data: customer, error: findError } = await supabase
      .from('customers')
      .select('id, restaurant_name, google_refresh_token_encrypted, google_location_name')
      .eq('session_id', sessionId)
      .single();

    if (findError || !customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    if (!customer.google_refresh_token_encrypted) {
      return res.status(400).json({ 
        error: 'Google not connected. Please complete onboarding first.' 
      });
    }

    if (!customer.google_location_name) {
      return res.status(400).json({
        error: 'No Google Business location configured. Please set your location in onboarding.'
      });
    }

    // Get fresh access token
    let accessToken;
    try {
      accessToken = await getAccessToken(customer.google_refresh_token_encrypted);
    } catch (tokenError) {
      console.error('Token refresh failed:', tokenError);
      return res.status(401).json({
        error: 'Google token expired or revoked. Please reconnect your Google account.',
        code: 'TOKEN_REFRESH_FAILED'
      });
    }

    // Fetch reviews from Google Business Profile API
    let reviewData;
    try {
      reviewData = await fetchAllGoogleReviews(accessToken, customer.google_location_name);
    } catch (apiError) {
      console.error('Google API error:', apiError);
      if (apiError.status === 401) {
        return res.status(401).json({
          error: 'Google authentication failed. Please reconnect your Google account.',
          code: 'GOOGLE_AUTH_FAILED'
        });
      }
      if (apiError.status === 403) {
        return res.status(403).json({
          error: 'Access denied. Make sure the Google account has access to this business location.',
          code: 'GOOGLE_ACCESS_DENIED'
        });
      }
      if (apiError.status === 404) {
        return res.status(404).json({
          error: 'Business location not found. The location may have been removed or the ID is incorrect.',
          code: 'LOCATION_NOT_FOUND'
        });
      }
      return res.status(502).json({
        error: `Failed to fetch reviews from Google: ${apiError.message}`,
        code: 'GOOGLE_API_ERROR'
      });
    }

    const { reviews, averageRating, totalReviewCount } = reviewData;

    if (!reviews || reviews.length === 0) {
      return res.json({
        success: true,
        message: 'No reviews found for this location',
        reviews: [],
        stats: { averageRating, totalReviewCount }
      });
    }

    // Upsert reviews in database (use review_id as unique key)
    const storedReviews = [];
    const errors = [];

    for (const review of reviews) {
      try {
        const { data: stored, error } = await supabase
          .from('reviews')
          .upsert({
            customer_id: customer.id,
            platform: 'google',
            review_id: review.name,
            author: review.reviewer?.displayName || 'Anonymous',
            rating: review.starRating,
            text: review.comment,
            review_date: review.createTime,
            metadata: {
              googleReviewId: review.name,
              reviewId: review.reviewId,
              updateTime: review.updateTime,
              reviewReply: review.reviewReply
            }
          }, { onConflict: 'review_id' })
          .select()
          .single();

        if (error) {
          errors.push({ review: review.name, error: error.message });
        } else {
          storedReviews.push(stored);
        }
      } catch (error) {
        errors.push({ review: review.name, error: error.message });
      }
    }

    res.json({
      success: true,
      message: `Fetched ${reviews.length} review(s) from Google, stored ${storedReviews.length}`,
      totalFromGoogle: reviews.length,
      stored: storedReviews.length,
      stats: { averageRating, totalReviewCount },
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    console.error('Error fetching reviews:', error);
    res.status(500).json({ error: 'Failed to fetch reviews' });
  }
});

/**
 * GET /api/reviews/list/:sessionId
 * List all reviews stored for a customer
 */
router.get('/list/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { limit = 50, offset = 0 } = req.query;

    // Find customer
    const { data: customer, error: findError } = await supabase
      .from('customers')
      .select('id')
      .eq('session_id', sessionId)
      .single();

    if (findError || !customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    // Fetch reviews for this customer
    const { data: reviews, error: reviewError, count } = await supabase
      .from('reviews')
      .select('*', { count: 'exact' })
      .eq('customer_id', customer.id)
      .order('review_date', { ascending: false })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

    if (reviewError) {
      return res.status(500).json({ error: 'Failed to fetch reviews' });
    }

    // Group by rating
    const reviewsByRating = {
      5: 0,
      4: 0,
      3: 0,
      2: 0,
      1: 0
    };

    reviews.forEach(review => {
      reviewsByRating[review.rating] = (reviewsByRating[review.rating] || 0) + 1;
    });

    res.json({
      success: true,
      totalCount: count,
      limit: parseInt(limit),
      offset: parseInt(offset),
      reviews,
      stats: {
        totalReviews: count,
        byRating: reviewsByRating,
        averageRating: reviews.length > 0
          ? (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(2)
          : 'N/A'
      }
    });
  } catch (error) {
    console.error('Error listing reviews:', error);
    res.status(500).json({ error: 'Failed to list reviews' });
  }
});

/**
 * POST /api/reviews/reply/:reviewId
 * Post a reply to a Google review via the Google Business Profile API
 * 
 * Body: { replyText: string, sessionId: string }
 * 
 * The reviewId param is the internal UUID from our reviews table.
 * The Google review name (accounts/.../reviews/xxx) is stored in review_id or metadata.
 */
router.post('/reply/:reviewId', async (req, res) => {
  try {
    const { reviewId } = req.params;
    const { replyText, sessionId } = req.body;

    // --- Validation ---
    if (!sessionId) {
      return res.status(400).json({ error: 'Missing sessionId' });
    }
    if (!replyText || typeof replyText !== 'string' || replyText.trim().length === 0) {
      return res.status(400).json({ error: 'Reply text is required' });
    }

    const trimmedReply = replyText.trim();

    // Google Business Profile reply max is 4096 characters
    if (trimmedReply.length > 4096) {
      return res.status(400).json({ 
        error: `Reply text too long (${trimmedReply.length} chars). Maximum is 4096 characters.` 
      });
    }

    // --- Find customer ---
    const { data: customer, error: custError } = await supabase
      .from('customers')
      .select('id, google_refresh_token_encrypted, google_location_name')
      .eq('session_id', sessionId)
      .single();

    if (custError || !customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    if (!customer.google_refresh_token_encrypted) {
      return res.status(400).json({ 
        error: 'Google not connected. Please complete onboarding first.' 
      });
    }

    // --- Find review ---
    const { data: review, error: revError } = await supabase
      .from('reviews')
      .select('id, review_id, platform, metadata, customer_id')
      .eq('id', reviewId)
      .single();

    if (revError || !review) {
      return res.status(404).json({ error: 'Review not found' });
    }

    // Verify review belongs to this customer
    if (review.customer_id !== customer.id) {
      return res.status(403).json({ error: 'Review does not belong to this customer' });
    }

    if (review.platform !== 'google') {
      return res.status(400).json({ error: 'Reply posting is only supported for Google reviews' });
    }

    // The Google review resource name (e.g. "accounts/123/locations/456/reviews/abc")
    const googleReviewName = review.review_id;
    if (!googleReviewName || !googleReviewName.includes('/reviews/')) {
      return res.status(400).json({ 
        error: 'Review does not have a valid Google review resource name' 
      });
    }

    // --- Get access token (auto-refreshes from refresh token) ---
    let accessToken;
    try {
      accessToken = await getAccessToken(customer.google_refresh_token_encrypted);
    } catch (tokenError) {
      console.error('Token refresh failed:', tokenError);
      return res.status(401).json({ 
        error: 'Failed to authenticate with Google. The account may need to be reconnected.',
        details: tokenError.message
      });
    }

    // --- Post reply to Google Business Profile API ---
    // API: PUT https://mybusiness.googleapis.com/v4/{reviewName}/reply
    // Body: { "comment": "reply text" }
    const apiUrl = `https://mybusiness.googleapis.com/v4/${googleReviewName}/reply`;

    const googleResponse = await fetch(apiUrl, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ comment: trimmedReply }),
    });

    const googleData = await googleResponse.json().catch(() => ({}));

    if (!googleResponse.ok) {
      console.error('Google API error:', googleResponse.status, googleData);

      // Map common error codes
      const statusMap = {
        400: 'Invalid request to Google API',
        401: 'Google authentication expired. Please reconnect your account.',
        403: 'You do not have permission to reply to this review',
        404: 'Review not found on Google. It may have been deleted.',
        409: 'A reply already exists for this review. Delete it first to post a new one.',
        429: 'Too many requests to Google. Please try again later.',
      };

      return res.status(googleResponse.status >= 500 ? 502 : googleResponse.status).json({
        error: statusMap[googleResponse.status] || `Google API error (${googleResponse.status})`,
        googleError: googleData.error || undefined,
      });
    }

    // --- Update reply_drafts status to 'sent' if a draft exists ---
    await supabase
      .from('reply_drafts')
      .update({ 
        status: 'sent',
        updated_at: new Date().toISOString(),
      })
      .eq('review_id', review.id)
      .eq('status', 'approved');

    // --- Store reply info in review metadata ---
    const updatedMetadata = {
      ...(review.metadata || {}),
      reply: {
        text: trimmedReply,
        postedAt: new Date().toISOString(),
        googleResponse: googleData,
      },
    };

    await supabase
      .from('reviews')
      .update({ metadata: updatedMetadata })
      .eq('id', review.id);

    res.json({
      success: true,
      message: 'Reply posted successfully to Google',
      reviewId: review.id,
      reply: {
        text: trimmedReply,
        postedAt: updatedMetadata.reply.postedAt,
      },
    });

  } catch (error) {
    console.error('Error posting reply:', error);
    res.status(500).json({ error: 'Failed to post reply' });
  }
});

/**
 * DELETE /api/reviews/reply/:reviewId
 * Delete a reply from a Google review
 * 
 * Body: { sessionId: string }
 */
router.delete('/reply/:reviewId', async (req, res) => {
  try {
    const { reviewId } = req.params;
    const { sessionId } = req.body;

    if (!sessionId) {
      return res.status(400).json({ error: 'Missing sessionId' });
    }

    // Find customer
    const { data: customer, error: custError } = await supabase
      .from('customers')
      .select('id, google_refresh_token_encrypted')
      .eq('session_id', sessionId)
      .single();

    if (custError || !customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    if (!customer.google_refresh_token_encrypted) {
      return res.status(400).json({ error: 'Google not connected' });
    }

    // Find review
    const { data: review, error: revError } = await supabase
      .from('reviews')
      .select('id, review_id, platform, metadata, customer_id')
      .eq('id', reviewId)
      .single();

    if (revError || !review) {
      return res.status(404).json({ error: 'Review not found' });
    }

    if (review.customer_id !== customer.id) {
      return res.status(403).json({ error: 'Review does not belong to this customer' });
    }

    if (review.platform !== 'google') {
      return res.status(400).json({ error: 'Only Google reviews supported' });
    }

    const googleReviewName = review.review_id;

    let accessToken;
    try {
      accessToken = await getAccessToken(customer.google_refresh_token_encrypted);
    } catch (tokenError) {
      return res.status(401).json({ error: 'Failed to authenticate with Google' });
    }

    const googleResponse = await fetch(
      `https://mybusiness.googleapis.com/v4/${googleReviewName}/reply`,
      {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${accessToken}` },
      }
    );

    if (!googleResponse.ok && googleResponse.status !== 404) {
      const googleData = await googleResponse.json().catch(() => ({}));
      return res.status(502).json({
        error: `Google API error (${googleResponse.status})`,
        googleError: googleData.error || undefined,
      });
    }

    // Clear reply from metadata
    const updatedMetadata = { ...(review.metadata || {}) };
    delete updatedMetadata.reply;

    await supabase
      .from('reviews')
      .update({ metadata: updatedMetadata })
      .eq('id', review.id);

    res.json({ success: true, message: 'Reply deleted successfully' });

  } catch (error) {
    console.error('Error deleting reply:', error);
    res.status(500).json({ error: 'Failed to delete reply' });
  }
});

module.exports = router;
