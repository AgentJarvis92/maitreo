/**
 * Test script for activation email.
 * Imports directly from EmailService — always reflects production HTML.
 * Usage: RESEND_KEY=$(security find-generic-password -s "Resend" -w) && npx tsx test-activation-email.mjs "$RESEND_KEY"
 */

const apiKey = process.argv[2];
if (!apiKey) {
  console.error('Usage: npx tsx test-activation-email.mjs <resend_api_key>');
  process.exit(1);
}

// Set before lazy Resend init inside EmailService
process.env.RESEND_API_KEY = apiKey;

const { emailService } = await import('./src/services/emailService.js');

try {
  await emailService.sendActivationEmail(
    'kevin.j.reyes@gmail.com',
    'Test Restaurant',
    'https://billing.stripe.com/p/session/test_1234567890',
    'https://maitreo.com/unsubscribe?r=test'
  );
  console.log('✅ Activation email sent successfully!');
} catch (error) {
  console.error('❌ Failed to send:', error);
  process.exit(1);
}
