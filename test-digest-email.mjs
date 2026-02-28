/**
 * Test script for weekly digest email.
 * Imports renderDigestEmail directly — always reflects production output.
 * Usage: RESEND_KEY=$(security find-generic-password -s "Resend" -w) && npx tsx test-digest-email.mjs "$RESEND_KEY" [recipient@email.com]
 */

const apiKey = process.argv[2];
const recipient = process.argv[3] || 'kevin.j.reyes@gmail.com';

if (!apiKey) {
  console.error('Usage: npx tsx test-digest-email.mjs <resend_api_key> [recipient]');
  process.exit(1);
}

process.env.RESEND_API_KEY = apiKey;

import { Resend } from 'resend';
const resend = new Resend(apiKey);

const { renderDigestEmail } = await import('./src/jobs/weeklyDigest.js');

const periodStart = new Date('2026-02-23T05:00:00.000Z'); // Sun Feb 23 00:00 ET
const periodEnd   = new Date('2026-03-02T04:59:59.000Z'); // Sat Mar 1  23:59 ET

try {
  const html = await renderDigestEmail({
    restaurant: { id: 'test', name: 'Trattoria Roma', timezone: 'America/New_York' },
    curr:    { reviewCount: 22, avgRating: 4.7, positiveCount: 18, negativeCount: 4, responseRate: 91 },
    deltas:  { reviewCountDeltaPct: 15, avgRatingDelta: 0.2, responseRateDelta: 4 },
    riskSignals: [
      '3 reviews below 3 stars this week',
      '2 reviews awaiting a reply',
      'Response rate dipped under 90%',
    ],
    patterns: [
      { dot: '#6fcf97', text: 'Guests consistently praise the wood-fired pizza and attentive staff service.' },
      { dot: '#6fcf97', text: 'Ambiance and romantic setting frequently mentioned in 5-star reviews.' },
      { dot: '#dc2626', text: 'Wait times at peak hours are a recurring complaint in recent reviews.' },
      { dot: '#b8860b', text: 'Some guests mention inconsistent portion sizes across visits.' },
    ],
    autoMovers: {
      positive: { name: 'Bella Napoli Ristorante', metric: '+18 reviews', note: '↑ trending up', score: 20 },
      negative: { name: 'Pizza Express Downtown',  metric: '4.2 → 3.9',   note: '↓ slipping',   score: -5 },
    },
    competitorMovers: {
      positive: { name: 'Osteria del Sole',   metric: '+12 reviews', note: '↑ active month', score: 12 },
      negative: { name: 'The Corner Bistro',  metric: '4.5 → 4.1',  note: '↓ rating drop',  score: -8 },
    },
    actions: [
      'Reply to 2 unanswered reviews',
      'Audit peak-hour wait times',
      "Lean into what's working: wood-fired pizza",
    ],
    needsAttentionText: 'Guest left 2 stars mentioning cold food and a 45-minute wait. No reply yet.',
    periodStart,
    periodEnd,
    manageSubscriptionUrl: 'https://billing.stripe.com/p/session/test_1234567890',
    unsubscribeUrl:        'https://maitreo.com/unsubscribe?r=test',
  });

  const bytes = Buffer.byteLength(html, 'utf8');
  console.log(`📏 Rendered digest: ${bytes} bytes (${(bytes / 1024).toFixed(1)} KB)`);

  const { data, error } = await resend.emails.send({
    from: 'digest@maitreo.com',
    to: recipient,
    subject: 'Your Weekly Reputation Digest — Feb 23–Mar 1',
    html,
  });

  if (error) throw error;
  console.log(`✅ Digest email sent to ${recipient} (id: ${data?.id})`);
} catch (error) {
  console.error('❌ Failed to send:', error);
  process.exit(1);
}
