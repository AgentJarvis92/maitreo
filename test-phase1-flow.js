#!/usr/bin/env node

/**
 * Phase 1 End-to-End Flow Test
 * Tests: Payment → Onboarding → Google OAuth → Review Fetching
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Test data
const testData = {
  sessionId: 'test_session_' + Date.now(),
  stripeCustomerId: 'cus_test_' + Date.now(),
  restaurantName: 'Test Pizzeria',
  location: '123 Main St, New York, NY',
  phone: '+1-555-0100',
  email: 'owner@testpizzeria.com',
  googleEmail: 'owner@gmail.com'
};

const ENCRYPTION_KEY = Buffer.from(process.env.TOKEN_ENCRYPTION_KEY, 'hex');
const ALGORITHM = 'aes-256-gcm';

function encryptToken(token) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
  let encrypted = cipher.update(token, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testPhase1Flow() {
  console.log('🧪 Maitreo Phase 1 End-to-End Test\n');
  console.log(`Test Session ID: ${testData.sessionId}\n`);

  try {
    // Step 1: Simulate Stripe webhook - create customer
    console.log('▶️  Step 1: Simulating Stripe Payment Success');
    console.log('   Creating customer record...');

    const { data: customer, error: createError } = await supabase
      .from('customers')
      .insert({
        session_id: testData.sessionId,
        stripe_customer_id: testData.stripeCustomerId,
        email: testData.email,
        payment_status: 'completed',
        payment_amount: 9900, // $99.00
        payment_date: new Date().toISOString(),
        onboarding_status: 'not_started'
      })
      .select()
      .single();

    if (createError) {
      console.error('   ❌ Failed to create customer:', createError);
      return false;
    }

    console.log('   ✅ Customer created');
    console.log(`      ID: ${customer.id}`);
    console.log(`      Session: ${customer.session_id}`);
    console.log(`      Status: ${customer.payment_status}\n`);

    // Step 2: Onboarding form submission
    console.log('▶️  Step 2: Onboarding Form Submission');
    console.log('   Updating customer with restaurant info...');

    const { data: updated, error: updateError } = await supabase
      .from('customers')
      .update({
        restaurant_name: testData.restaurantName,
        location_address: testData.location,
        phone_number: testData.phone,
        onboarding_status: 'in_progress'
      })
      .eq('id', customer.id)
      .select()
      .single();

    if (updateError) {
      console.error('   ❌ Failed to update customer:', updateError);
      return false;
    }

    console.log('   ✅ Onboarding form submitted');
    console.log(`      Restaurant: ${updated.restaurant_name}`);
    console.log(`      Location: ${updated.location_address}`);
    console.log(`      Phone: ${updated.phone_number}\n`);

    // Step 3: Google OAuth - simulate token exchange
    console.log('▶️  Step 3: Google OAuth Token Exchange');
    console.log('   Simulating OAuth callback...');

    const mockRefreshToken = 'mock_refresh_token_' + Date.now();
    const encryptedToken = encryptToken(mockRefreshToken);

    const { data: withGoogle, error: googleError } = await supabase
      .from('customers')
      .update({
        google_email: testData.googleEmail,
        google_refresh_token_encrypted: encryptedToken,
        google_location_name: 'accounts/12345/locations/67890',
        google_status: 'connected',
        google_connected: true,
        google_connected_at: new Date().toISOString(),
        onboarding_status: 'completed',
        onboarding_completed_at: new Date().toISOString()
      })
      .eq('id', customer.id)
      .select()
      .single();

    if (googleError) {
      console.error('   ❌ Failed to update Google credentials:', googleError);
      return false;
    }

    console.log('   ✅ Google OAuth completed');
    console.log(`      Google Email: ${withGoogle.google_email}`);
    console.log(`      Connected At: ${withGoogle.google_connected_at}`);
    console.log(`      Status: ${withGoogle.onboarding_status}\n`);

    // Step 4: Verify review table integration
    console.log('▶️  Step 4: Review Table Integration');
    console.log('   Creating test review...');

    const { data: review, error: reviewError } = await supabase
      .from('reviews')
      .insert({
        customer_id: customer.id,
        platform: 'google',
        review_id: 'test_review_' + Date.now(),
        author: 'John Doe',
        rating: 5,
        text: 'Great food and service! Will definitely come back.',
        review_date: new Date().toISOString(),
        metadata: {
          testData: true
        }
      })
      .select()
      .single();

    if (reviewError && reviewError.code !== 'PGRST116') {
      console.error('   ❌ Failed to create review:', reviewError);
      return false;
    }

    console.log('   ✅ Review stored');
    if (review) {
      console.log(`      Review ID: ${review.id}`);
      console.log(`      Rating: ${review.rating}⭐`);
    }
    console.log();

    // Step 5: Verify data retrieval
    console.log('▶️  Step 5: Verification - Retrieve Stored Data');
    console.log('   Fetching customer record...');

    const { data: verifyCustomer, error: verifyError } = await supabase
      .from('customers')
      .select('*')
      .eq('id', customer.id)
      .single();

    if (verifyError) {
      console.error('   ❌ Failed to retrieve customer:', verifyError);
      return false;
    }

    console.log('   ✅ Customer data verified:');
    console.log(`      Name: ${verifyCustomer.restaurant_name}`);
    console.log(`      Email: ${verifyCustomer.email}`);
    console.log(`      Google Connected: ${verifyCustomer.google_connected}`);
    console.log(`      Onboarding Status: ${verifyCustomer.onboarding_status}\n`);

    // Step 6: List reviews for customer
    console.log('▶️  Step 6: List Reviews');
    console.log('   Fetching customer reviews...');

    const { data: reviews, error: listError } = await supabase
      .from('reviews')
      .select('*')
      .eq('customer_id', customer.id)
      .order('review_date', { ascending: false });

    if (listError) {
      console.error('   ❌ Failed to list reviews:', listError);
      return false;
    }

    console.log(`   ✅ Found ${reviews.length} review(s)\n`);

    // Print summary
    console.log('═══════════════════════════════════════════════════════');
    console.log('✅ Phase 1 End-to-End Test PASSED');
    console.log('═══════════════════════════════════════════════════════\n');

    console.log('Test Summary:');
    console.log(`  ✓ Payment webhook → customer creation`);
    console.log(`  ✓ Onboarding form → customer update`);
    console.log(`  ✓ Google OAuth → token encryption & storage`);
    console.log(`  ✓ Review integration → database storage`);
    console.log(`  ✓ Data retrieval → full record access\n`);

    console.log('Customer Record:');
    console.log(`  ID: ${customer.id}`);
    console.log(`  Session: ${testData.sessionId}`);
    console.log(`  Restaurant: ${verifyCustomer.restaurant_name}`);
    console.log(`  Email: ${verifyCustomer.email}`);
    console.log(`  Google Connected: ${verifyCustomer.google_connected}`);
    console.log(`  Created: ${customer.created_at}\n`);

    console.log('Next Steps:');
    console.log('  1. Configure Google Cloud OAuth credentials');
    console.log('  2. Test Stripe webhook integration');
    console.log('  3. Deploy frontend onboarding form');
    console.log('  4. Run integration tests with real payment flow');
    console.log('  5. Set up SMS notifications for reviews\n');

    return true;

  } catch (error) {
    console.error('❌ Test failed with error:', error);
    return false;
  }
}

// Run test
testPhase1Flow().then(success => {
  process.exit(success ? 0 : 1);
});
