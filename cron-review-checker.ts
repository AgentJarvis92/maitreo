#!/usr/bin/env tsx
/**
 * Review Checker Cron Job
 * Runs every 15 minutes to check for new reviews and process them
 */

import dotenv from 'dotenv';
dotenv.config();

import { supabase } from './src/services/database.js';
import { fetchPlaceReviews, convertGoogleReview } from './src/services/googlePlacesNew.ts';
import { processNewReviews } from './src/services/reviewProcessor.ts';
import type { Review, Restaurant } from './src/types/models.js';

const LOG_PREFIX = '[ReviewChecker]';

async function checkRestaurant(restaurant: Restaurant): Promise<{
  restaurantId: string;
  restaurantName: string;
  newReviews: number;
  autoPosted: number;
  smsApproval: number;
  errors: number;
}> {
  const placeId = (restaurant as any).google_place_id;
  
  console.log(`${LOG_PREFIX} 🍕 Checking: ${restaurant.name} (${placeId})`);

  try {
    // 1. Fetch from Google
    const placeData = await fetchPlaceReviews(placeId);
    
    if (!placeData.reviews || placeData.reviews.length === 0) {
      console.log(`${LOG_PREFIX}    No reviews available`);
      return {
        restaurantId: restaurant.id,
        restaurantName: restaurant.name,
        newReviews: 0,
        autoPosted: 0,
        smsApproval: 0,
        errors: 0,
      };
    }

    // 2. Sync to database (skip duplicates)
    const newReviews: Review[] = [];
    
    for (const gReview of placeData.reviews) {
      const reviewData = convertGoogleReview(gReview, restaurant.id);
      
      // Check for duplicate
      const { data: existing } = await supabase
        .from('reviews')
        .select('id')
        .eq('review_id', reviewData.review_id)
        .single();

      if (existing) continue;

      // Insert new review
      const { data: review, error } = await supabase
        .from('reviews')
        .insert(reviewData)
        .select()
        .single();

      if (!error && review) {
        newReviews.push(review as Review);
      }
    }

    console.log(`${LOG_PREFIX}    Found ${placeData.reviews.length} reviews, ${newReviews.length} new`);

    if (newReviews.length === 0) {
      return {
        restaurantId: restaurant.id,
        restaurantName: restaurant.name,
        newReviews: 0,
        autoPosted: 0,
        smsApproval: 0,
        errors: 0,
      };
    }

    // 3. Process through pipeline
    console.log(`${LOG_PREFIX}    Processing ${newReviews.length} new reviews...`);
    const results = await processNewReviews(newReviews, restaurant);

    // 4. Count results
    const autoPosted = results.filter(r => r.action === 'auto_posted').length;
    const smsApproval = results.filter(r => r.action === 'sms_approval').length;
    const errors = results.filter(r => r.action === 'error').length;

    console.log(`${LOG_PREFIX}    ✅ Processed: ${autoPosted} auto-posted, ${smsApproval} SMS sent, ${errors} errors`);

    return {
      restaurantId: restaurant.id,
      restaurantName: restaurant.name,
      newReviews: newReviews.length,
      autoPosted,
      smsApproval,
      errors,
    };

  } catch (error) {
    console.error(`${LOG_PREFIX}    ❌ Error: ${(error as Error).message}`);
    return {
      restaurantId: restaurant.id,
      restaurantName: restaurant.name,
      newReviews: 0,
      autoPosted: 0,
      smsApproval: 0,
      errors: 1,
    };
  }
}

async function main() {
  const startTime = new Date();
  console.log(`\n${LOG_PREFIX} ═══════════════════════════════════`);
  console.log(`${LOG_PREFIX} Starting review check: ${startTime.toLocaleString()}`);
  console.log(`${LOG_PREFIX} ═══════════════════════════════════\n`);

  try {
    // 1. Get all active restaurants
    const { data: restaurants, error } = await supabase
      .from('restaurants')
      .select('*')
      .not('google_place_id', 'is', null);

    if (error) throw error;

    if (!restaurants || restaurants.length === 0) {
      console.log(`${LOG_PREFIX} ⚠️  No restaurants configured`);
      return;
    }

    console.log(`${LOG_PREFIX} Found ${restaurants.length} restaurant(s) to check\n`);

    // 2. Check each restaurant
    const results = [];
    for (const restaurant of restaurants) {
      const result = await checkRestaurant(restaurant as Restaurant);
      results.push(result);
    }

    // 3. Summary
    const endTime = new Date();
    const duration = ((endTime.getTime() - startTime.getTime()) / 1000).toFixed(2);
    
    console.log(`\n${LOG_PREFIX} ═══════════════════════════════════`);
    console.log(`${LOG_PREFIX} Summary:`);
    console.log(`${LOG_PREFIX}   Duration: ${duration}s`);
    console.log(`${LOG_PREFIX}   Restaurants checked: ${results.length}`);
    console.log(`${LOG_PREFIX}   Total new reviews: ${results.reduce((sum, r) => sum + r.newReviews, 0)}`);
    console.log(`${LOG_PREFIX}   Auto-posted: ${results.reduce((sum, r) => sum + r.autoPosted, 0)}`);
    console.log(`${LOG_PREFIX}   SMS approvals: ${results.reduce((sum, r) => sum + r.smsApproval, 0)}`);
    console.log(`${LOG_PREFIX}   Errors: ${results.reduce((sum, r) => sum + r.errors, 0)}`);
    console.log(`${LOG_PREFIX} ═══════════════════════════════════\n`);

    // 4. Log to database (optional)
    await supabase.from('cron_logs').insert({
      job_name: 'review_checker',
      started_at: startTime.toISOString(),
      completed_at: endTime.toISOString(),
      duration_seconds: parseFloat(duration),
      restaurants_checked: results.length,
      new_reviews: results.reduce((sum, r) => sum + r.newReviews, 0),
      auto_posted: results.reduce((sum, r) => sum + r.autoPosted, 0),
      sms_sent: results.reduce((sum, r) => sum + r.smsApproval, 0),
      errors: results.reduce((sum, r) => sum + r.errors, 0),
      details: results,
    }).then(({ error }) => {
      if (error) console.error(`${LOG_PREFIX} Failed to log to database:`, error.message);
    });

  } catch (error) {
    console.error(`\n${LOG_PREFIX} ❌ Fatal error:`, error);
    process.exit(1);
  }
}

main();
