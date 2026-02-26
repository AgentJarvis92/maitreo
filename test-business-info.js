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

async function testBusinessInfo() {
  console.log('🔍 Testing Google Business Profile API (alternative method)...\n');
  
  // Get the test customer
  const { data: customer } = await supabase
    .from('customers')
    .select('*')
    .eq('session_id', 'test_kevin_1')
    .single();
  
  console.log(`✅ Customer: ${customer.google_email}`);
  
  // Decrypt refresh token
  const refreshToken = decryptToken(customer.google_refresh_token_encrypted);
  console.log('✅ Token decrypted\n');
  
  // Create OAuth client
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
  
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  
  // Refresh access token
  const { credentials } = await oauth2Client.refreshAccessToken();
  oauth2Client.setCredentials(credentials);
  console.log('✅ Access token refreshed\n');
  
  // Try to call the API directly via request
  try {
    console.log('📋 Calling Business Profile API via direct request...\n');
    
    const response = await oauth2Client.request({
      url: 'https://mybusinessbusinessinformation.googleapis.com/v1/accounts',
      method: 'GET'
    });
    
    console.log('✅ API Response:');
    console.log(JSON.stringify(response.data, null, 2));
    console.log('\n🎉 Success! OAuth and API access working!\n');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

testBusinessInfo().catch(console.error);
