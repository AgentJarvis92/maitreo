#!/usr/bin/env tsx
/**
 * Test Negative Review SMS Flow
 * Creates a fake 2-star review and processes it to test SMS approval
 */

import dotenv from 'dotenv';
dotenv.config();

import { supabase } from './src/services/database.js';
import { processReview } from './src/services/reviewProcessor.ts';
import type { Review, Restaurant } from './src/types/models.js';

async function main() {
  console.log('═══════════════════════════════════');
  console.log('   Testing Negative Review Flow   ');
  console.log('   (SMS Approval)                  ');
  console.log('═══════════════════════════════════\n');

  try {
    // 1. Get restaurant
    const { data: restaurant } = await supabase
      .from('restaurants')
      .select('*')
      .eq('google_place_id', 'ChIJifIePKtZwokRVZ-UdRGkZzs')
      .single();

    if (!restaurant) throw new Error('Restaurant not found');

    console.log(`🍕 Restaurant: ${restaurant.name}`);
    console.log(`   Owner Phone: ${(restaurant as any).owner_phone}\n`);

    // 2. Create a fake negative review
    const fakeReview: Partial<Review> = {
      restaurant_id: restaurant.id,
      platform: 'google',
      review_id: `test-negative-${Date.now()}`,
      author: 'Test Customer',
      rating: 2,
      text: 'The food was cold and service was really slow. Not impressed at all.',
      review_date: new Date().toISOString(),
    };

    const { data: review, error } = await supabase
      .from('reviews')
      .insert(fakeReview)
      .select()
      .single();

    if (error || !review) throw new Error(`Failed to create test review: ${error?.message || 'Unknown error'}`);

    console.log(`📝 Created test review:`);
    console.log(`   Rating: ${review.rating}★`);
    console.log(`   Text: "${review.text}"\n`);

    // 3. Process through pipeline
    console.log(`⚙️  Processing review...\n`);
    
    const result = await processReview(review as Review, restaurant as Restaurant);

    // 4. Display results
    console.log('\n═══ RESULT ═══');
    console.log(`Sentiment: ${result.sentiment}`);
    console.log(`Action: ${result.action}`);
    
    if (result.draftId) {
      // Fetch the draft
      const { data: draft } = await supabase
        .from('reply_drafts')
        .select('*')
        .eq('id', result.draftId)
        .single();

      if (draft) {
        console.log(`\n📱 Draft Reply (${draft.status}):`);
        console.log(`   "${draft.draft_text}"\n`);
        
        if (draft.escalation_flag) {
          console.log(`⚠️  Escalation: YES`);
          console.log(`   Reasons: ${draft.escalation_reasons?.join(', ')}\n`);
        }
      }
    }

    if (result.action === 'sms_approval') {
      console.log(`✅ SMS sent to ${(restaurant as any).owner_phone}`);
      console.log(`   Check your phone for the approval request!\n`);
    }

    // Clean up - delete test review
    await supabase
      .from('reviews')
      .delete()
      .eq('id', review.id);
    
    console.log(`🧹 Cleaned up test review\n`);
    console.log(`✅ Test complete!`);

  } catch (error) {
    console.error('\n❌ Test error:', error);
    process.exit(1);
  }
}

main();
