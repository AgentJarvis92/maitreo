/**
 * Weekly Digest Engine — Phase 6 (Production)
 *
 * Sends Weekly Reputation Roundup every Sunday at 9AM per restaurant timezone.
 * Covers LAST COMPLETED WEEK: Sunday 00:00 → Saturday 23:59:59 (restaurant TZ).
 * Idempotency enforced via UNIQUE(restaurant_id, period_start).
 * Never crashes if external APIs (OpenAI, Places) fail.
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
import { getPlaceDetails } from '../services/googlePlaces.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
let _resend: Resend | null = null;
function getResend(): Resend {
  if (!_resend) {
    const key = process.env.RESEND_API_KEY;
    if (!key) throw new Error('RESEND_API_KEY not set');
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
  stripe_customer_id: string | null;
  lat?: number | null;
  lng?: number | null;
  google_place_id?: string | null;
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

interface KPI {
  reviewCount: number;
  avgRating: number;
  positiveCount: number;
  negativeCount: number;
  repliedCount: number;
  responseRate: number;
}

interface Deltas {
  avgRatingDelta: number | null;
  reviewCountDeltaPct: number | null;
  responseRateDelta: number | null;
}

interface Pattern {
  dot: string;   // hex color
  text: string;  // <120 chars
}

interface CompetitorMover {
  name: string;
  metric: string;
  note: string;
  score: number;
}

// ─── Step 1: Week Window (NON-NEGOTIABLE) ─────────────────────────────

/**
 * Computes last completed week boundaries in restaurant timezone.
 * Week = Sunday 00:00:00 → Saturday 23:59:59 (restaurant TZ)
 * period_end   = start of CURRENT week (this Sunday 00:00 local → UTC)
 * period_start = period_end - 7 days
 * prev_start   = period_start - 7 days
 * prev_end     = period_start
 *
 * Algorithm: uses Intl.DateTimeFormat to get local time components,
 * then subtracts elapsed time-of-day + days-since-Sunday from now (UTC).
 * No libraries needed. Handles DST correctly.
 */
export function getWeekWindow(timezone: string): {
  periodStart: Date;
  periodEnd: Date;
  prevStart: Date;
  prevEnd: Date;
} {
  const tz = timezone || DEFAULT_TZ;
  const now = new Date();

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
    weekday: 'short',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).formatToParts(now);

  const p = (type: string) => parts.find(x => x.type === type)?.value ?? '0';
  const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const dow = dayMap[p('weekday')] ?? 0;
  const localH = parseInt(p('hour'));
  const localM = parseInt(p('minute'));
  const localS = parseInt(p('second'));

  // Subtract time elapsed today + days since Sunday → Sunday 00:00 local (as UTC)
  const elapsedTodayMs = (localH * 3600 + localM * 60 + localS) * 1000;
  const daysSinceSunMs = dow * 24 * 3600 * 1000;

  const periodEnd = new Date(now.getTime() - elapsedTodayMs - daysSinceSunMs);
  periodEnd.setMilliseconds(0);

  const periodStart = new Date(periodEnd.getTime() - 7 * 24 * 3600 * 1000);
  const prevEnd = periodStart;
  const prevStart = new Date(periodStart.getTime() - 7 * 24 * 3600 * 1000);

  return { periodStart, periodEnd, prevStart, prevEnd };
}

/**
 * Returns true if it is currently Sunday 9:00–9:59 AM in the given timezone.
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
  const hour = parseInt(parts.find(p => p.type === 'hour')?.value ?? '0', 10);
  return weekday === 'Sunday' && hour === 9;
}

// ─── Step 2: Idempotency ──────────────────────────────────────────────

async function digestAlreadySent(restaurantId: string, periodStart: Date): Promise<boolean> {
  const result = await query<{ id: string }>(
    `SELECT id FROM digests WHERE restaurant_id = $1 AND period_start = $2`,
    [restaurantId, periodStart.toISOString()]
  );
  return result.rows.length > 0;
}

// ─── Step 3: KPI Queries ──────────────────────────────────────────────

async function fetchKPI(
  restaurantId: string,
  start: Date,
  end: Date
): Promise<KPI> {
  const statsResult = await query(
    `SELECT
       COUNT(*)::int                                 AS review_count,
       COALESCE(ROUND(AVG(rating)::numeric, 1), 0)  AS avg_rating,
       COUNT(*) FILTER (WHERE rating >= 4)::int      AS positive_count,
       COUNT(*) FILTER (WHERE rating <= 3)::int      AS negative_count
     FROM reviews
     WHERE restaurant_id = $1
       AND created_at >= $2
       AND created_at < $3`,
    [restaurantId, start.toISOString(), end.toISOString()]
  );

  const repliedResult = await query(
    `SELECT COUNT(DISTINCT rd.review_id)::int AS replied
     FROM reply_drafts rd
     JOIN reviews r ON r.id = rd.review_id
     WHERE r.restaurant_id = $1
       AND r.created_at >= $2
       AND r.created_at < $3
       AND rd.status IN ('approved', 'sent')`,
    [restaurantId, start.toISOString(), end.toISOString()]
  );

  const s = statsResult.rows[0];
  const reviewCount = s.review_count as number;
  const repliedCount = repliedResult.rows[0]?.replied ?? 0;

  return {
    reviewCount,
    avgRating: parseFloat(s.avg_rating) || 0,
    positiveCount: s.positive_count as number,
    negativeCount: s.negative_count as number,
    repliedCount,
    responseRate: reviewCount > 0 ? Math.round((repliedCount / reviewCount) * 100) : 0,
  };
}

// ─── Step 4: Delta Calculations ──────────────────────────────────────

function computeDeltas(curr: KPI, prev: KPI): Deltas {
  const avgRatingDelta = prev.reviewCount > 0
    ? parseFloat((curr.avgRating - prev.avgRating).toFixed(1))
    : null;

  const reviewCountDeltaPct = prev.reviewCount > 0
    ? Math.round(((curr.reviewCount - prev.reviewCount) / prev.reviewCount) * 100)
    : null;

  const responseRateDelta = prev.reviewCount > 0
    ? curr.responseRate - prev.responseRate
    : null;

  return { avgRatingDelta, reviewCountDeltaPct, responseRateDelta };
}

function fmtRatingDelta(delta: number | null): string {
  if (delta === null) return '';
  if (delta > 0) return `↑ +${delta.toFixed(1)}`;
  if (delta < 0) return `↓ ${delta.toFixed(1)}`;
  return '';
}

function fmtReviewDelta(pct: number | null): string {
  if (pct === null) return '';
  if (pct > 0) return `+${pct}%`;
  if (pct < 0) return `${pct}%`;
  return '';
}

function fmtResponseDelta(delta: number | null): string {
  if (delta === null) return '';
  if (delta > 0) return `+${delta}pts`;
  if (delta < 0) return `${delta}pts`;
  return '';
}

// ─── Step 5: Risk Signals ────────────────────────────────────────────

async function computeRiskSignals(
  restaurantId: string,
  periodStart: Date,
  periodEnd: Date,
  curr: KPI,
  prev: KPI
): Promise<[string, string, string]> {
  const signals: string[] = [];

  // Fetch unreplied count
  const unrepliedResult = await query(
    `SELECT COUNT(*)::int AS cnt
     FROM reviews r
     LEFT JOIN reply_drafts rd ON rd.review_id = r.id AND rd.status IN ('approved', 'sent')
     WHERE r.restaurant_id = $1
       AND r.created_at >= $2
       AND r.created_at < $3
       AND rd.id IS NULL`,
    [restaurantId, periodStart.toISOString(), periodEnd.toISOString()]
  );
  const unrepliedCount = unrepliedResult.rows[0]?.cnt ?? 0;

  // Priority 1: low-star reviews
  if (curr.negativeCount > 0) {
    signals.push(`${curr.negativeCount} low-star review${curr.negativeCount > 1 ? 's' : ''} this week`);
  }

  // Priority 2: unreplied reviews
  if (unrepliedCount > 0 && signals.length < 3) {
    signals.push(`${unrepliedCount} review${unrepliedCount > 1 ? 's' : ''} still unanswered`);
  }

  // Priority 3: response rate below 80%
  if (curr.responseRate < 80 && curr.reviewCount > 0 && signals.length < 3) {
    signals.push(`Response rate below 80% (${curr.responseRate}%)`);
  }

  // Priority 4: negative reviews rising
  if (prev.reviewCount > 0 && curr.negativeCount > prev.negativeCount && signals.length < 3) {
    signals.push(`Negative reviews rising vs last week`);
  }

  if (signals.length === 0) {
    return ['No active risks.', '', ''];
  }

  return [
    signals[0] ?? '',
    signals[1] ?? '',
    signals[2] ?? '',
  ];
}

// ─── Step 6: Pattern Extraction ──────────────────────────────────────

async function extractPatterns(reviews: ReviewRow[]): Promise<Pattern[]> {
  if (reviews.length === 0) return [];

  const reviewTexts = reviews
    .filter(r => r.text?.trim())
    .map(r => `[${r.rating}★] ${r.author}: "${r.text}"`)
    .join('\n');

  if (!reviewTexts) return [];

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `Analyze restaurant reviews and return exactly 2-4 patterns.
Return JSON:
{
  "patterns": [
    { "type": "positive|negative|warning", "text": "Specific pattern under 120 characters" },
    ...
  ]
}
Rules:
- Max 2 positive, max 2 negative/warning patterns
- "positive" = genuinely praised in multiple reviews
- "negative" = recurring complaint
- "warning" = concern or inconsistency
- text must be specific and factual, under 120 characters
- never fabricate patterns not supported by reviews
- return 2 minimum, 4 maximum`,
        },
        {
          role: 'user',
          content: `${reviews.length} reviews this week:\n\n${reviewTexts}`,
        },
      ],
    });

    const parsed = JSON.parse(completion.choices[0].message.content ?? '{}');
    const raw = Array.isArray(parsed.patterns) ? parsed.patterns.slice(0, 4) : [];

    return raw.map((p: any) => ({
      dot: p.type === 'positive' ? '#6fcf97' : p.type === 'warning' ? '#b8860b' : '#dc2626',
      text: (p.text ?? '').slice(0, 120),
    }));
  } catch (err: any) {
    console.error('  ⚠️ Pattern extraction failed (non-fatal):', err.message);
    return [];
  }
}

// ─── Step 6a: Auto Competitors (In Your Market) ──────────────────────

interface AutoCompetitor {
  name: string;
  metric: string;  // e.g. "4.8★ · 312 reviews"
  note: string;    // e.g. "Highest rated nearby"
}

async function fetchAutoCompetitors(
  lat: number,
  lng: number,
  excludePlaceId?: string | null
): Promise<[AutoCompetitor | null, AutoCompetitor | null]> {
  const places = await nearbySearch(lat, lng, excludePlaceId ?? undefined);
  if (places.length === 0) return [null, null];

  // Sort: first by rating desc, then by review count desc
  const sorted = [...places].sort((a, b) => {
    const ratingDiff = (b.rating ?? 0) - (a.rating ?? 0);
    return ratingDiff !== 0 ? ratingDiff : (b.user_ratings_total ?? 0) - (a.user_ratings_total ?? 0);
  });

  const toAutoComp = (p: typeof places[0], rank: number): AutoCompetitor => {
    const rating = p.rating != null ? `${p.rating.toFixed(1)}★` : '—';
    const reviews = p.user_ratings_total != null ? `${p.user_ratings_total.toLocaleString()} reviews` : '';
    const metric = [rating, reviews].filter(Boolean).join(' · ');
    const note = rank === 0 ? 'Highest rated nearby' : 'Strong local presence';
    return { name: p.name, metric, note };
  };

  return [
    sorted[0] ? toAutoComp(sorted[0], 0) : null,
    sorted[1] ? toAutoComp(sorted[1], 1) : null,
  ];
}

// ─── Step 6b: Manual Competitor Watch ────────────────────────────────

interface CompetitorRow {
  id: string;
  name: string;
  place_id: string;
  restaurant_id: string;
}

async function snapshotCompetitors(
  restaurantId: string,
  periodStart: Date
): Promise<void> {
  const { rows: competitors } = await query<CompetitorRow>(
    `SELECT id, name, place_id FROM competitors WHERE restaurant_id = $1`,
    [restaurantId]
  );

  for (const comp of competitors) {
    // Check if snapshot already exists
    const existing = await query(
      `SELECT id FROM competitor_weekly_snapshots WHERE competitor_id = $1 AND period_start = $2`,
      [comp.id, periodStart.toISOString()]
    );
    if (existing.rows.length > 0) continue;

    // Fetch from Places API (fail gracefully)
    const details = await getPlaceDetails(comp.place_id);
    if (!details) {
      console.log(`  ⚠️ Could not fetch details for ${comp.name} — skipping snapshot`);
      continue;
    }

    await query(
      `INSERT INTO competitor_weekly_snapshots (competitor_id, period_start, rating, user_ratings_total)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (competitor_id, period_start) DO NOTHING`,
      [comp.id, periodStart.toISOString(), details.rating, details.user_ratings_total]
    );
  }
}

async function computeCompetitorMovers(
  restaurantId: string,
  periodStart: Date,
  prevStart: Date
): Promise<{ positive: CompetitorMover | null; negative: CompetitorMover | null }> {
  // Get current + previous snapshots for all competitors
  const result = await query(
    `SELECT
       c.name,
       curr.rating         AS curr_rating,
       curr.user_ratings_total AS curr_total,
       prev.rating         AS prev_rating,
       prev.user_ratings_total AS prev_total
     FROM competitors c
     LEFT JOIN competitor_weekly_snapshots curr
       ON curr.competitor_id = c.id AND curr.period_start = $2
     LEFT JOIN competitor_weekly_snapshots prev
       ON prev.competitor_id = c.id AND prev.period_start = $3
     WHERE c.restaurant_id = $1
       AND curr.id IS NOT NULL
       AND prev.id IS NOT NULL`,
    [restaurantId, periodStart.toISOString(), prevStart.toISOString()]
  );

  if (result.rows.length === 0) return { positive: null, negative: null };

  const movers: CompetitorMover[] = result.rows.map((r: any) => {
    const deltaReviews = (r.curr_total ?? 0) - (r.prev_total ?? 0);
    const deltaRating = parseFloat(r.curr_rating ?? '0') - parseFloat(r.prev_rating ?? '0');
    const score = deltaReviews + Math.abs(deltaRating) * 20;

    // Metric display
    let metric: string;
    if (Math.abs(deltaReviews) >= Math.abs(deltaRating) * 20) {
      metric = deltaReviews >= 0 ? `+${deltaReviews} reviews` : `${deltaReviews} reviews`;
    } else {
      metric = `${parseFloat(r.prev_rating).toFixed(1)} → ${parseFloat(r.curr_rating).toFixed(1)}`;
    }

    // Note
    let note: string;
    if (deltaReviews > 20) note = 'Volume spike';
    else if (deltaReviews > 5) note = 'Steady growth';
    else if (deltaRating >= 0.3) note = 'Rating improvement';
    else if (deltaRating <= -0.3) note = 'Rating drop';
    else if (deltaReviews < -5) note = 'Volume decline';
    else note = 'Stable';

    return { name: r.name, metric, note, score };
  });

  const sorted = [...movers].sort((a, b) => b.score - a.score);
  const positive = sorted[0]?.score > 0 ? sorted[0] : null;
  const negative = sorted[sorted.length - 1]?.score < 0 ? sorted[sorted.length - 1] : null;

  return { positive, negative };
}

// ─── Step 7: Action Generation ────────────────────────────────────────

function generateActions(
  curr: KPI,
  unrepliedCount: number,
  patterns: Pattern[]
): string[] {
  const actions: string[] = [];

  if (unrepliedCount > 0) {
    actions.push(`Reply to ${unrepliedCount} unanswered review${unrepliedCount > 1 ? 's' : ''}`);
  }

  const negativeTexts = patterns.filter(p => p.dot === '#dc2626').map(p => p.text.toLowerCase());

  const hasWaitComplaints = negativeTexts.filter(t =>
    t.includes('wait') || t.includes('slow') || t.includes('time')
  ).length >= 1;

  const hasServiceComplaints = negativeTexts.filter(t =>
    t.includes('service') || t.includes('staff') || t.includes('server')
  ).length >= 1;

  if (hasWaitComplaints && actions.length < 3) {
    actions.push('Audit peak-hour wait times');
  }

  if (hasServiceComplaints && actions.length < 3) {
    actions.push('Review service pacing during dinner rush');
  }

  const praiseTheme = patterns.find(p => p.dot === '#6fcf97');
  if (praiseTheme && actions.length < 3) {
    const theme = praiseTheme.text.slice(0, 35);
    actions.push(`Lean into what's working: ${theme}`);
  }

  return actions.slice(0, 3);
}

// ─── Step 8: Needs Attention ──────────────────────────────────────────

async function computeNeedsAttention(
  restaurantId: string,
  periodStart: Date,
  periodEnd: Date
): Promise<string> {
  const result = await query(
    `SELECT r.author, r.rating, r.text
     FROM reviews r
     LEFT JOIN reply_drafts rd ON rd.review_id = r.id AND rd.status IN ('approved', 'sent')
     WHERE r.restaurant_id = $1
       AND r.created_at >= $2
       AND r.created_at < $3
       AND (r.rating <= 2 OR rd.id IS NULL)
     ORDER BY r.rating ASC, r.created_at DESC
     LIMIT 2`,
    [restaurantId, periodStart.toISOString(), periodEnd.toISOString()]
  );

  if (result.rows.length === 0) return '';

  const items = result.rows.map((r: any) => {
    const snippet = (r.text ?? '').slice(0, 100);
    return `${r.author} (${r.rating}★): "${snippet}"`;
  });

  return items.join(' · ');
}

// ─── Step 9: Template Rendering ───────────────────────────────────────

function escapeHtml(str: string): string {
  return (str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function removeSection(html: string, sectionName: string): string {
  const re = new RegExp(
    `<!-- START ${sectionName} -->[\\s\\S]*?<!-- END ${sectionName} -->`,
    'g'
  );
  return html.replace(re, '');
}

async function renderDigestEmail(params: {
  restaurant: RestaurantRow;
  curr: KPI;
  deltas: Deltas;
  riskSignals: [string, string, string];
  patterns: Pattern[];
  autoCompetitors: [AutoCompetitor | null, AutoCompetitor | null];
  competitorMovers: { positive: CompetitorMover | null; negative: CompetitorMover | null };
  actions: string[];
  needsAttentionText: string;
  periodStart: Date;
  periodEnd: Date;
  manageSubscriptionUrl: string;
  unsubscribeUrl: string;
}): Promise<string> {
  const {
    restaurant, curr, deltas, riskSignals, patterns,
    autoCompetitors, competitorMovers, actions, needsAttentionText,
    periodStart, periodEnd, manageSubscriptionUrl, unsubscribeUrl,
  } = params;

  const templatePath = join(__dirname, '..', 'templates', 'digest-email.html');
  let html = await readFile(templatePath, 'utf-8');

  const fmt = (d: Date) =>
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  // ── Section removal ──────────────────────────────────────────────────
  if (!autoCompetitors[0] && !autoCompetitors[1]) {
    html = removeSection(html, 'AUTO_COMPETITORS_SECTION');
  }
  if (!competitorMovers.positive && !competitorMovers.negative) {
    html = removeSection(html, 'COMPETITOR_SECTION');
  }
  if (actions.length === 0) {
    html = removeSection(html, 'ACTIONS_SECTION');
  }
  if (!needsAttentionText) {
    html = removeSection(html, 'NEEDS_ATTENTION_SECTION');
  }

  // ── Patterns ─────────────────────────────────────────────────────────
  // Remove pattern rows 3 & 4 if not enough patterns
  const p3 = patterns[2];
  const p4 = patterns[3];
  if (!p3) {
    html = html.replace(
      /<!-- Pattern 3 \(optional[^>]*\) -->[\s\S]*?<\/table>/,
      ''
    );
  }
  if (!p4) {
    html = html.replace(
      /<!-- Pattern 4 \(optional[^>]*\) -->[\s\S]*?<\/table>/,
      ''
    );
  }

  // ── Risk signal rows 2 & 3 ────────────────────────────────────────────
  if (!riskSignals[1]) {
    html = html.replace(
      /<!-- Risk signal line 2[^>]*-->\s*<div[^>]*>{{RISK_SIGNAL_2}}<\/div>/,
      ''
    );
  }
  if (!riskSignals[2]) {
    html = html.replace(
      /<!-- Risk signal line 3[^>]*-->\s*<div[^>]*>{{RISK_SIGNAL_3}}<\/div>/,
      ''
    );
  }

  // ── Action chips ──────────────────────────────────────────────────────
  if (!actions[2]) {
    html = html.replace(
      /<!-- Chip 3[^>]*-->\s*<span[^>]*>{{action_text_3}}<\/span>/,
      ''
    );
  }

  // ── All replacements ──────────────────────────────────────────────────
  const replacements: Record<string, string> = {
    '{{RESTAURANT_NAME}}':            escapeHtml(restaurant.name),
    '{{PERIOD_START}}':               fmt(periodStart),
    '{{PERIOD_END}}':                 fmt(periodEnd),
    '{{current_year}}':               new Date().getFullYear().toString(),
    '{{AVG_RATING}}':                 curr.avgRating.toFixed(1),
    '{{AVG_RATING_DELTA_DISPLAY}}':   fmtRatingDelta(deltas.avgRatingDelta),
    '{{NEW_REVIEWS}}':                curr.reviewCount.toString(),
    '{{NEW_REVIEWS_DELTA_DISPLAY}}':  fmtReviewDelta(deltas.reviewCountDeltaPct),
    '{{RESPONSE_RATE}}':              curr.responseRate.toString(),
    '{{RESPONSE_RATE_DELTA_DISPLAY}}':fmtResponseDelta(deltas.responseRateDelta),
    '{{RISK_SIGNAL_1}}':              escapeHtml(riskSignals[0]),
    '{{RISK_SIGNAL_2}}':              escapeHtml(riskSignals[1]),
    '{{RISK_SIGNAL_3}}':              escapeHtml(riskSignals[2]),
    '{{pattern_dot_1}}':              patterns[0]?.dot ?? '#6fcf97',
    '{{pattern_text_1}}':             escapeHtml(patterns[0]?.text ?? ''),
    '{{pattern_dot_2}}':              patterns[1]?.dot ?? '#6fcf97',
    '{{pattern_text_2}}':             escapeHtml(patterns[1]?.text ?? ''),
    '{{pattern_dot_3}}':              patterns[2]?.dot ?? '#6fcf97',
    '{{pattern_text_3}}':             escapeHtml(patterns[2]?.text ?? ''),
    '{{pattern_dot_4}}':              patterns[3]?.dot ?? '#6fcf97',
    '{{pattern_text_4}}':             escapeHtml(patterns[3]?.text ?? ''),
    '{{auto_name_1}}':                escapeHtml(autoCompetitors[0]?.name ?? ''),
    '{{auto_metric_1}}':              escapeHtml(autoCompetitors[0]?.metric ?? ''),
    '{{auto_note_1}}':                escapeHtml(autoCompetitors[0]?.note ?? ''),
    '{{auto_name_2}}':                escapeHtml(autoCompetitors[1]?.name ?? ''),
    '{{auto_metric_2}}':              escapeHtml(autoCompetitors[1]?.metric ?? ''),
    '{{auto_note_2}}':                escapeHtml(autoCompetitors[1]?.note ?? ''),
    '{{competitor_name_1}}':          escapeHtml(competitorMovers.positive?.name ?? ''),
    '{{competitor_metric_1}}':        escapeHtml(competitorMovers.positive?.metric ?? ''),
    '{{competitor_note_1}}':          escapeHtml(competitorMovers.positive?.note ?? ''),
    '{{competitor_name_2}}':          escapeHtml(competitorMovers.negative?.name ?? ''),
    '{{competitor_metric_2}}':        escapeHtml(competitorMovers.negative?.metric ?? ''),
    '{{competitor_note_2}}':          escapeHtml(competitorMovers.negative?.note ?? ''),
    '{{action_text_1}}':              escapeHtml(actions[0] ?? ''),
    '{{action_text_2}}':              escapeHtml(actions[1] ?? ''),
    '{{action_text_3}}':              escapeHtml(actions[2] ?? ''),
    '{{needs_attention_text}}':       escapeHtml(needsAttentionText),
    '{{manage_subscription_url}}':    manageSubscriptionUrl,
    '{{unsubscribe_url}}':            unsubscribeUrl,
    // Remove comment-only placeholders
    '{{RISK_SIGNALS_DISPLAY}}':       '',
    '{{action_text_N}}':              '',
  };

  for (const [key, value] of Object.entries(replacements)) {
    html = html.split(key).join(value);
  }

  return html;
}

// ─── Step 10: Store Digest ────────────────────────────────────────────

async function storeDigest(params: {
  restaurantId: string;
  periodStart: Date;
  periodEnd: Date;
  curr: KPI;
  emailSentAt: Date | null;
  smsSentAt: Date | null;
}): Promise<string> {
  const { restaurantId, periodStart, periodEnd, curr, emailSentAt, smsSentAt } = params;
  const result = await query<{ id: string }>(
    `INSERT INTO digests (
       restaurant_id, period_start, period_end,
       review_count, avg_rating, positive_count, negative_count,
       response_rate, rating_distribution,
       praise_themes, complaint_themes,
       email_sent_at, sms_sent_at,
       summary_text
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'{}','[]','[]',$9,$10,$11)
     ON CONFLICT (restaurant_id, period_start) DO UPDATE SET
       review_count   = EXCLUDED.review_count,
       avg_rating     = EXCLUDED.avg_rating,
       positive_count = EXCLUDED.positive_count,
       negative_count = EXCLUDED.negative_count,
       response_rate  = EXCLUDED.response_rate,
       email_sent_at  = COALESCE(digests.email_sent_at, EXCLUDED.email_sent_at),
       sms_sent_at    = COALESCE(digests.sms_sent_at,   EXCLUDED.sms_sent_at),
       summary_text   = EXCLUDED.summary_text
     RETURNING id`,
    [
      restaurantId,
      periodStart.toISOString(),
      periodEnd.toISOString(),
      curr.reviewCount,
      curr.avgRating,
      curr.positiveCount,
      curr.negativeCount,
      curr.responseRate,
      emailSentAt?.toISOString() ?? null,
      smsSentAt?.toISOString()   ?? null,
      `${curr.reviewCount} reviews, ${curr.avgRating.toFixed(1)}★ avg, ${curr.responseRate}% replied`,
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

  const tz = restaurant.timezone || DEFAULT_TZ;
  const { periodStart, periodEnd, prevStart, prevEnd } = getWeekWindow(tz);

  // Idempotency gate (UNIQUE restaurant_id + period_start)
  if (!force) {
    const sent = await digestAlreadySent(restaurant.id, periodStart);
    if (sent) return { sent: false, reason: 'already sent this week' };
  }

  // KPIs
  const curr = await fetchKPI(restaurant.id, periodStart, periodEnd);
  if (curr.reviewCount === 0) return { sent: false, reason: 'no reviews in period' };

  const prev = await fetchKPI(restaurant.id, prevStart, prevEnd);
  const deltas = computeDeltas(curr, prev);

  console.log(`  📊 ${curr.reviewCount} reviews | ${curr.avgRating}★ | ${curr.responseRate}% replied`);

  // Risk signals
  const riskSignals = await computeRiskSignals(restaurant.id, periodStart, periodEnd, curr, prev);

  // Reviews for patterns
  const { rows: reviews } = await query<ReviewRow>(
    `SELECT id, author, rating, text, created_at, platform,
       EXISTS(SELECT 1 FROM reply_drafts rd WHERE rd.review_id = r.id AND rd.status IN ('approved','sent')) AS has_reply
     FROM reviews r
     WHERE r.restaurant_id = $1 AND r.created_at >= $2 AND r.created_at < $3`,
    [restaurant.id, periodStart.toISOString(), periodEnd.toISOString()]
  );

  const unrepliedCount = reviews.filter(r => !r.has_reply).length;

  // Patterns (OpenAI — non-fatal)
  const patterns = await extractPatterns(reviews);

  // Auto competitors — In Your Market (Places API — non-fatal)
  let autoCompetitors: [AutoCompetitor | null, AutoCompetitor | null] = [null, null];
  if (restaurant.lat && restaurant.lng) {
    try {
      autoCompetitors = await fetchAutoCompetitors(restaurant.lat, restaurant.lng, restaurant.google_place_id);
    } catch (err: any) {
      console.error('  ⚠️ Auto competitor fetch failed (non-fatal):', err.message);
    }
  }

  // Manual competitor watch — On Your Radar (Places API — non-fatal)
  let competitorMovers = { positive: null as CompetitorMover | null, negative: null as CompetitorMover | null };
  try {
    await snapshotCompetitors(restaurant.id, periodStart);
    competitorMovers = await computeCompetitorMovers(restaurant.id, periodStart, prevStart);
  } catch (err: any) {
    console.error('  ⚠️ Competitor watch failed (non-fatal):', err.message);
  }

  // Actions
  const actions = generateActions(curr, unrepliedCount, patterns);

  // Needs attention
  const needsAttentionText = await computeNeedsAttention(restaurant.id, periodStart, periodEnd);

  // Stripe billing portal URL
  let manageSubscriptionUrl = 'https://maitreo.com';
  if (restaurant.stripe_customer_id) {
    try {
      const { default: Stripe } = await import('stripe');
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '', { apiVersion: '2024-12-18.acacia' });
      const portal = await stripe.billingPortal.sessions.create({
        customer: restaurant.stripe_customer_id,
        return_url: 'https://maitreo.com',
      });
      manageSubscriptionUrl = portal.url;
    } catch { /* use fallback */ }
  }
  const unsubscribeUrl = `https://maitreo.com/unsubscribe?r=${restaurant.id}`;

  // Render
  const html = await renderDigestEmail({
    restaurant, curr, deltas, riskSignals, patterns,
    autoCompetitors, competitorMovers, actions, needsAttentionText,
    periodStart, periodEnd, manageSubscriptionUrl, unsubscribeUrl,
  });

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

  // Send SMS summary (non-fatal)
  let smsSentAt: Date | null = null;
  if (restaurant.owner_phone && twilioClient.isConfigured) {
    try {
      await twilioClient.sendSms(
        restaurant.owner_phone,
        `Week recap: ${curr.reviewCount} reviews, ${curr.avgRating.toFixed(1)}★ avg, ${curr.responseRate}% replied. Check your email for the full digest. Reply HELP anytime.`
      );
      smsSentAt = new Date();
    } catch (err: any) {
      console.error(`  ⚠️ SMS failed (non-fatal):`, err.message);
    }
  }

  // Store
  const digestId = await storeDigest({
    restaurantId: restaurant.id, periodStart, periodEnd, curr, emailSentAt, smsSentAt,
  });
  console.log(`  💾 Stored: ${digestId}`);

  // Audit log
  await query(
    `INSERT INTO email_logs (type, to_email, subject, status, sent_at, metadata)
     VALUES ('newsletter', $1, $2, 'sent', NOW(), $3)`,
    [
      restaurant.owner_email,
      `Your week at ${restaurant.name}`,
      JSON.stringify({ digest_id: digestId, review_count: curr.reviewCount }),
    ]
  ).catch(err => console.error('  ⚠️ email_logs insert failed:', err.message));

  return { sent: true, reason: `digest ${digestId}` };
}

// ─── Scheduled Runner (called hourly by index.ts) ─────────────────────

export async function runScheduledDigests(): Promise<void> {
  const { rows: restaurants } = await query<RestaurantRow>(
    `SELECT id, name, owner_email, owner_phone, timezone,
            subscription_state, stripe_customer_id, lat, lng, google_place_id
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
      console.log(`  → ${result.sent ? '✅ Sent' : `⏭️  Skipped: ${result.reason}`}`);
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

  if (fired > 0) console.log(`\n✅ [Digest] ${fired} digest(s) sent`);
}

// ─── Admin / Manual Trigger ───────────────────────────────────────────

export async function generateDigest(restaurantId?: string, force = false): Promise<void> {
  console.log('\n📊 ════════════════════════════════════════');
  console.log(`   WEEKLY DIGEST — ${restaurantId ? restaurantId : 'ALL'} | force=${force}`);
  console.log('════════════════════════════════════════════\n');

  const sql = restaurantId
    ? `SELECT id, name, owner_email, owner_phone, timezone, subscription_state, stripe_customer_id, lat, lng, google_place_id FROM restaurants WHERE id = $1`
    : `SELECT id, name, owner_email, owner_phone, timezone, subscription_state, stripe_customer_id, lat, lng, google_place_id FROM restaurants WHERE COALESCE(subscription_state,'trialing') IN ('active','trialing') AND owner_email IS NOT NULL`;

  const { rows } = await query<RestaurantRow>(sql, restaurantId ? [restaurantId] : []);
  if (rows.length === 0) { console.log('⚠️  No eligible restaurants.'); return; }

  for (const r of rows) {
    console.log(`\n🏪 ${r.name}`);
    try {
      const result = await runDigestForRestaurant(r, force);
      console.log(`  → ${result.sent ? '✅ Sent' : `⏭️  Skipped: ${result.reason}`}`);
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
