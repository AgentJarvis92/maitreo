/**
 * Weekly Digest Engine — Phase 6
 *
 * Sends a Weekly Reputation Roundup every Sunday at 9AM per restaurant timezone.
 * Data sourced from DB only — no live Google/Yelp calls.
 * Idempotency enforced via digests table (one per restaurant per week).
 * Scheduling: hourly check in index.ts, fires when TZ == Sunday 9AM.
 *
 * CLI: npx tsx src/jobs/weeklyDigest.ts [restaurantId] [--force]
 */

import dotenv from 'dotenv';
dotenv.config();

import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import OpenAI from 'openai';
import { Resend } from 'resend';
import { query } from '../db/client.js';
import { twilioClient } from '../sms/twilioClient.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
let _resend: Resend | null = null;
function getResend(): Resend {
  if (!_resend) {
    const key = process.env.RESEND_API_KEY;
    if (!key) throw new Error('RESEND_API_KEY not set — cannot send digest emails');
    _resend = new Resend(key);
  }
  return _resend;
}
const FROM_EMAIL = process.env.FROM_EMAIL || 'digest@maitreo.com';
const DEFAULT_TZ = 'America/New_York';

// ─── Types ───────────────────────────────────────────────────────────

interface RestaurantRow {
  id: string;
  name: string;
  owner_email: string;
  owner_phone: string | null;
  timezone: string | null;
  subscription_state: string;
}

interface ReviewRow {
  id: string;
  author: string;
  rating: number;
  text: string;
  created_at: string;
  platform: string;
  has_reply: boolean;
}

interface DigestData {
  reviewCount: number;
  avgRating: number;
  positiveCount: number;
  negativeCount: number;
  responseRate: number;
  ratingDistribution: Record<string, number>;
  praiseThemes: string[];
  complaintThemes: string[];
  operationalInsight: string;
  needsAttention: { author: string; rating: number; snippet: string }[];
}

// ─── Step 3: Scheduling Utilities ────────────────────────────────────

/**
 * Returns true if current moment is Sunday 9:00–9:59 AM in the given timezone.
 * Called every hour by the scheduler in index.ts.
 */
export function isDigestTime(timezone: string): boolean {
  const tz = timezone || DEFAULT_TZ;
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    weekday: 'long',
    hour: 'numeric',
    hour12: false,
  }).formatToParts(now);
  const weekday = parts.find(p => p.type === 'weekday')?.value;
  const hour = parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10);
  return weekday === 'Sunday' && hour === 9;
}

/**
 * Compute the strict 7-day window for this digest run.
 * periodEnd = now (Sunday 9AM in restaurant TZ)
 * periodStart = 7 days prior
 */
function getPeriodWindow(): { periodStart: Date; periodEnd: Date } {
  const periodEnd = new Date();
  const periodStart = new Date(periodEnd.getTime() - 7 * 24 * 60 * 60 * 1000);
  return { periodStart, periodEnd };
}

/**
 * Idempotency check — was a digest already sent this week?
 * Prevents duplicate sends if the hourly job fires multiple times.
 */
async function wasDigestSentThisWeek(restaurantId: string): Promise<boolean> {
  const result = await query<{ id: string }>(
    `SELECT id FROM digests
     WHERE restaurant_id = $1
       AND created_at >= NOW() - INTERVAL '6 days'`,
    [restaurantId]
  );
  return result.rows.length > 0;
}

// ─── Step 1: Data Contract ────────────────────────────────────────────

async function fetchDigestData(
  restaurantId: string,
  periodStart: Date,
  periodEnd: Date
): Promise<DigestData | null> {

  // Fetch reviews strictly within window, deduplicated by review id
  const reviewsResult = await query<ReviewRow>(
    `SELECT DISTINCT ON (r.id)
       r.id, r.author, r.rating, r.text, r.created_at, r.platform,
       EXISTS(
         SELECT 1 FROM reply_drafts rd
         WHERE rd.review_id = r.id AND rd.status IN ('approved', 'sent')
       ) AS has_reply
     FROM reviews r
     WHERE r.restaurant_id = $1
       AND r.created_at >= $2
       AND r.created_at < $3
     ORDER BY r.id, r.rating ASC`,
    [restaurantId, periodStart.toISOString(), periodEnd.toISOString()]
  );

  const reviews = reviewsResult.rows;
  if (reviews.length === 0) return null;

  // Aggregate stats in a single query
  const statsResult = await query(
    `SELECT
       COUNT(*)::int                                          AS review_count,
       ROUND(AVG(rating)::numeric, 2)                        AS avg_rating,
       COUNT(*) FILTER (WHERE rating >= 4)::int              AS positive_count,
       COUNT(*) FILTER (WHERE rating <= 3)::int              AS negative_count,
       jsonb_object_agg(rating::text, cnt)                   AS rating_distribution
     FROM (
       SELECT rating, COUNT(*)::int AS cnt
       FROM reviews
       WHERE restaurant_id = $1
         AND created_at >= $2
         AND created_at < $3
       GROUP BY rating
     ) sub`,
    [restaurantId, periodStart.toISOString(), periodEnd.toISOString()]
  );

  const s = statsResult.rows[0];
  const reviewCount = s.review_count as number;
  const responded = reviews.filter(r => r.has_reply).length;
  const responseRate = reviewCount > 0 ? Math.round((responded / reviewCount) * 100) : 0;

  // Needs Attention: low rating (≤3) OR unreplied — up to 3
  const needsAttention = reviews
    .filter(r => r.rating <= 3 || !r.has_reply)
    .slice(0, 3)
    .map(r => ({
      author: r.author || 'Anonymous',
      rating: r.rating,
      snippet: (r.text || '').slice(0, 150) + ((r.text || '').length > 150 ? '...' : ''),
    }));

  // Extract themes via OpenAI
  const { praiseThemes, complaintThemes, operationalInsight } = await extractThemes(reviews);

  return {
    reviewCount,
    avgRating: parseFloat(s.avg_rating) || 0,
    positiveCount: s.positive_count as number,
    negativeCount: s.negative_count as number,
    responseRate,
    ratingDistribution: s.rating_distribution || {},
    praiseThemes,
    complaintThemes,
    operationalInsight,
    needsAttention,
  };
}

// ─── Step 2: Theme Extraction ─────────────────────────────────────────

async function extractThemes(reviews: ReviewRow[]): Promise<{
  praiseThemes: string[];
  complaintThemes: string[];
  operationalInsight: string;
}> {
  const reviewTexts = reviews
    .filter(r => r.text)
    .map(r => `[${r.rating}★] ${r.author}: "${r.text}"`)
    .join('\n');

  if (!reviewTexts) {
    return { praiseThemes: [], complaintThemes: [], operationalInsight: '' };
  }

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.3,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `You are a restaurant analytics expert. Analyze reviews and extract actionable themes.
Return JSON:
{
  "praiseThemes": ["specific theme 1", "specific theme 2", "specific theme 3"],
  "complaintThemes": ["specific complaint 1", "specific complaint 2"],
  "operationalInsight": "One concrete recommendation the owner can act on this week."
}
Be specific. Never fabricate themes not supported by the reviews. Return fewer than 3 if data is insufficient.`,
        },
        {
          role: 'user',
          content: `Analyze these ${reviews.length} reviews:\n\n${reviewTexts}`,
        },
      ],
    });
    const parsed = JSON.parse(completion.choices[0].message.content || '{}');
    return {
      praiseThemes: Array.isArray(parsed.praiseThemes) ? parsed.praiseThemes : [],
      complaintThemes: Array.isArray(parsed.complaintThemes) ? parsed.complaintThemes : [],
      operationalInsight: typeof parsed.operationalInsight === 'string' ? parsed.operationalInsight : '',
    };
  } catch (err: any) {
    console.error('  ⚠️ Theme extraction failed (non-fatal):', err.message);
    return { praiseThemes: [], complaintThemes: [], operationalInsight: '' };
  }
}

// ─── Step 2: Template Rendering ───────────────────────────────────────

function escapeHtml(str: string): string {
  return (str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function renderDigestEmail(
  restaurant: RestaurantRow,
  data: DigestData,
  periodStart: Date,
  periodEnd: Date
): Promise<string> {
  const templatePath = join(__dirname, '..', 'templates', 'digest-email.html');
  let html = await readFile(templatePath, 'utf-8');

  const fmt = (d: Date) =>
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  // Praise themes
  const praiseHtml = data.praiseThemes.length > 0
    ? data.praiseThemes.map(t => `<li style="margin-bottom:6px;">${escapeHtml(t)}</li>`).join('\n')
    : '<li style="color:#94a3b8;font-style:italic;">No strong praise themes this week</li>';

  // Complaint themes
  const complaintHtml = data.complaintThemes.length > 0
    ? data.complaintThemes.map(t => `<li style="margin-bottom:6px;">${escapeHtml(t)}</li>`).join('\n')
    : '<li style="color:#94a3b8;font-style:italic;">No major complaints this week — great job!</li>';

  // Needs Attention section — hidden if empty
  let needsAttentionSection = '';
  if (data.needsAttention.length > 0) {
    const rows = data.needsAttention.map(r => `
      <tr>
        <td style="padding:12px 0;border-bottom:1px solid #e2e8f0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
            <td style="width:80px;vertical-align:top;font-size:14px;padding-top:2px;">
              ${'⭐'.repeat(Math.min(r.rating, 5))}
            </td>
            <td>
              <div style="font-weight:600;color:#1e293b;font-size:13px;">${escapeHtml(r.author)}</div>
              <div style="color:#64748b;font-size:13px;margin-top:4px;line-height:1.5;">"${escapeHtml(r.snippet)}"</div>
            </td>
          </tr></table>
        </td>
      </tr>`).join('');

    needsAttentionSection = `
      <tr>
        <td style="padding:24px 40px 8px;">
          <h2 style="margin:0 0 12px;font-size:18px;color:#dc2626;">🚨 Needs your attention</h2>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>
        </td>
      </tr>`;
  }

  const replacements: Record<string, string> = {
    '{{RESTAURANT_NAME}}':        escapeHtml(restaurant.name),
    '{{PERIOD_START}}':           fmt(periodStart),
    '{{PERIOD_END}}':             fmt(periodEnd),
    '{{REVIEW_COUNT}}':           data.reviewCount.toString(),
    '{{AVG_RATING}}':             data.avgRating.toFixed(1),
    '{{RESPONSE_RATE}}':          data.responseRate.toString(),
    '{{POSITIVE_COUNT}}':         data.positiveCount.toString(),
    '{{NEGATIVE_COUNT}}':         data.negativeCount.toString(),
    '{{PRAISE_THEMES}}':          praiseHtml,
    '{{COMPLAINT_THEMES}}':       complaintHtml,
    '{{OPERATIONAL_INSIGHT}}':    escapeHtml(data.operationalInsight),
    '{{NEEDS_ATTENTION_SECTION}}': needsAttentionSection,
  };

  for (const [key, value] of Object.entries(replacements)) {
    html = html.split(key).join(value);
  }

  return html;
}

// ─── Step 4: Store Digest ─────────────────────────────────────────────

async function storeDigest(params: {
  restaurantId: string;
  periodStart: Date;
  periodEnd: Date;
  data: DigestData;
  emailSentAt: Date | null;
  smsSentAt: Date | null;
}): Promise<string> {
  const { restaurantId, periodStart, periodEnd, data, emailSentAt, smsSentAt } = params;
  const result = await query<{ id: string }>(
    `INSERT INTO digests (
       restaurant_id, period_start, period_end,
       review_count, avg_rating, positive_count, negative_count,
       response_rate, rating_distribution,
       praise_themes, complaint_themes, operational_insight, summary_text,
       email_sent_at, sms_sent_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
     ON CONFLICT (restaurant_id, period_start) DO UPDATE SET
       review_count        = EXCLUDED.review_count,
       avg_rating          = EXCLUDED.avg_rating,
       positive_count      = EXCLUDED.positive_count,
       negative_count      = EXCLUDED.negative_count,
       response_rate       = EXCLUDED.response_rate,
       rating_distribution = EXCLUDED.rating_distribution,
       praise_themes       = EXCLUDED.praise_themes,
       complaint_themes    = EXCLUDED.complaint_themes,
       operational_insight = EXCLUDED.operational_insight,
       summary_text        = EXCLUDED.summary_text,
       email_sent_at = COALESCE(digests.email_sent_at, EXCLUDED.email_sent_at),
       sms_sent_at   = COALESCE(digests.sms_sent_at,   EXCLUDED.sms_sent_at)
     RETURNING id`,
    [
      restaurantId,
      periodStart.toISOString(),
      periodEnd.toISOString(),
      data.reviewCount,
      data.avgRating,
      data.positiveCount,
      data.negativeCount,
      data.responseRate,
      JSON.stringify(data.ratingDistribution),
      JSON.stringify(data.praiseThemes),
      JSON.stringify(data.complaintThemes),
      data.operationalInsight,
      `${data.reviewCount} reviews, ${data.avgRating.toFixed(1)}★ avg. ${data.positiveCount} positive, ${data.negativeCount} critical.`,
      emailSentAt?.toISOString() ?? null,
      smsSentAt?.toISOString()   ?? null,
    ]
  );
  return result.rows[0].id;
}

// ─── Core Pipeline ────────────────────────────────────────────────────

export async function runDigestForRestaurant(
  restaurant: RestaurantRow,
  force = false
): Promise<{ sent: boolean; reason: string }> {

  // Subscription gate
  const state = restaurant.subscription_state || 'trialing';
  if (!['active', 'trialing'].includes(state)) {
    return { sent: false, reason: `subscription ${state}` };
  }

  // Idempotency gate
  if (!force) {
    const alreadySent = await wasDigestSentThisWeek(restaurant.id);
    if (alreadySent) return { sent: false, reason: 'already sent this week' };
  }

  const { periodStart, periodEnd } = getPeriodWindow();

  // Fetch data
  const data = await fetchDigestData(restaurant.id, periodStart, periodEnd);
  if (!data) return { sent: false, reason: 'no reviews in period' };

  console.log(`  📊 ${data.reviewCount} reviews | ${data.avgRating}★ | ${data.responseRate}% replied | ${data.needsAttention.length} need attention`);

  // Render
  const html = await renderDigestEmail(restaurant, data, periodStart, periodEnd);

  // Send email
  let emailSentAt: Date | null = null;
  if (restaurant.owner_email) {
    const { data: resendData, error } = await getResend().emails.send({
      from: FROM_EMAIL,
      to: restaurant.owner_email,
      subject: `Your week at ${restaurant.name}`,
      html,
    });
    if (error) throw new Error(`Resend error: ${error.message}`);
    emailSentAt = new Date();
    console.log(`  📧 Email sent (${resendData?.id})`);
  }

  // Send SMS (non-fatal)
  let smsSentAt: Date | null = null;
  if (restaurant.owner_phone && twilioClient.isConfigured) {
    try {
      await twilioClient.sendSms(
        restaurant.owner_phone,
        `Week recap: ${data.reviewCount} reviews, ${data.avgRating.toFixed(1)}★ avg, ${data.responseRate}% replied. Full digest in your email. Reply HELP anytime.`
      );
      smsSentAt = new Date();
      console.log(`  📱 SMS sent`);
    } catch (err: any) {
      console.error(`  ⚠️ SMS failed (non-fatal):`, err.message);
    }
  }

  // Store digest record (idempotent upsert)
  const digestId = await storeDigest({ restaurantId: restaurant.id, periodStart, periodEnd, data, emailSentAt, smsSentAt });
  console.log(`  💾 Digest stored: ${digestId}`);

  // Audit log
  await query(
    `INSERT INTO email_logs (type, to_email, subject, status, sent_at, metadata)
     VALUES ('newsletter', $1, $2, 'sent', NOW(), $3)`,
    [restaurant.owner_email, `Your week at ${restaurant.name}`, JSON.stringify({ digest_id: digestId, review_count: data.reviewCount })]
  ).catch(err => console.error('  ⚠️ email_logs insert failed (non-fatal):', err.message));

  return { sent: true, reason: `digest ${digestId}` };
}

/**
 * Scheduled runner — called every hour by index.ts.
 * Only fires for restaurants where current time == Sunday 9AM in their TZ.
 */
export async function runScheduledDigests(): Promise<void> {
  const { rows: restaurants } = await query<RestaurantRow>(
    `SELECT id, name, owner_email, owner_phone, timezone, subscription_state
     FROM restaurants
     WHERE COALESCE(subscription_state, 'trialing') IN ('active', 'trialing')
       AND monitoring_paused IS NOT TRUE
       AND owner_email IS NOT NULL`
  );

  let fired = 0;
  for (const r of restaurants) {
    const tz = r.timezone || DEFAULT_TZ;
    if (!isDigestTime(tz)) continue;

    console.log(`\n🏪 [Digest] ${r.name} (${tz})`);
    try {
      const result = await runDigestForRestaurant(r);
      console.log(`  → ${result.sent ? `✅ Sent` : `⏭️  Skipped: ${result.reason}`}`);
      if (result.sent) fired++;
    } catch (err: any) {
      console.error(`  ❌ Failed:`, err.message);
      await query(
        `INSERT INTO email_logs (type, to_email, subject, status, error_message, metadata)
         VALUES ('newsletter', $1, $2, 'failed', $3, $4)`,
        [r.owner_email, `Your week at ${r.name}`, err.message, JSON.stringify({ restaurant_id: r.id })]
      ).catch(() => {});
    }
  }

  if (fired > 0) console.log(`\n✅ [Digest] ${fired} digest(s) sent this run`);
}

/**
 * Manual / admin trigger. Bypasses timezone check.
 * force=true bypasses idempotency check (for testing).
 */
export async function generateDigest(restaurantId?: string, force = false): Promise<void> {
  console.log('\n📊 ═══════════════════════════════════════');
  console.log(`   WEEKLY DIGEST ENGINE — Manual Run`);
  console.log(`   Target: ${restaurantId || 'ALL'} | Force: ${force}`);
  console.log('═══════════════════════════════════════════\n');

  const sql = restaurantId
    ? `SELECT id, name, owner_email, owner_phone, timezone, subscription_state FROM restaurants WHERE id = $1`
    : `SELECT id, name, owner_email, owner_phone, timezone, subscription_state FROM restaurants WHERE COALESCE(subscription_state, 'trialing') IN ('active','trialing') AND owner_email IS NOT NULL`;
  const params = restaurantId ? [restaurantId] : [];

  const { rows } = await query<RestaurantRow>(sql, params);
  if (rows.length === 0) { console.log('⚠️  No eligible restaurants.'); return; }

  for (const r of rows) {
    console.log(`\n🏪 ${r.name}`);
    try {
      const result = await runDigestForRestaurant(r, force);
      console.log(`  → ${result.sent ? `✅ Sent` : `⏭️  Skipped: ${result.reason}`}`);
    } catch (err: any) {
      console.error(`  ❌ Failed:`, err.message);
    }
  }

  console.log('\n✅ Done');
}

// ─── CLI ─────────────────────────────────────────────────────────────

const isDirectRun = process.argv[1]?.includes('weeklyDigest');
if (isDirectRun) {
  const restaurantId = process.argv[2] || undefined;
  const force = process.argv.includes('--force');
  generateDigest(restaurantId, force)
    .then(() => process.exit(0))
    .catch(err => { console.error('Fatal:', err); process.exit(1); });
}
