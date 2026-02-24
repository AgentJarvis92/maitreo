#!/usr/bin/env tsx
/**
 * Live Test with Real Google Reviews
 * Fetches reviews using the NEW Places API and processes them
 */

import dotenv from 'dotenv';
dotenv.config();

import { supabase } from './src/services/database.js';
import { fetchPlaceReviews, convertGoogleReview } from './src/services/googlePlacesNew.ts';
import { processReview } from './src/services/reviewProcessor.ts';
import type { Review, Restaurant } from './src/types/models.js';

const JOES_PIZZA_PLACE_ID = 'ChIJifIePKtZwokRVZ-UdRGkZzs';

async function main() {
  console.log('═══════════════════════════════════');
  console.log('   Maitreo LIVE TEST           ');
  console.log('   (Real Google Reviews)           ');
  console.log('═══════════════════════════════════\n');

  try {
    // 1. Get restaurant
    const { data: restaurant } = await supabase
      .from('restaurants')
      .select('*')
      .eq('google_place_id', JOES_PIZZA_PLACE_ID)
      .single();

    if (!restaurant) throw new Error('Restaurant not found');

    console.log(`🍕 Restaurant: ${restaurant.name}`);
    console.log(`   Owner: ${(restaurant as any).owner_phone}\n`);

    // 2. Fetch reviews from Google (NEW API)
    console.log(`📍 Fetching reviews from Google Places API (New)...`);
    const placeData = await fetchPlaceReviews(JOES_PIZZA_PLACE_ID);
    
    console.log(`✅ Found place: ${placeData.displayName.text}`);
    console.log(`   Rating: ${placeData.rating}★ (${placeData.userRatingCount} reviews)`);
    console.log(`   Retrieved: ${placeData.reviews?.length || 0} recent reviews\n`);

    if (!placeData.reviews || placeData.reviews.length === 0) {
      console.log('⚠️  No reviews available');
      return;
    }

    // 3. Sync to database (skip duplicates)
    console.log(`💾 Syncing to database...`);
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

      // Insert
      const { data: review, error } = await supabase
        .from('reviews')
        .insert(reviewData)
        .select()
        .single();

      if (!error && review) {
        newReviews.push(review as Review);
      }
    }

    console.log(`   ✅ ${newReviews.length} new, ${placeData.reviews.length - newReviews.length} duplicates\n`);

    if (newReviews.length === 0) {
      console.log('⚠️  No new reviews to process (all already synced)\n');
      console.log('✅ Test complete!');
      return;
    }

    // 4. Process ONE negative review through pipeline (for testing SMS)
    const negativeReview = newReviews.find(r => r.rating <= 3);
    
    if (negativeReview) {
      console.log(`⚙️  Processing negative review (${negativeReview.rating}★) through pipeline...\n`);
      
      const result = await processReview(negativeReview, restaurant as Restaurant);
      
      console.log('═══ RESULT ═══');
      console.log(`Sentiment: ${result.sentiment}`);
      console.log(`Action: ${result.action}\n`);
      
      if (result.draftId) {
        const { data: draft } = await supabase
          .from('reply_drafts')
          .select('*')
          .eq('id', result.draftId)
          .single();

        if (draft) {
          console.log(`📱 Draft Reply:`);
          console.log(`   "${draft.draft_text}"\n`);
        }
      }

      if (result.action === 'sms_approval') {
        console.log(`✅ SMS sent to ${(restaurant as any).owner_phone}`);
        console.log(`   Check your phone! 📱\n`);
      }
    } else {
      console.log(`⚠️  No negative reviews in this batch - all ${newReviews.length} are 4-5★\n`);
    }

    console.log(`✅ Test complete!`);

  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  }
}

main();
