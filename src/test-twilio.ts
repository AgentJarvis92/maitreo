import dotenv from 'dotenv';
dotenv.config();

import { twilioClient } from './sms/twilioClient.js';

async function main() {
  console.log('Twilio configured:', twilioClient.isConfigured);
  console.log('Sending test SMS to +18622901319...');
  
  const result = await twilioClient.sendSms('+18622901319', 
    `🍽️ Maitreo Test\n\nNew 5★ review from Google:\n"FANTASTIC low cost pizza!!! This is my one must hit place in NYC."\n\nAI Reply:\n"Thank you so much! We're thrilled NYC keeps bringing you back to us. Nothing beats sharing great pizza with great people — see you next time! 🍕"\n\nReply YES to post, SKIP to ignore, or type your edit.`
  );
  
  console.log('✅ SMS sent!', result);
}

main().catch(err => {
  console.error('❌ Failed:', err.message);
});
