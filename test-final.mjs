import { emailService } from './src/services/emailService.js';

const ownerEmail = 'kevin.j.reyes@gmail.com';
const restaurantName = 'Test Restaurant';
const stripePortalUrl = 'https://billing.stripe.com/p/session/test_1234567890';
const unsubscribeUrl = 'https://maitreo.com/email-preferences';

await emailService.sendActivationEmail(ownerEmail, restaurantName, stripePortalUrl, unsubscribeUrl);
console.log('✅ Final test email sent!');
