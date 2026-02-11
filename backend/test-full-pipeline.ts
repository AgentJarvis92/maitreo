/**
 * Full Pipeline Test
 * Tests the complete review processing pipeline end-to-end:
 * 1. Onboard restaurant (Joe's Pizza)
 * 2. Fetch reviews from Google
 * 3. Sync to database
 * 4. Process through pipeline (classify → mock reply → route)
 * 5. Verify SMS sent for negative reviews
 * 6. Check database records
 */

import dotenv from 'dotenv';
dotenv.config();

import { addRestaurant, validatePlaceId } from './src/services/onboarding.js';
import { syncNewReviews } from './src/services/reviewFetcher.js';
import { processNewReviews } from './src/services/reviewProcessor.js';
import { classifyReview, needsApproval } from './src/services/reviewClassifier.js';
import { generatePlaceholderReply } from './src/services/mockReplyGenerator.js';
import { supabase } from './src/services/database.js';
import type { Review } from './src/types/models.js';

const JOES_PIZZA_PLACE_ID = 'ChIJifIePKtZwokRVZ-UdRGkZzs';
const KEVIN_PHONE = '+18622901319';
const KEVIN_EMAIL = 'kevin@reviewreply.app';

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string) {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.log(`  ❌ FAIL: ${label}`);
    failed++;
  }
}

async function testValidatePlaceId() {
  console.log('\n═══ TEST 1: Validate Place ID ═══');
  const details = await validatePlaceId(JOES_PIZZA_PLACE_ID);
  assert(details !== null, 'Place ID is valid');
  assert(details!.name.length > 0, `Name: ${details!.name}`);
  assert(details!.rating > 0, `Rating: ${details!.rating}★`);
  console.log(`  📍 ${details!.name} — ${details!.formattedAddress}`);
}

async function testOnboarding(): Promise<any> {
  console.log('\n═══ TEST 2: Restaurant Onboarding ═══');
  const restaurant = await addRestaurant(JOES_PIZZA_PLACE_ID, KEVIN_PHONE, KEVIN_EMAIL);
  assert(!!restaurant.id, `Restaurant ID: ${restaurant.id}`);
  assert(restaurant.name.length > 0, `Name: ${restaurant.name}`);
  assert((restaurant as any).google_place_id === JOES_PIZZA_PLACE_ID, 'Place ID stored');
  return restaurant;
}

async function testFetchAndSync(restaurantId: string): Promise<Review[]> {
  console.log('\n═══ TEST 3: Fetch & Sync Reviews ═══');
  const result = await syncNewReviews(restaurantId, JOES_PIZZA_PLACE_ID);
  assert(result.total > 0, `Fetched ${result.total} reviews from Google`);
  console.log(`  📥 New: ${result.newReviews}, Duplicates: ${result.duplicates}`);

  // Verify in database
  const { data: dbReviews } = await supabase
    .from('reviews')
    .select('*')
    .eq('restaurant_id', restaurantId);
  
  assert((dbReviews?.length || 0) > 0, `${dbReviews?.length} reviews stored in database`);
  return (dbReviews || []) as Review[];
}

async function testClassification(reviews: Review[]) {
  console.log('\n═══ TEST 4: Review Classification ═══');
  for (const review of reviews.slice(0, 5)) {
    const sentiment = classifyReview(review);
    const approval = needsApproval(review);
    console.log(`  ${review.rating}★ → ${sentiment} | needs approval: ${approval} | "${(review.text || '').slice(0, 50)}..."`);
    assert(
      (review.rating >= 4 && sentiment === 'positive') || (review.rating < 4 && sentiment === 'negative'),
      `Correct classification for ${review.rating}★`
    );
  }
}

async function testMockReplies(reviews: Review[]) {
  console.log('\n═══ TEST 5: Mock Reply Generation ═══');
  for (const review of reviews.slice(0, 3)) {
    const sentiment = classifyReview(review);
    const output = generatePlaceholderReply(review, sentiment);
    assert(output.draft_text.length > 20, `Reply generated (${output.draft_text.length} chars)`);
    assert(typeof output.escalation_flag === 'boolean', `Escalation flag: ${output.escalation_flag}`);
    console.log(`  ${review.rating}★ [${sentiment}] → "${output.draft_text.slice(0, 80)}..."`);
  }
}

async function testFullPipeline(reviews: Review[], restaurant: any) {
  console.log('\n═══ TEST 6: Full Pipeline Processing ═══');

  // Only process reviews that don't have drafts yet
  const { data: existingDrafts } = await supabase
    .from('reply_drafts')
    .select('review_id')
    .in('review_id', reviews.map(r => r.id));
  
  const processedIds = new Set((existingDrafts || []).map((d: any) => d.review_id));
  const unprocessed = reviews.filter(r => !processedIds.has(r.id));

  if (unprocessed.length === 0) {
    console.log('  ⚠️  All reviews already processed, re-syncing...');
    // Delete existing drafts to re-test
    for (const review of reviews.slice(0, 3)) {
      await supabase.from('reply_drafts').delete().eq('review_id', review.id);
    }
  }

  const toProcess = unprocessed.length > 0 ? unprocessed.slice(0, 5) : reviews.slice(0, 3);
  const results = await processNewReviews(toProcess, restaurant);

  assert(results.length > 0, `Processed ${results.length} reviews`);

  let autoPosted = 0;
  let smsApproval = 0;
  let errors = 0;

  for (const r of results) {
    if (r.action === 'auto_posted') autoPosted++;
    if (r.action === 'sms_approval') smsApproval++;
    if (r.action === 'error') errors++;
  }

  console.log(`  📊 Results: ${autoPosted} auto-posted, ${smsApproval} SMS approval, ${errors} errors`);
  assert(errors === 0, 'No processing errors');

  // Verify drafts in database
  const { data: drafts } = await supabase
    .from('reply_drafts')
    .select('*')
    .in('review_id', toProcess.map(r => r.id));
  
  assert((drafts?.length || 0) > 0, `${drafts?.length} drafts created in database`);
}

async function testDatabaseIntegrity(restaurantId: string) {
  console.log('\n═══ TEST 7: Database Integrity ═══');

  const { data: restaurant } = await supabase
    .from('restaurants')
    .select('*')
    .eq('id', restaurantId)
    .single();
  assert(!!restaurant, 'Restaurant record exists');

  const { count: reviewCount } = await supabase
    .from('reviews')
    .select('*', { count: 'exact', head: true })
    .eq('restaurant_id', restaurantId);
  assert((reviewCount || 0) > 0, `${reviewCount} reviews in DB`);

  const { count: draftCount } = await supabase
    .from('reply_drafts')
    .select('*', { count: 'exact', head: true })
    .in('review_id', 
      (await supabase.from('reviews').select('id').eq('restaurant_id', restaurantId)).data?.map((r: any) => r.id) || []
    );
  assert((draftCount || 0) > 0, `${draftCount} reply drafts in DB`);
}

async function main() {
  console.log('🚀 ReviewReply Full Pipeline Test');
  console.log('══════════════════════════════════\n');

  try {
    await testValidatePlaceId();
    const restaurant = await testOnboarding();
    const reviews = await testFetchAndSync(restaurant.id);
    
    if (reviews.length === 0) {
      console.log('\n⚠️  No reviews available to test pipeline. Exiting.');
      process.exit(1);
    }

    await testClassification(reviews);
    await testMockReplies(reviews);
    await testFullPipeline(reviews, restaurant);
    await testDatabaseIntegrity(restaurant.id);

    console.log('\n══════════════════════════════════');
    console.log(`📊 Results: ${passed} passed, ${failed} failed`);
    console.log(failed === 0 ? '✅ ALL TESTS PASSED!' : '❌ SOME TESTS FAILED');
    process.exit(failed > 0 ? 1 : 0);

  } catch (err) {
    console.error('\n💥 Test crashed:', err);
    process.exit(1);
  }
}

main();
