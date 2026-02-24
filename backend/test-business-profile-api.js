const { google } = require('googleapis');
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
require('dotenv').config({ path: require('path').join(process.env.HOME, 'restaurant-saas/backend/.env') });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

function decryptToken(encrypted) {
  const [ivHex, authTagHex, encryptedHex] = encrypted.split(':');
  const key = Buffer.from(process.env.TOKEN_ENCRYPTION_KEY, 'hex'); // Changed from base64 to hex
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  return decipher.update(encryptedHex, 'hex', 'utf8') + decipher.final('utf8');
}

async function testBusinessProfileAPI() {
  console.log('🔍 Fetching customer data...');
  const { data: customer, error } = await supabase
    .from('customers')
    .select('*')
    .eq('session_id', 'test_kevin_1')
    .single();

  if (error || !customer) {
    console.error('❌ Customer not found:', error?.message);
    return;
  }

  console.log('✅ Customer found:', customer.google_email);
  console.log('🔐 Decrypting refresh token...');
  
  const refreshToken = decryptToken(customer.google_refresh_token_encrypted);
  
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );

  oauth2Client.setCredentials({ refresh_token: refreshToken });

  console.log('🔄 Getting access token...');
  const { token } = await oauth2Client.getAccessToken();
  console.log('✅ Access token obtained');

  // Test 1: List accounts
  console.log('\n📋 TEST 1: Listing Google Business accounts...');
  try {
    const mybusiness = google.mybusinessaccountmanagement({ version: 'v1', auth: oauth2Client });
    const accountsRes = await mybusiness.accounts.list();
    console.log('✅ Accounts found:', accountsRes.data.accounts?.length || 0);
    if (accountsRes.data.accounts) {
      accountsRes.data.accounts.forEach(acc => {
        console.log(`  - ${acc.name} (${acc.accountName})`);
      });
    }

    // Test 2: List locations
    if (accountsRes.data.accounts && accountsRes.data.accounts.length > 0) {
      const accountName = accountsRes.data.accounts[0].name;
      console.log(`\n🏢 TEST 2: Listing locations for ${accountName}...`);
      const mybusinessinfo = google.mybusinessbusinessinformation({ version: 'v1', auth: oauth2Client });
      const locationsRes = await mybusinessinfo.accounts.locations.list({ parent: accountName });
      console.log('✅ Locations found:', locationsRes.data.locations?.length || 0);
      
      if (locationsRes.data.locations) {
        locationsRes.data.locations.forEach(loc => {
          console.log(`  - ${loc.title} (${loc.name})`);
        });

        // Test 3: Fetch reviews
        const locationName = locationsRes.data.locations[0].name;
        console.log(`\n⭐ TEST 3: Fetching reviews for ${locationName}...`);
        try {
          const reviewsRes = await mybusinessinfo.accounts.locations.reviews.list({ parent: locationName });
          console.log('✅ Reviews found:', reviewsRes.data.reviews?.length || 0);
          
          if (reviewsRes.data.reviews) {
            reviewsRes.data.reviews.forEach((review, idx) => {
              console.log(`\n  Review #${idx + 1}:`);
              console.log(`    - Reviewer: ${review.reviewer?.displayName || 'Anonymous'}`);
              console.log(`    - Rating: ${review.starRating}`);
              console.log(`    - Comment: ${review.comment?.substring(0, 100) || '(no comment)'}`);
              console.log(`    - Review ID: ${review.name}`);
              console.log(`    - Has reply: ${review.reviewReply ? 'Yes' : 'No'}`);
            });

            // Test 4: Post a reply to first review WITHOUT existing reply
            const unrepliedReview = reviewsRes.data.reviews.find(r => !r.reviewReply);
            if (unrepliedReview) {
              console.log(`\n💬 TEST 4: Posting test reply to review...`);
              console.log(`   Review ID: ${unrepliedReview.name}`);
              
              const testReply = "Thank you for your feedback! This is a test reply from Maitreo.";
              
              try {
                const replyRes = await mybusinessinfo.accounts.locations.reviews.updateReply({
                  name: unrepliedReview.name,
                  requestBody: {
                    comment: testReply
                  }
                });
                console.log('✅ REPLY POSTED SUCCESSFULLY!');
                console.log('   Response:', replyRes.data);
              } catch (replyError) {
                console.error('❌ Failed to post reply:', replyError.message);
                if (replyError.response) {
                  console.error('   Status:', replyError.response.status);
                  console.error('   Data:', JSON.stringify(replyError.response.data, null, 2));
                }
              }
            } else {
              console.log('\n⚠️  All reviews already have replies - skipping reply test');
            }
          }
        } catch (reviewsError) {
          console.error('❌ Failed to fetch reviews:', reviewsError.message);
          if (reviewsError.response) {
            console.error('   Status:', reviewsError.response.status);
            console.error('   Data:', JSON.stringify(reviewsError.response.data, null, 2));
          }
        }
      }
    }
  } catch (error) {
    console.error('❌ API Error:', error.message);
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Data:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

testBusinessProfileAPI();
