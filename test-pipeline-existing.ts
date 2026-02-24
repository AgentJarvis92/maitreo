#!/usr/bin/env tsx
/**
 * Test Pipeline with Existing Reviews
 * Processes reviews already in the database to demonstrate the pipeline
 */

import dotenv from 'dotenv';
dotenv.config();

import { supabase } from './src/services/database.js';
import { processNewReviews } from './src/services/reviewProcessor.ts';
import type { Review, Restaurant } from './src/types/models.js';

async function main() {
  console.log('═══════════════════════════════════');
  console.log('   Testing Pipeline with Existing  ');
  console.log('   Reviews (No Google Fetch)       ');
  console.log('═══════════════════════════════════');

  try {
    // 1. Get restaurant
    const { data: restaurant, error: restError } = await supabase
      .from('restaurants')
      .select('*')
      .eq('google_place_id', 'ChIJifIePKtZwokRVZ-UdRGkZzs')
      .single();

    if (restError || !restaurant) {
      throw new Error('Restaurant not found in database');
    }

    console.log(`\n🍕 Restaurant: ${restaurant.name}`);
    console.log(`   ID: ${restaurant.id}`);
    console.log(`   Phone: ${(restaurant as any).owner_phone || 'Not set'}`);

    // 2. Get existing reviews (limit to 3 for testing)
    const { data: reviews, error: reviewsError } = await supabase
      .from('reviews')
      .select('*')
      .eq('restaurant_id', restaurant.id)
      .limit(3);

    if (reviewsError || !reviews || reviews.length === 0) {
      throw new Error('No reviews found in database');
    }

    console.log(`\n📋 Found ${reviews.length} reviews to process:\n`);
    reviews.forEach((r, i) => {
      console.log(`   ${i + 1}. ${r.rating}★ - "${(r.text || '').slice(0, 60)}..."`);
    });

    // 3. Process through pipeline
    console.log(`\n⚙️  Processing ${reviews.length} reviews through pipeline...\n`);
    
    const results = await processNewReviews(reviews as Review[], restaurant as Restaurant);

    // 4. Display results
    console.log('\n═══ PIPELINE RESULTS ═══\n');
    
    results.forEach((result, i) => {
      const review = reviews[i];
      console.log(`Review ${i + 1} (${review.rating}★):`);
      console.log(`  Sentiment: ${result.sentiment}`);
      console.log(`  Action: ${result.action}`);
      if (result.draftId) {
        console.log(`  Draft ID: ${result.draftId.slice(0, 8)}...`);
      }
      if (result.error) {
        console.log(`  Error: ${result.error}`);
      }
      console.log('');
    });

    // 5. Check reply drafts
    const { data: drafts } = await supabase
      .from('reply_drafts')
      .select('*')
      .in('review_id', reviews.map(r => r.id));

    console.log(`✅ Created ${drafts?.length || 0} reply drafts\n`);
    
    if (drafts && drafts.length > 0) {
      console.log('Sample Drafts:');
      drafts.slice(0, 2).forEach(draft => {
        console.log(`\n  "${draft.draft_text.slice(0, 120)}..."`);
        console.log(`  Status: ${draft.status}`);
        console.log(`  Escalation: ${draft.escalation_flag ? 'YES' : 'NO'}`);
      });
    }

    console.log('\n✅ Pipeline test complete!');

  } catch (error) {
    console.error('\n❌ Test error:', error);
    process.exit(1);
  }
}

main();
