/**
 * Test script — sends a mock review alert SMS via the canonical smsService
 */
import { smsService } from '../sms/smsService.js';

const KEVIN_PHONE = '+18622901319';

async function main() {
  console.log('Sending test mock review alert to Kevin...');
  try {
    await smsService.sendMockReviewAlert(KEVIN_PHONE);
    console.log('✅ Test SMS sent!');
  } catch (err) {
    console.error('❌ Failed to send SMS:', err);
  }
}

main();
