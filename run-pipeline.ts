#!/usr/bin/env ts-node
/**
 * Maitreo Pipeline Runner
 * Fetches reviews for a restaurant and processes them through the pipeline
 */

import dotenv from 'dotenv';
dotenv.config();

import { supabase } from './src/services/database.js';
import { processNewReviews } from './src/services/reviewProcessor.js';
import type { Review, Restaurant } from './src/types/models.js';

// Joe's Pizza test restaurant
const JOES_PIZZA_PLACE_ID = 'ChIJifIePKtZwokRVZ-UdRGkZzs';

async function fetchGoogleReviews(placeId: string): Promise<any[]> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) throw new Error('Missing GOOGLE_PLACES_API_KEY');

  console.log(`\n📍 Fetching reviews for place: ${placeId}`);
  
  const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=name,rating,reviews&key=${apiKey}`;
  const response = await fetch(url);
  const data = await response.json();

  if (data.status !== 'OK') {
    throw new Error(`Google Places API error: ${data.status}`);
  }

  const reviews = data.result?.reviews || [];
  console.log(`✅ Found ${reviews.length} reviews`);
  return reviews;
}

async function getOrCreateRestaurant(): Promise<Restaurant> {
  // Check if restaurant exists
  const { data: existing } = await supabase
    .from('restaurants')
    .select('*')
    .eq('google_place_id', JOES_PIZZA_PLACE_ID)
    .single();

  if (existing) {
    console.log(`\n🍕 Found existing restaurant: ${existing.name} (ID: ${existing.id})`);
    return existing as Restaurant;
  }

  // Create new restaurant
  console.log(`\n🆕 Creating new restaurant entry...`);
  const { data: restaurant, error } = await supabase
    .from('restaurants')
    .insert({
      name: "Joe's Pizza",
      google_place_id: JOES_PIZZA_PLACE_ID,
      owner_phone: '+18622901319', // Kevin's phone for testing
      location: 'New York, NY',
      tone_profile_json: {
        tone: 'friendly',
        personality: ['warm', 'authentic', 'NYC-style'],
        avoid: ['corporate', 'overly formal'],
        emphasis: ['quality ingredients', 'family recipes'],
      },
    })
    .select()
    .single();

  if (error) throw error;
  console.log(`✅ Created restaurant: ${restaurant.name} (ID: ${restaurant.id})`);
  return restaurant as Restaurant;
}

async function syncReviewsToDatabase(googleReviews: any[], restaurantId: string): Promise<Review[]> {
  console.log(`\n💾 Syncing ${googleReviews.length} reviews to database...`);
  
  const reviews: Review[] = [];
  let newCount = 0;
  let skipCount = 0;

  for (const gReview of googleReviews) {
    // Check if review already exists
    const { data: existing } = await supabase
      .from('reviews')
      .select('id')
      .eq('restaurant_id', restaurantId)
      .eq('review_id', gReview.time.toString())
      .single();

    if (existing) {
      skipCount++;
      continue;
    }

    // Insert new review
    const { data: review, error } = await supabase
      .from('reviews')
      .insert({
        restaurant_id: restaurantId,
        platform: 'google',
        review_id: gReview.time.toString(),
        author: gReview.author_name,
        rating: gReview.rating,
        text: gReview.text,
        published_at: new Date(gReview.time * 1000).toISOString(),
      })
      .select()
      .single();

    if (!error && review) {
      reviews.push(review as Review);
      newCount++;
    }
  }

  console.log(`✅ Synced: ${newCount} new, ${skipCount} duplicates`);
  return reviews;
}

async function main() {
  console.log('═══════════════════════════════════');
  console.log('   Maitreo Pipeline Runner    ');
  console.log('═══════════════════════════════════');

  try {
    // 1. Get or create restaurant
    const restaurant = await getOrCreateRestaurant();

    // 2. Fetch reviews from Google
    const googleReviews = await fetchGoogleReviews(JOES_PIZZA_PLACE_ID);

    // 3. Sync to database
    const newReviews = await syncReviewsToDatabase(googleReviews, restaurant.id);

    if (newReviews.length === 0) {
      console.log('\n⚠️  No new reviews to process (all already synced)');
      
      // Get recent unprocessed reviews
      const { data: unprocessed } = await supabase
        .from('reviews')
        .select('*')
        .eq('restaurant_id', restaurant.id)
        .is('sentiment', null)
        .limit(5);

      if (unprocessed && unprocessed.length > 0) {
        console.log(`\n📋 Processing ${unprocessed.length} previously unprocessed reviews...`);
        const results = await processNewReviews(unprocessed as Review[], restaurant);
        console.log('\n📊 Processing Results:');
        results.forEach((r, i) => {
          console.log(`  ${i + 1}. Review ${r.reviewId.slice(0, 8)}: ${r.sentiment} → ${r.action}`);
        });
      } else {
        console.log('\n✅ All reviews already processed!');
      }
      
      return;
    }

    // 4. Process new reviews through pipeline
    console.log(`\n⚙️  Processing ${newReviews.length} reviews through pipeline...`);
    const results = await processNewReviews(newReviews, restaurant);

    // 5. Summary
    console.log('\n═══ PIPELINE SUMMARY ═══');
    const autoPosted = results.filter(r => r.action === 'auto_posted').length;
    const smsApproval = results.filter(r => r.action === 'sms_approval').length;
    const errors = results.filter(r => r.action === 'error').length;

    console.log(`✅ Auto-posted (positive): ${autoPosted}`);
    console.log(`📱 SMS approval sent (negative): ${smsApproval}`);
    console.log(`❌ Errors: ${errors}`);

    console.log('\n📋 Details:');
    results.forEach((r, i) => {
      console.log(`  ${i + 1}. ${r.sentiment} → ${r.action} ${r.draftId ? `(draft: ${r.draftId.slice(0, 8)})` : ''}`);
    });

    console.log('\n✅ Pipeline run complete!');

  } catch (error) {
    console.error('\n❌ Pipeline error:', error);
    process.exit(1);
  }
}

main();
