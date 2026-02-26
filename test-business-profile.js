require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { google } = require('googleapis');
const crypto = require('crypto');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

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

async function testBusinessProfile() {
  console.log('🔍 Testing Google Business Profile API...\n');
  
  // 1. Get the test customer
  const { data: customer, error: fetchError } = await supabase
    .from('customers')
    .select('*')
    .eq('session_id', 'test_kevin_1')
    .single();
  
  if (fetchError || !customer) {
    console.error('❌ Customer not found:', fetchError);
    return;
  }
  
  console.log(`✅ Found customer: ${customer.google_email}`);
  
  if (!customer.google_refresh_token_encrypted) {
    console.error('❌ No refresh token stored');
    return;
  }
  
  // 2. Decrypt refresh token
  const refreshToken = decryptToken(customer.google_refresh_token_encrypted);
  console.log('✅ Refresh token decrypted\n');
  
  // 3. Create OAuth client and set credentials
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
  
  oauth2Client.setCredentials({
    refresh_token: refreshToken
  });
  
  // 4. Get new access token
  const { credentials } = await oauth2Client.refreshAccessToken();
  oauth2Client.setCredentials(credentials);
  console.log('✅ Access token refreshed\n');
  
  // 5. Call Business Profile API - List accounts
  try {
    console.log('📋 Fetching Business Profile accounts...\n');
    
    const mybusiness = google.mybusinessaccountmanagement({ 
      version: 'v1', 
      auth: oauth2Client 
    });
    
    const accountsResponse = await mybusiness.accounts.list();
    const accounts = accountsResponse.data.accounts || [];
    
    if (accounts.length === 0) {
      console.log('⚠️  No Business Profile accounts found.');
      console.log('   Make sure you created the business at https://business.google.com\n');
      return;
    }
    
    console.log(`✅ Found ${accounts.length} Business Profile account(s):\n`);
    
    for (const account of accounts) {
      console.log(`📍 Account: ${account.accountName || account.name}`);
      console.log(`   ID: ${account.name}\n`);
      
      // 6. List locations for this account
      try {
        const mybusinessinfo = google.mybusinessbusinessinformation({
          version: 'v1',
          auth: oauth2Client
        });
        
        const locationsResponse = await mybusinessinfo.accounts.locations.list({
          parent: account.name,
          readMask: 'name,title,storeCode'
        });
        
        const locations = locationsResponse.data.locations || [];
        
        if (locations.length === 0) {
          console.log('   ⚠️  No locations found for this account\n');
          continue;
        }
        
        console.log(`   ✅ Found ${locations.length} location(s):\n`);
        
        for (const location of locations) {
          console.log(`   📍 ${location.title || 'Unnamed Location'}`);
          console.log(`      ID: ${location.name}\n`);
        }
      } catch (locErr) {
        console.error('   ❌ Error fetching locations:', locErr.message);
      }
    }
    
    console.log('\n🎉 Business Profile API test successful!');
    console.log('✅ OAuth working');
    console.log('✅ Token refresh working');
    console.log('✅ Business Profile API accessible\n');
    
  } catch (error) {
    console.error('❌ Error calling Business Profile API:');
    console.error('   Message:', error.message);
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Data:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

testBusinessProfile().catch(console.error);
