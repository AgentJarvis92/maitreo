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
 * Fetch reviews from Google Business Profile API
 * Requires: accounts/{accountId}/locations/{locationId} format location name
 * For testing, this will use the sample data structure
 */
async function fetchGoogleReviews(accessToken, locationName) {
  try {
    // Use MyBusiness API with proper scopes
    const myBusiness = google.mybusinessaccountmanagement({ 
      version: 'v1', 
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });

    // For now, return sample data for testing
    // In production, this would hit: GET https://mybusiness.googleapis.com/v4/{parent}/reviews
    console.log(`Fetching reviews for location: ${locationName}`);
    
    return {
      reviews: [
        {
          name: 'accounts/123/locations/456/reviews/review1',
          reviewer: { displayName: 'John Doe' },
          starRating: 5,
          comment: 'Great service and delicious food!',
          createTime: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
          updateTime: new Date().toISOString()
        },
        {
          name: 'accounts/123/locations/456/reviews/review2',
          reviewer: { displayName: 'Jane Smith' },
          starRating: 4,
          comment: 'Good food, but a bit slow on service.',
          createTime: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
          updateTime: new Date().toISOString()
        }
      ],
      message: 'Sample reviews for testing (API integration pending)'
    };
  } catch (error) {
    console.error('Error fetching reviews from Google:', error);
    throw error;
  }
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

    // Get fresh access token
    const accessToken = await getAccessToken(customer.google_refresh_token_encrypted);

    // Fetch reviews from Google
    const { reviews } = await fetchGoogleReviews(
      accessToken, 
      customer.google_location_name
    );

    if (!reviews || reviews.length === 0) {
      return res.json({
        success: true,
        message: 'No reviews found',
        reviews: []
      });
    }

    // Store reviews in database
    const storedReviews = [];
    const errors = [];

    for (const review of reviews) {
      try {
        const { data: stored, error } = await supabase
          .from('reviews')
          .insert({
            restaurant_id: null, // Use customer_id instead (update schema)
            customer_id: customer.id,
            platform: 'google',
            review_id: review.name,
            author: review.reviewer?.displayName || 'Anonymous',
            rating: review.starRating,
            text: review.comment,
            review_date: review.createTime,
            metadata: {
              googleReviewId: review.name,
              updateTime: review.updateTime
            }
          })
          .select()
          .single();

        if (error && error.code !== 'PGRST116') { // Ignore duplicate key errors
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
      message: `Fetched and stored ${storedReviews.length} review(s)`,
      reviews: storedReviews.length,
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

module.exports = router;
