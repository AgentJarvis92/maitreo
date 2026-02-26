/**
 * Review Polling Service
 * Monitors Google Business Profile reviews every 5-10 minutes
 * Detects new reviews, classifies sentiment, triggers SMS alerts
 */

const { createClient } = require('@supabase/supabase-js');
const { google } = require('googleapis');
const crypto = require('crypto');

// Initialize Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Encryption key for OAuth tokens (32 bytes for AES-256)
const ENCRYPTION_KEY = Buffer.from(process.env.TOKEN_ENCRYPTION_KEY, 'hex');
const ALGORITHM = 'aes-256-gcm';

/**
 * Decrypt OAuth refresh token
 */
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
 * https://developers.google.com/my-business/reference/rest/v4/accounts.locations.reviews/list
 */
async function fetchGoogleReviews(accessToken, locationName) {
  const mybusiness = google.mybusinessaccountmanagement({ version: 'v1', auth: accessToken });
  
  try {
    // List reviews for the location
    const response = await mybusiness.accounts.locations.reviews.list({
      parent: locationName, // Format: accounts/{accountId}/locations/{locationId}
      pageSize: 50, // Max reviews per request
      orderBy: 'updateTime desc' // Newest first
    });

    return response.data.reviews || [];
  } catch (error) {
    console.error(`Error fetching reviews for ${locationName}:`, error.message);
    throw error;
  }
}

/**
 * Classify review sentiment (positive/negative)
 * Simple heuristic: 4-5 stars = positive, 1-3 stars = negative
 */
function classifySentiment(rating) {
  return rating >= 4 ? 'positive' : 'negative';
}

/**
 * Check for new reviews for a single restaurant
 */
async function pollRestaurantReviews(restaurant) {
  console.log(`[${restaurant.business_name}] Starting review poll...`);

  try {
    // Get fresh access token
    const accessToken = await getAccessToken(restaurant.google_refresh_token);

    // Fetch reviews from Google
    const reviews = await fetchGoogleReviews(accessToken, restaurant.google_location_name);

    if (!reviews || reviews.length === 0) {
      console.log(`[${restaurant.business_name}] No reviews found`);
      return { newReviews: 0 };
    }

    // Get last known review timestamp
    const { data: lastReview } = await supabase
      .from('reviews')
      .select('google_review_id, create_time')
      .eq('restaurant_id', restaurant.id)
      .order('create_time', { ascending: false })
      .limit(1)
      .single();

    const lastKnownTime = lastReview ? new Date(lastReview.create_time) : new Date(0);
    const newReviews = [];

    // Process each review
    for (const review of reviews) {
      const reviewTime = new Date(review.createTime);
      
      // Skip if we've already seen this review
      if (reviewTime <= lastKnownTime) continue;

      const sentiment = classifySentiment(review.starRating);
      
      // Store in database
      const { data: storedReview, error } = await supabase
        .from('reviews')
        .insert({
          restaurant_id: restaurant.id,
          google_review_id: review.name,
          reviewer_name: review.reviewer?.displayName || 'Anonymous',
          rating: review.starRating,
          comment: review.comment || '',
          sentiment: sentiment,
          create_time: review.createTime,
          update_time: review.updateTime,
          status: sentiment === 'negative' ? 'pending_review' : 'auto_approved'
        })
        .select()
        .single();

      if (error) {
        console.error(`Error storing review:`, error);
        continue;
      }

      newReviews.push(storedReview);

      // Trigger SMS alert for negative reviews
      if (sentiment === 'negative') {
        await sendNegativeReviewAlert(restaurant, storedReview);
      }
    }

    console.log(`[${restaurant.business_name}] Found ${newReviews.length} new review(s)`);

    // Update last poll timestamp
    await supabase
      .from('restaurants')
      .update({ last_polled_at: new Date().toISOString() })
      .eq('id', restaurant.id);

    return { newReviews: newReviews.length };

  } catch (error) {
    console.error(`[${restaurant.business_name}] Poll failed:`, error.message);
    
    // Log error to database
    await supabase
      .from('restaurants')
      .update({ 
        last_error: error.message,
        last_polled_at: new Date().toISOString()
      })
      .eq('id', restaurant.id);

    return { error: error.message };
  }
}

/**
 * Send SMS alert for negative review
 */
async function sendNegativeReviewAlert(restaurant, review) {
  const twilio = require('twilio')(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN
  );

  const message = [
    `⚠️ NEW REVIEW (${review.rating}⭐)`,
    ``,
    `"${review.comment}"`,
    ``,
    `– ${review.reviewer_name}`,
    ``,
    `Reply APPROVE to post AI response`,
    `Reply EDIT to customize response`,
    `Reply IGNORE to skip`
  ].join('\n');

  try {
    await twilio.messages.create({
      body: message,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: restaurant.owner_phone
    });

    console.log(`[${restaurant.business_name}] SMS alert sent for review ${review.id}`);
  } catch (error) {
    console.error(`[${restaurant.business_name}] Failed to send SMS:`, error.message);
  }
}

/**
 * Poll all active restaurants
 */
async function pollAllRestaurants() {
  console.log('\n=== Starting Review Poll Cycle ===');
  console.log(`Time: ${new Date().toISOString()}`);

  // Fetch all active restaurants with Google connected
  const { data: restaurants, error } = await supabase
    .from('restaurants')
    .select('*')
    .eq('status', 'active')
    .not('google_refresh_token', 'is', null);

  if (error) {
    console.error('Error fetching restaurants:', error);
    return;
  }

  if (!restaurants || restaurants.length === 0) {
    console.log('No active restaurants found');
    return;
  }

  console.log(`Polling ${restaurants.length} restaurant(s)...`);

  // Poll each restaurant
  const results = await Promise.allSettled(
    restaurants.map(restaurant => pollRestaurantReviews(restaurant))
  );

  // Summary
  const successful = results.filter(r => r.status === 'fulfilled').length;
  const failed = results.filter(r => r.status === 'rejected').length;
  const totalNew = results
    .filter(r => r.status === 'fulfilled')
    .reduce((sum, r) => sum + (r.value.newReviews || 0), 0);

  console.log('\n=== Poll Cycle Complete ===');
  console.log(`Success: ${successful}, Failed: ${failed}, New Reviews: ${totalNew}`);
}

/**
 * Start polling service (runs every 5 minutes)
 */
function startPollingService() {
  const POLL_INTERVAL = 5 * 60 * 1000; // 5 minutes in milliseconds

  console.log('🚀 Review Polling Service Started');
  console.log(`Polling interval: ${POLL_INTERVAL / 1000}s (${POLL_INTERVAL / 60000} minutes)`);

  // Initial poll
  pollAllRestaurants();

  // Set up recurring poll
  setInterval(() => {
    pollAllRestaurants();
  }, POLL_INTERVAL);
}

// Export functions
module.exports = {
  pollAllRestaurants,
  pollRestaurantReviews,
  startPollingService
};

// Run if called directly
if (require.main === module) {
  startPollingService();
}
