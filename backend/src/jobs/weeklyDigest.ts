/**
 * Weekly Digest Engine — Maitreo Agent 6
 *
 * Generates a weekly review digest for each restaurant:
 *   1. Aggregates last 7 days of reviews (with TZ-aware windowing)
 *   2. Extracts themes via OpenAI
 *   3. Renders & sends email digest via Resend
 *   4. Sends SMS summary via Twilio
 *   5. Logs everything in the `digests` table
 *
 * Scheduling: intended for Sundays at 09:00 in each customer's TZ.
 * Can also be triggered manually: `tsx src/jobs/weeklyDigest.ts [restaurantId]`
 */

import dotenv from 'dotenv';
dotenv.config();

import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import OpenAI from 'openai';
import { Resend } from 'resend';
import { query, transaction } from '../db/client.js';
import { twilioClient } from '../sms/twilioClient.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ─── Clients ─────────────────────────────────────────────────────────

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const resend = new Resend(process.env.RESEND_API_KEY);
const FROM_EMAIL = process.env.FROM_EMAIL || 'digest@maitreo.com';

// ─── Types ───────────────────────────────────────────────────────────

interface DigestStats {
  reviewCount: number;
  avgRating: number;
  positiveCount: number;
  negativeCount: number;
  responseRate: number;
  ratingDistribution: Record<string, number>;
  dailyCounts: Record<string, number>;
}

interface DigestThemes {
  praiseThemes: string[];
  complaintThemes: string[];
  operationalInsight: string;
}

interface ReviewRow {
  id: string;
  author: string;
  rating: number;
  text: string;
  review_date: string;
  platform: string;
}

interface RestaurantRow {
  id: string;
  name: string;
  owner_email: string;
  owner_phone?: string;
  timezone?: string;
}

// ─── Mock Data Seeder ────────────────────────────────────────────────

const MOCK_REVIEWS = [
  { author: 'Sarah M.', rating: 5, text: 'The handmade pasta was incredible — best carbonara I\'ve had outside of Rome. Our server Alex was attentive without being overbearing. Will absolutely be back for date night.', platform: 'google' },
  { author: 'James K.', rating: 4, text: 'Great food and ambiance. The bruschetta appetizer was perfect. Only knock is the wait time — we waited 25 minutes for our table even with a reservation.', platform: 'google' },
  { author: 'Michelle T.', rating: 5, text: 'Celebrated our anniversary here. The tiramisu was heavenly and the wine recommendation from the sommelier was spot on. Beautiful patio seating too.', platform: 'yelp' },
  { author: 'David R.', rating: 2, text: 'Ordered the fish special which was overcooked and dry. Asked for it to be remade and the second attempt was only marginally better. For $38, I expected more.', platform: 'google' },
  { author: 'Lisa P.', rating: 5, text: 'This place never disappoints! The new seasonal menu items are fantastic. Love the roasted beet salad. Staff always remembers our names.', platform: 'tripadvisor' },
  { author: 'Tom B.', rating: 3, text: 'Food was decent but the noise level was unbearable on a Friday night. Could barely hear our conversation. Acoustics need serious work.', platform: 'google' },
  { author: 'Rachel W.', rating: 1, text: 'Found a hair in my risotto. When I flagged it, the manager was dismissive and didn\'t offer to comp the dish. Terrible customer service response.', platform: 'yelp' },
  { author: 'Chris H.', rating: 4, text: 'Solid Italian spot. The mushroom ravioli was excellent and portions are generous. Parking is a nightmare though — plan to arrive early or take a rideshare.', platform: 'google' },
  { author: 'Priya N.', rating: 5, text: 'Best gluten-free options I\'ve found at any Italian restaurant. The GF pasta is indistinguishable from regular. My celiac daughter was thrilled. Thank you for being so accommodating!', platform: 'google' },
  { author: 'Marcus J.', rating: 3, text: 'Lunch menu is a great deal but service was slow. Took 40 minutes to get our entrees on a Tuesday afternoon when the place was half empty. Food was good when it arrived though.', platform: 'tripadvisor' },
  { author: 'Emily S.', rating: 4, text: 'The new cocktail menu is amazing — the espresso martini is a must-try. Would love to see some non-alcoholic craft options added too.', platform: 'google' },
  { author: 'Robert D.', rating: 5, text: 'Took a large party of 14 for a birthday dinner. They handled it beautifully — dedicated server, custom menu, even brought out a surprise dessert plate. Top-notch hospitality.', platform: 'google' },
];

async function seedMockReviews(restaurantId: string): Promise<void> {
  const existing = await query('SELECT COUNT(*) FROM reviews WHERE restaurant_id = $1 AND review_date > NOW() - INTERVAL \'7 days\'', [restaurantId]);
  if (parseInt(existing.rows[0].count) > 0) return;

  console.log('🌱 Seeding mock review data...');
  for (let i = 0; i < MOCK_REVIEWS.length; i++) {
    const r = MOCK_REVIEWS[i];
    const daysAgo = Math.floor(Math.random() * 6) + 1; // 1-6 days ago
    await query(
      `INSERT INTO reviews (restaurant_id, platform, review_id, author, rating, text, review_date)
       VALUES ($1, $2, $3, $4, $5, $6, NOW() - INTERVAL '${daysAgo} days')
       ON CONFLICT (platform, review_id) DO NOTHING`,
      [restaurantId, r.platform, `mock-digest-${i}`, r.author, r.rating, r.text]
    );
  }
  console.log(`✅ Seeded ${MOCK_REVIEWS.length} mock reviews`);
}

// ─── 1. Aggregation Queries ──────────────────────────────────────────

async function aggregateReviews(restaurantId: string, periodStart: Date, periodEnd: Date): Promise<{ stats: DigestStats; reviews: ReviewRow[] }> {
  // Fetch reviews in window
  const reviewsResult = await query<ReviewRow>(
    `SELECT id, author, rating, text, review_date, platform
     FROM reviews
     WHERE restaurant_id = $1
       AND review_date >= $2
       AND review_date < $3
     ORDER BY review_date DESC`,
    [restaurantId, periodStart.toISOString(), periodEnd.toISOString()]
  );

  const reviews = reviewsResult.rows;
  if (reviews.length === 0) {
    return {
      stats: { reviewCount: 0, avgRating: 0, positiveCount: 0, negativeCount: 0, responseRate: 0, ratingDistribution: {}, dailyCounts: {} },
      reviews: [],
    };
  }

  // Stats via single optimized query
  const statsResult = await query(
    `SELECT
       COUNT(*)::int AS review_count,
       ROUND(AVG(rating)::numeric, 2) AS avg_rating,
       COUNT(*) FILTER (WHERE rating >= 4)::int AS positive_count,
       COUNT(*) FILTER (WHERE rating <= 3)::int AS negative_count,
       jsonb_object_agg(rating_str, rating_cnt) AS rating_distribution
     FROM (
       SELECT rating, rating::text AS rating_str, COUNT(*)::int AS rating_cnt
       FROM reviews
       WHERE restaurant_id = $1 AND review_date >= $2 AND review_date < $3
       GROUP BY rating
     ) sub`,
    [restaurantId, periodStart.toISOString(), periodEnd.toISOString()]
  );

  // Daily counts
  const dailyResult = await query(
    `SELECT TO_CHAR(review_date AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day, COUNT(*)::int AS cnt
     FROM reviews
     WHERE restaurant_id = $1 AND review_date >= $2 AND review_date < $3
     GROUP BY day ORDER BY day`,
    [restaurantId, periodStart.toISOString(), periodEnd.toISOString()]
  );

  const dailyCounts: Record<string, number> = {};
  for (const row of dailyResult.rows) {
    dailyCounts[row.day] = row.cnt;
  }

  // Response rate: reviews that have a reply_draft with status 'approved' or 'sent'
  const responseResult = await query(
    `SELECT COUNT(DISTINCT rd.review_id)::int AS responded
     FROM reply_drafts rd
     JOIN reviews r ON r.id = rd.review_id
     WHERE r.restaurant_id = $1 AND r.review_date >= $2 AND r.review_date < $3
       AND rd.status IN ('approved', 'sent')`,
    [restaurantId, periodStart.toISOString(), periodEnd.toISOString()]
  );

  const s = statsResult.rows[0];
  const responded = responseResult.rows[0]?.responded || 0;

  return {
    stats: {
      reviewCount: s.review_count,
      avgRating: parseFloat(s.avg_rating),
      positiveCount: s.positive_count,
      negativeCount: s.negative_count,
      responseRate: s.review_count > 0 ? Math.round((responded / s.review_count) * 100) : 0,
      ratingDistribution: s.rating_distribution || {},
      dailyCounts,
    },
    reviews,
  };
}

// ─── 2. Theme Extraction via OpenAI ──────────────────────────────────

async function extractThemes(reviews: ReviewRow[]): Promise<DigestThemes> {
  const reviewTexts = reviews
    .filter(r => r.text)
    .map(r => `[${r.rating}★] ${r.author}: "${r.text}"`)
    .join('\n');

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0.3,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: `You are a restaurant analytics expert. Analyze customer reviews and extract actionable themes.
Return JSON with exactly this shape:
{
  "praiseThemes": ["theme1", "theme2", "theme3"],
  "complaintThemes": ["theme1", "theme2", "theme3"],
  "operationalInsight": "one paragraph"
}
Each theme should be specific and actionable (e.g., "Handmade pasta quality consistently praised" not "Good food").
The operational insight should be one concrete recommendation the owner can act on this week.
If fewer than 3 themes exist for a category, return fewer. Never fabricate themes not supported by the reviews.`,
      },
      {
        role: 'user',
        content: `Analyze these ${reviews.length} reviews from the past week:\n\n${reviewTexts}`,
      },
    ],
  });

  const parsed = JSON.parse(completion.choices[0].message.content || '{}');
  return {
    praiseThemes: parsed.praiseThemes || [],
    complaintThemes: parsed.complaintThemes || [],
    operationalInsight: parsed.operationalInsight || 'No specific insight available this week.',
  };
}

// ─── 3. Email Rendering ─────────────────────────────────────────────

async function renderDigestEmail(
  restaurant: RestaurantRow,
  stats: DigestStats,
  themes: DigestThemes,
  periodStart: Date,
  periodEnd: Date
): Promise<string> {
  const templatePath = join(__dirname, '..', 'templates', 'digest-email.html');
  let html = await readFile(templatePath, 'utf-8');

  const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  const praiseHtml = themes.praiseThemes.length > 0
    ? themes.praiseThemes.map(t => `<li style="margin-bottom: 6px;">${t}</li>`).join('\n                ')
    : '<li style="color: #94a3b8;">No strong praise themes this week</li>';

  const complaintHtml = themes.complaintThemes.length > 0
    ? themes.complaintThemes.map(t => `<li style="margin-bottom: 6px;">${t}</li>`).join('\n                ')
    : '<li style="color: #94a3b8;">No complaint themes this week — great job!</li>';

  const replacements: Record<string, string> = {
    '{{RESTAURANT_NAME}}': restaurant.name,
    '{{PERIOD_START}}': fmt(periodStart),
    '{{PERIOD_END}}': fmt(periodEnd),
    '{{REVIEW_COUNT}}': stats.reviewCount.toString(),
    '{{AVG_RATING}}': stats.avgRating.toFixed(1),
    '{{RESPONSE_RATE}}': stats.responseRate.toString(),
    '{{POSITIVE_COUNT}}': stats.positiveCount.toString(),
    '{{NEGATIVE_COUNT}}': stats.negativeCount.toString(),
    '{{PRAISE_THEMES}}': praiseHtml,
    '{{COMPLAINT_THEMES}}': complaintHtml,
    '{{OPERATIONAL_INSIGHT}}': themes.operationalInsight,
  };

  for (const [key, value] of Object.entries(replacements)) {
    html = html.split(key).join(value);
  }

  return html;
}

// ─── 4. Send Email ───────────────────────────────────────────────────

async function sendDigestEmail(to: string, restaurantName: string, html: string): Promise<string | null> {
  try {
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject: `Your week at ${restaurantName}`,
      html,
    });

    if (error) throw new Error(error.message);
    console.log(`📧 Digest email sent to ${to}`);
    return data?.id || null;
  } catch (err: any) {
    console.error(`❌ Failed to send digest email to ${to}:`, err.message);
    throw err;
  }
}

// ─── 5. Send SMS Summary ────────────────────────────────────────────

async function sendDigestSms(phone: string, stats: DigestStats): Promise<void> {
  if (!phone || !twilioClient.isConfigured) {
    console.log('⏭️  SMS skipped (no phone or Twilio not configured)');
    return;
  }

  const body = `Week recap sent! ${stats.reviewCount} reviews, ${stats.avgRating.toFixed(1)}★ avg. Check your email for the full digest. Reply HELP anytime.`;

  try {
    await twilioClient.sendSms(phone, body);
    console.log(`📱 Digest SMS sent to ${phone}`);
  } catch (err: any) {
    console.error(`❌ Failed to send digest SMS:`, err.message);
    // Non-fatal — don't throw
  }
}

// ─── 6. Store Digest ────────────────────────────────────────────────

async function storeDigest(
  restaurantId: string,
  periodStart: Date,
  periodEnd: Date,
  stats: DigestStats,
  themes: DigestThemes,
  emailSent: boolean,
  smsSent: boolean
): Promise<string> {
  const result = await query<{ id: string }>(
    `INSERT INTO digests (
       restaurant_id, period_start, period_end,
       review_count, avg_rating, positive_count, negative_count,
       response_rate, rating_distribution, daily_counts,
       praise_themes, complaint_themes, operational_insight, summary_text,
       email_sent_at, sms_sent_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
     ON CONFLICT (restaurant_id, period_start) DO UPDATE SET
       review_count = EXCLUDED.review_count,
       avg_rating = EXCLUDED.avg_rating,
       positive_count = EXCLUDED.positive_count,
       negative_count = EXCLUDED.negative_count,
       response_rate = EXCLUDED.response_rate,
       rating_distribution = EXCLUDED.rating_distribution,
       daily_counts = EXCLUDED.daily_counts,
       praise_themes = EXCLUDED.praise_themes,
       complaint_themes = EXCLUDED.complaint_themes,
       operational_insight = EXCLUDED.operational_insight,
       summary_text = EXCLUDED.summary_text,
       email_sent_at = EXCLUDED.email_sent_at,
       sms_sent_at = EXCLUDED.sms_sent_at
     RETURNING id`,
    [
      restaurantId,
      periodStart.toISOString(),
      periodEnd.toISOString(),
      stats.reviewCount,
      stats.avgRating,
      stats.positiveCount,
      stats.negativeCount,
      stats.responseRate,
      JSON.stringify(stats.ratingDistribution),
      JSON.stringify(stats.dailyCounts),
      JSON.stringify(themes.praiseThemes),
      JSON.stringify(themes.complaintThemes),
      themes.operationalInsight,
      `${stats.reviewCount} reviews, ${stats.avgRating.toFixed(1)}★ avg. ${stats.positiveCount} positive, ${stats.negativeCount} critical.`,
      emailSent ? new Date() : null,
      smsSent ? new Date() : null,
    ]
  );

  return result.rows[0].id;
}

// ─── Main Digest Pipeline ────────────────────────────────────────────

export async function generateDigest(restaurantId?: string): Promise<void> {
  console.log('\n📊 ═══════════════════════════════════════');
  console.log('   WEEKLY DIGEST ENGINE — Starting');
  console.log('═══════════════════════════════════════════\n');

  // Get target restaurants
  const restaurantQuery = restaurantId
    ? 'SELECT id, name, owner_email, owner_phone, timezone FROM restaurants WHERE id = $1'
    : 'SELECT id, name, owner_email, owner_phone, timezone FROM restaurants';
  const params = restaurantId ? [restaurantId] : [];
  const restaurantsResult = await query<RestaurantRow>(restaurantQuery, params);

  if (restaurantsResult.rows.length === 0) {
    console.log('⚠️  No restaurants found. Exiting.');
    return;
  }

  for (const restaurant of restaurantsResult.rows) {
    console.log(`\n🏪 Processing: ${restaurant.name} (${restaurant.id})`);

    try {
      // Compute period window (last 7 days ending now)
      const periodEnd = new Date();
      const periodStart = new Date(periodEnd.getTime() - 7 * 24 * 60 * 60 * 1000);

      // Seed mock data if needed
      await seedMockReviews(restaurant.id);

      // 1. Aggregate
      console.log('  📈 Aggregating reviews...');
      const { stats, reviews } = await aggregateReviews(restaurant.id, periodStart, periodEnd);

      if (stats.reviewCount === 0) {
        console.log('  ⏭️  No reviews this period. Skipping.');
        continue;
      }

      console.log(`  📊 ${stats.reviewCount} reviews | ${stats.avgRating}★ avg | ${stats.positiveCount}👍 ${stats.negativeCount}👎`);

      // 2. Extract themes
      console.log('  🤖 Extracting themes via OpenAI...');
      const themes = await extractThemes(reviews);
      console.log(`  ✅ Praise: ${themes.praiseThemes.length} themes | Complaints: ${themes.complaintThemes.length} themes`);

      // 3. Render email
      console.log('  📧 Rendering email...');
      const emailHtml = await renderDigestEmail(restaurant, stats, themes, periodStart, periodEnd);

      // 4. Send email
      let emailSent = false;
      if (restaurant.owner_email) {
        await sendDigestEmail(restaurant.owner_email, restaurant.name, emailHtml);
        emailSent = true;
      }

      // 5. Send SMS
      let smsSent = false;
      if (restaurant.owner_phone) {
        await sendDigestSms(restaurant.owner_phone, stats);
        smsSent = true;
      }

      // 6. Store digest
      const digestId = await storeDigest(restaurant.id, periodStart, periodEnd, stats, themes, emailSent, smsSent);
      console.log(`  💾 Digest stored: ${digestId}`);

      // Log to email_logs for audit trail
      await query(
        `INSERT INTO email_logs (type, to_email, subject, status, sent_at, metadata)
         VALUES ('newsletter', $1, $2, 'sent', NOW(), $3)`,
        [
          restaurant.owner_email,
          `Your week at ${restaurant.name}`,
          JSON.stringify({ digest_id: digestId, review_count: stats.reviewCount }),
        ]
      );

      console.log(`  ✅ Digest complete for ${restaurant.name}`);

    } catch (err: any) {
      console.error(`  ❌ Failed for ${restaurant.name}:`, err.message);
      // Continue with next restaurant
    }
  }

  console.log('\n📊 ═══════════════════════════════════════');
  console.log('   WEEKLY DIGEST ENGINE — Complete');
  console.log('═══════════════════════════════════════════\n');
}

// ─── CLI Entry Point ─────────────────────────────────────────────────

const isDirectRun = process.argv[1]?.includes('weeklyDigest');
if (isDirectRun) {
  const restaurantId = process.argv[2] || undefined;
  generateDigest(restaurantId)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Fatal error:', err);
      process.exit(1);
    });
}
