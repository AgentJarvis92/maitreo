/**
 * SMS Service — Full Command Engine for Maitreo
 * Handles all 8 commands + STOP compliance + context/state tracking.
 */

import { query } from '../db/client.js';
import { twilioClient } from './twilioClient.js';
import { parseCommand, type CommandType, type ParsedCommand } from './commandParser.js';
import { createPortalSession, cancelSubscription } from '../services/stripeService.js';
import { nearbySearch, textSearch } from '../services/googlePlaces.js';
import type { Review, ReplyDraft, Restaurant } from '../types/models.js';

const HELP_SUFFIX = '\nReply HELP anytime.';

// ─── Message Templates ───────────────────────────────────────────────

const TEMPLATES = {
  help: `Maitreo SMS Commands:

When a review arrives:
APPROVE — post reply instantly
EDIT — revise before posting
IGNORE — skip without replying

On Your Radar:
COMPETITOR [name] — track competitor
COMPETITOR LIST — see your list
COMPETITOR REMOVE [name] — stop tracking

Your Account:
PAUSE · RESUME · STATUS · BILLING

support@maitreo.com`,

  stop: `You've been unsubscribed from Maitreo alerts. Reply START to re-subscribe anytime.`,

  approve: `✅ Response approved and posted!${HELP_SUFFIX}`,

  editPrompt: `✏️ Type your custom reply now. Your next message will be posted as the response.${HELP_SUFFIX}`,

  customReplyConfirm: `✅ Your custom response has been posted!${HELP_SUFFIX}`,

  ignore: `👍 Review dismissed. No reply will be posted.${HELP_SUFFIX}`,

  pause: `⏸️ Review monitoring paused. Text RESUME to restart.${HELP_SUFFIX}`,

  resume: `▶️ Review monitoring resumed! You'll receive alerts for new reviews.${HELP_SUFFIX}`,

  cancelPrompt: `⚠️ Are you sure you want to cancel your Maitreo subscription? Reply YES to confirm or NO to keep your account.${HELP_SUFFIX}`,

  cancelConfirm: `Your cancellation request has been submitted. You'll receive a confirmation email. We're sorry to see you go.${HELP_SUFFIX}`,

  cancelDeny: `Great, your account remains active!${HELP_SUFFIX}`,

  noPendingReview: `No pending review to respond to. We'll notify you when the next one arrives.${HELP_SUFFIX}`,

  unknownCommand: `Sorry, I didn't understand that.\n\nReply HELP for the full command list.`,
};

// ─── Mock Review Objects (until Agent 1 completes) ───────────────────

interface MockReview {
  id: string;
  author: string;
  rating: number;
  text: string;
  draft_reply: string;
  status: 'pending' | 'approved' | 'ignored';
}

// ─── SMS Context / State ─────────────────────────────────────────────

interface SmsContext {
  phone: string;
  state: string | null; // null, 'waiting_for_custom_reply', 'waiting_for_cancel_confirm'
  pending_review_id: string | null;
  restaurant_id: string | null;
}

async function getOrCreateContext(phone: string): Promise<SmsContext> {
  const result = await query<SmsContext>(
    `SELECT phone, state, pending_review_id, restaurant_id 
     FROM sms_context WHERE phone = $1`,
    [phone]
  );
  if (result.rows.length > 0) return result.rows[0];

  // Try to find restaurant by owner phone
  const restResult = await query<{ id: string }>(
    `SELECT id FROM restaurants WHERE owner_phone = $1 LIMIT 1`,
    [phone]
  );
  const restaurantId = restResult.rows[0]?.id || null;

  await query(
    `INSERT INTO sms_context (phone, state, pending_review_id, restaurant_id)
     VALUES ($1, NULL, NULL, $2)
     ON CONFLICT (phone) DO NOTHING`,
    [phone, restaurantId]
  );
  return { phone, state: null, pending_review_id: null, restaurant_id: restaurantId };
}

async function updateContext(phone: string, updates: Partial<SmsContext>): Promise<void> {
  const sets: string[] = [];
  const vals: any[] = [];
  let i = 1;

  if ('state' in updates) { sets.push(`state = $${i++}`); vals.push(updates.state); }
  if ('pending_review_id' in updates) { sets.push(`pending_review_id = $${i++}`); vals.push(updates.pending_review_id); }
  if ('restaurant_id' in updates) { sets.push(`restaurant_id = $${i++}`); vals.push(updates.restaurant_id); }

  sets.push(`updated_at = NOW()`);
  vals.push(phone);

  await query(
    `UPDATE sms_context SET ${sets.join(', ')} WHERE phone = $${i}`,
    vals
  );
}

// ─── SMS Logging ─────────────────────────────────────────────────────

async function logSms(params: {
  direction: 'inbound' | 'outbound';
  from_phone: string;
  to_phone: string;
  body: string;
  command?: string | null;
  status: string;
  twilio_sid?: string | null;
}): Promise<void> {
  await query(
    `INSERT INTO sms_logs (direction, from_phone, to_phone, body, command_parsed, status, twilio_sid)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [params.direction, params.from_phone, params.to_phone, params.body, params.command || null, params.status, params.twilio_sid || null]
  );
}

// ─── Core Service ────────────────────────────────────────────────────

export class SmsService {
  private twilioPhone = process.env.TWILIO_PHONE_NUMBER || '';

  /**
   * Send an SMS and log it.
   */
  async sendSms(to: string, body: string): Promise<void> {
    try {
      const result = await twilioClient.sendSms(to, body);
      await logSms({
        direction: 'outbound',
        from_phone: this.twilioPhone,
        to_phone: to,
        body,
        status: 'sent',
        twilio_sid: result.sid,
      });
    } catch (error) {
      await logSms({
        direction: 'outbound',
        from_phone: this.twilioPhone,
        to_phone: to,
        body,
        status: 'failed',
      }).catch(() => {});
      throw error;
    }
  }

  /**
   * Send a mock review alert (for testing until Agent 1 is done).
   */
  async sendMockReviewAlert(toPhone: string, restaurantId?: string): Promise<void> {
    const mock: MockReview = {
      id: `mock-${Date.now()}`,
      author: 'Sarah',
      rating: 2,
      text: 'Food was cold and service was slow. Very disappointing experience.',
      draft_reply: "We're sorry to hear about your experience, Sarah. We're addressing kitchen timing and service speed. We'd love the chance to make it right — please reach out to us directly.",
      status: 'pending',
    };

    // Store pending review in context
    await getOrCreateContext(toPhone);
    await updateContext(toPhone, {
      pending_review_id: mock.id,
      state: null,
      restaurant_id: restaurantId || null,
    });

    const body = `New review from ${mock.author}: "${mock.text}" (${mock.rating}★)\nDraft reply: "${mock.draft_reply}"\nAPPROVE to post | EDIT for custom reply | IGNORE to skip.${HELP_SUFFIX}`;

    await this.sendSms(toPhone, body);
  }

  /**
   * Send review alert for a real review + draft.
   */
  async sendReviewAlert(
    review: Review,
    draft: ReplyDraft,
    restaurant: Restaurant,
    ownerPhone: string,
  ): Promise<string> {
    const snippet = (review.text || '').slice(0, 120) + ((review.text || '').length > 120 ? '...' : '');

    let draftSnippet = draft.draft_text;
    const opt1Match = draftSnippet.match(/Option 1[:\s]*(.+?)(?=Option 2|$)/is);
    if (opt1Match) draftSnippet = opt1Match[1].trim();
    draftSnippet = draftSnippet.slice(0, 300);

    const body = `New review from ${review.author || 'Anonymous'}: "${snippet}" (${review.rating}★)\nDraft reply: "${draftSnippet}"\nAPPROVE to post | EDIT for custom reply | IGNORE to skip.${HELP_SUFFIX}`;

    // Set context
    await getOrCreateContext(ownerPhone);
    await updateContext(ownerPhone, {
      pending_review_id: review.id,
      state: null,
      restaurant_id: restaurant.id,
    });

    // Also store in sms_messages for backward compat
    const insertResult = await query<{ id: string }>(
      `INSERT INTO sms_messages (
        restaurant_id, review_id, reply_draft_id, phone_number,
        direction, body, status
      ) VALUES ($1, $2, $3, $4, 'outbound', $5, 'sending')
      RETURNING id`,
      [restaurant.id, review.id, draft.id, ownerPhone, body]
    );

    await this.sendSms(ownerPhone, body);

    await query(
      `UPDATE sms_messages SET status = 'sent' WHERE id = $1`,
      [insertResult.rows[0].id]
    );

    return insertResult.rows[0].id;
  }

  /**
   * Handle an incoming SMS — the main command dispatcher.
   */
  async handleIncoming(fromPhone: string, body: string, messageSid?: string): Promise<string> {
    const ctx = await getOrCreateContext(fromPhone);
    const parsed = parseCommand(body, ctx.state || undefined);

    // Log inbound
    await logSms({
      direction: 'inbound',
      from_phone: fromPhone,
      to_phone: this.twilioPhone,
      body,
      command: parsed.type,
      status: 'received',
      twilio_sid: messageSid || null,
    });

    switch (parsed.type) {
      case 'STOP':
        return this.handleStop(fromPhone, ctx);
      case 'HELP':
        return TEMPLATES.help;
      case 'APPROVE':
        return this.handleApprove(fromPhone, ctx);
      case 'EDIT':
        return this.handleEdit(fromPhone, ctx);
      case 'CUSTOM_REPLY':
        return this.handleCustomReply(fromPhone, ctx, parsed.body || body.trim());
      case 'IGNORE':
        return this.handleIgnore(fromPhone, ctx);
      case 'PAUSE':
        return this.handlePause(fromPhone, ctx);
      case 'RESUME':
        return this.handleResume(fromPhone, ctx);
      case 'STATUS':
        return this.handleStatus(fromPhone, ctx);
      case 'BILLING':
        return this.handleBilling(fromPhone, ctx);
      case 'CANCEL':
        return this.handleCancel(fromPhone, ctx);
      case 'CANCEL_CONFIRM':
        return this.handleCancelConfirm(fromPhone, ctx);
      case 'CANCEL_DENY':
        await updateContext(fromPhone, { state: null });
        return TEMPLATES.cancelDeny;
      case 'COMPETITOR_SCAN':
        return this.handleCompetitorScan(fromPhone, ctx);
      case 'COMPETITOR_ADD':
        return this.handleCompetitorAdd(fromPhone, ctx, parsed.argument);
      case 'COMPETITOR_LIST':
        return this.handleCompetitorList(fromPhone, ctx);
      case 'COMPETITOR_REMOVE':
        return this.handleCompetitorRemove(fromPhone, ctx, parsed.argument);
      case 'UNKNOWN':
      default:
        return TEMPLATES.unknownCommand;
    }
  }

  // ─── Command Handlers ────────────────────────────────────────────

  private async handleStop(phone: string, ctx: SmsContext): Promise<string> {
    // Mark user as unsubscribed
    if (ctx.restaurant_id) {
      await query(
        `UPDATE restaurants SET sms_opted_out = true, monitoring_paused = true WHERE id = $1`,
        [ctx.restaurant_id]
      ).catch(() => {});
    }
    await updateContext(phone, { state: null, pending_review_id: null });
    // Twilio auto-blocks future messages after STOP
    return TEMPLATES.stop;
  }

  private async handleApprove(phone: string, ctx: SmsContext): Promise<string> {
    if (!ctx.pending_review_id) return TEMPLATES.noPendingReview;

    // If it's a mock review, just confirm
    if (ctx.pending_review_id.startsWith('mock-')) {
      console.log(`✅ Mock review ${ctx.pending_review_id} approved via SMS`);
      await updateContext(phone, { state: null, pending_review_id: null });
      return TEMPLATES.approve;
    }

    // Real review: approve the draft
    await query(
      `UPDATE reply_drafts SET status = 'approved', approved_at = NOW()
       WHERE review_id = $1 AND status = 'pending'`,
      [ctx.pending_review_id]
    );
    await updateContext(phone, { state: null, pending_review_id: null });
    console.log(`✅ Review ${ctx.pending_review_id} approved via SMS`);
    return TEMPLATES.approve;
  }

  private async handleEdit(phone: string, ctx: SmsContext): Promise<string> {
    if (!ctx.pending_review_id) return TEMPLATES.noPendingReview;
    await updateContext(phone, { state: 'waiting_for_custom_reply' });
    return TEMPLATES.editPrompt;
  }

  private async handleCustomReply(phone: string, ctx: SmsContext, customText: string): Promise<string> {
    if (!ctx.pending_review_id) {
      await updateContext(phone, { state: null });
      return TEMPLATES.noPendingReview;
    }

    if (ctx.pending_review_id.startsWith('mock-')) {
      console.log(`✏️ Mock review ${ctx.pending_review_id} custom reply: "${customText.slice(0, 80)}..."`);
      await updateContext(phone, { state: null, pending_review_id: null });
      return TEMPLATES.customReplyConfirm;
    }

    // Real review: update draft with custom text and approve
    await query(
      `UPDATE reply_drafts 
       SET draft_text = $1, status = 'approved', approved_at = NOW(),
           metadata = jsonb_set(COALESCE(metadata, '{}'), '{custom_response}', 'true')
       WHERE review_id = $2 AND status = 'pending'`,
      [customText, ctx.pending_review_id]
    );
    await updateContext(phone, { state: null, pending_review_id: null });
    return TEMPLATES.customReplyConfirm;
  }

  private async handleIgnore(phone: string, ctx: SmsContext): Promise<string> {
    if (!ctx.pending_review_id) return TEMPLATES.noPendingReview;

    if (!ctx.pending_review_id.startsWith('mock-')) {
      await query(
        `UPDATE reply_drafts SET status = 'rejected' WHERE review_id = $1 AND status = 'pending'`,
        [ctx.pending_review_id]
      );
    }
    console.log(`🚫 Review ${ctx.pending_review_id} ignored via SMS`);
    await updateContext(phone, { state: null, pending_review_id: null });
    return TEMPLATES.ignore;
  }

  private async handlePause(phone: string, ctx: SmsContext): Promise<string> {
    if (ctx.restaurant_id) {
      await query(
        `UPDATE restaurants SET monitoring_paused = true WHERE id = $1`,
        [ctx.restaurant_id]
      ).catch(() => {});
    }
    await updateContext(phone, { state: null });
    return TEMPLATES.pause;
  }

  private async handleResume(phone: string, ctx: SmsContext): Promise<string> {
    if (ctx.restaurant_id) {
      await query(
        `UPDATE restaurants SET monitoring_paused = false WHERE id = $1`,
        [ctx.restaurant_id]
      ).catch(() => {});
    }
    await updateContext(phone, { state: null });
    return TEMPLATES.resume;
  }

  private async handleStatus(phone: string, ctx: SmsContext): Promise<string> {
    if (!ctx.restaurant_id) {
      return `No account found for this phone number. Contact support@maitreo.com for help.${HELP_SUFFIX}`;
    }

    const restResult = await query<{ name: string; monitoring_paused: boolean }>(
      `SELECT name, COALESCE(monitoring_paused, false) as monitoring_paused FROM restaurants WHERE id = $1`,
      [ctx.restaurant_id]
    );

    if (restResult.rows.length === 0) {
      return `Account not found. Contact support@maitreo.com.${HELP_SUFFIX}`;
    }

    const rest = restResult.rows[0];
    const statusText = rest.monitoring_paused ? '⏸️ Paused' : '✅ Active';

    // Count reviews
    const reviewCount = await query<{ count: string }>(
      `SELECT COUNT(*) as count FROM reviews WHERE restaurant_id = $1`,
      [ctx.restaurant_id]
    ).catch(() => ({ rows: [{ count: '0' }] }));

    return `📊 ${rest.name}
Status: ${statusText}
Reviews tracked: ${reviewCount.rows[0].count}
Billing: Active${HELP_SUFFIX}`;
  }

  private async handleBilling(phone: string, ctx: SmsContext): Promise<string> {
    if (!ctx.restaurant_id) {
      return `No account found for this phone number. Contact support@maitreo.com for help.${HELP_SUFFIX}`;
    }

    const result = await query<{ stripe_customer_id: string | null }>(
      `SELECT stripe_customer_id FROM restaurants WHERE id = $1`,
      [ctx.restaurant_id]
    );

    const customerId = result.rows[0]?.stripe_customer_id;
    if (!customerId) {
      return `No billing account found. Complete signup first at https://maitreo.com/pricing${HELP_SUFFIX}`;
    }

    try {
      const portalUrl = await createPortalSession(customerId);
      return `Manage billing: ${portalUrl} (expires in 1 hour).${HELP_SUFFIX}`;
    } catch (err) {
      console.error('Failed to create portal session:', err);
      return `Unable to generate billing link. Contact support@maitreo.com for help.${HELP_SUFFIX}`;
    }
  }

  private async handleCancel(phone: string, ctx: SmsContext): Promise<string> {
    await updateContext(phone, { state: 'waiting_for_cancel_confirm' });
    return TEMPLATES.cancelPrompt;
  }

  private async handleCancelConfirm(phone: string, ctx: SmsContext): Promise<string> {
    if (!ctx.restaurant_id) {
      await updateContext(phone, { state: null });
      return `No account found. Contact support@maitreo.com.${HELP_SUFFIX}`;
    }

    // Get Stripe subscription ID
    const result = await query<{ stripe_subscription_id: string | null }>(
      `SELECT stripe_subscription_id FROM restaurants WHERE id = $1`,
      [ctx.restaurant_id]
    );

    const subId = result.rows[0]?.stripe_subscription_id;

    if (subId) {
      try {
        await cancelSubscription(subId);
        console.log(`🚫 Stripe subscription ${subId} canceled for restaurant ${ctx.restaurant_id}`);
      } catch (err) {
        console.error('🚨 HIGH SEVERITY: Stripe cancellation failed for subscription', subId, err);
        // Do NOT update local state — Stripe still considers subscription active
        await updateContext(phone, { state: null });
        return `Cancellation failed, please try again or contact support@maitreo.com.${HELP_SUFFIX}`;
      }
    }

    // Update local DB state only after successful Stripe cancellation
    await query(
      `UPDATE restaurants SET
         subscription_state = 'canceled',
         monitoring_paused = true,
         updated_at = NOW()
       WHERE id = $1`,
      [ctx.restaurant_id]
    );

    await updateContext(phone, { state: null });
    console.log(`🚫 Cancellation confirmed for phone ${phone}`);
    return `Subscription canceled. You won't be charged again.${HELP_SUFFIX}`;
  }

  // ─── Competitor Watch Handlers ───────────────────────────────────

  private async handleCompetitorScan(phone: string, ctx: SmsContext): Promise<string> {
    if (!ctx.restaurant_id) return `No account found. Contact support@maitreo.com.${HELP_SUFFIX}`;

    const restResult = await query<{ name: string; lat: number; lng: number; google_place_id: string }>(
      `SELECT name, lat, lng, google_place_id FROM restaurants WHERE id = $1`,
      [ctx.restaurant_id]
    );
    const rest = restResult.rows[0];
    if (!rest?.lat || !rest?.lng) {
      return `We need your restaurant's location to scan competitors. Contact support@maitreo.com.${HELP_SUFFIX}`;
    }

    try {
      const places = await nearbySearch(rest.lat, rest.lng, rest.google_place_id);
      if (places.length === 0) {
        return `No competitors found within 5 miles with 50+ reviews.${HELP_SUFFIX}`;
      }

      const list = places
        .slice(0, 10)
        .map((p, i) => `${i + 1}. ${p.name} (${p.rating ?? '?'}★, ${p.user_ratings_total ?? '?'} reviews)`)
        .join('\n');

      // Store scan results temporarily in context (as pending)
      await query(
        `UPDATE sms_context SET state = 'waiting_for_competitor_add', updated_at = NOW() WHERE phone = $1`,
        [phone]
      );

      // Cache scan results for ADD command
      await query(
        `INSERT INTO sms_context (phone, state) VALUES ($1, 'waiting_for_competitor_add')
         ON CONFLICT (phone) DO UPDATE SET state = 'waiting_for_competitor_add', updated_at = NOW()`,
        [phone]
      );

      // Store places in temp table or metadata — simplified: store JSON in context
      // For now, return the list and let COMPETITOR ADD <name> use text search
      return `📍 Nearby competitors:\n${list}\n\nReply COMPETITOR ADD <name> to track one.${HELP_SUFFIX}`;
    } catch (err: any) {
      console.error('Competitor scan failed:', err.message);
      return `Scan temporarily unavailable. Try again later.${HELP_SUFFIX}`;
    }
  }

  private async handleCompetitorAdd(phone: string, ctx: SmsContext, name?: string): Promise<string> {
    if (!ctx.restaurant_id) return `No account found. Contact support@maitreo.com.${HELP_SUFFIX}`;
    if (!name) return `Please specify a name: COMPETITOR ADD <restaurant name>${HELP_SUFFIX}`;

    // Check limit
    const countResult = await query<{ cnt: string }>(
      `SELECT COUNT(*) AS cnt FROM competitors WHERE restaurant_id = $1`,
      [ctx.restaurant_id]
    );
    if (parseInt(countResult.rows[0]?.cnt ?? '0') >= 25) {
      return `You've reached the 25 competitor limit. Remove one first: COMPETITOR REMOVE <name>${HELP_SUFFIX}`;
    }

    const restResult = await query<{ lat: number; lng: number }>(
      `SELECT lat, lng FROM restaurants WHERE id = $1`,
      [ctx.restaurant_id]
    );
    const rest = restResult.rows[0];
    if (!rest?.lat || !rest?.lng) {
      return `Location not set. Contact support@maitreo.com.${HELP_SUFFIX}`;
    }

    try {
      const places = await textSearch(name, rest.lat, rest.lng);
      if (places.length === 0) {
        return `No results found for "${name}". Try a more specific name.${HELP_SUFFIX}`;
      }

      const place = places[0];
      await query(
        `INSERT INTO competitors (restaurant_id, place_id, name, lat, lng, added_by)
         VALUES ($1, $2, $3, $4, $5, 'user')
         ON CONFLICT (restaurant_id, place_id) DO NOTHING`,
        [ctx.restaurant_id, place.place_id, place.name, place.lat, place.lng]
      );

      return `✅ Added ${place.name} (${place.rating ?? '?'}★) to your competitor watch.${HELP_SUFFIX}`;
    } catch (err: any) {
      console.error('Competitor add failed:', err.message);
      return `Could not add competitor. Try again later.${HELP_SUFFIX}`;
    }
  }

  private async handleCompetitorList(phone: string, ctx: SmsContext): Promise<string> {
    if (!ctx.restaurant_id) return `No account found. Contact support@maitreo.com.${HELP_SUFFIX}`;

    const result = await query<{ name: string; created_at: string }>(
      `SELECT name, created_at FROM competitors WHERE restaurant_id = $1 ORDER BY created_at ASC`,
      [ctx.restaurant_id]
    );

    if (result.rows.length === 0) {
      return `No competitors tracked yet. Reply COMPETITOR SCAN to find nearby competitors.${HELP_SUFFIX}`;
    }

    const list = result.rows.map((c, i) => `${i + 1}. ${c.name}`).join('\n');
    return `📊 Tracked competitors (${result.rows.length}/25):\n${list}\n\nReply COMPETITOR REMOVE <name> to remove one.${HELP_SUFFIX}`;
  }

  private async handleCompetitorRemove(phone: string, ctx: SmsContext, identifier?: string): Promise<string> {
    if (!ctx.restaurant_id) return `No account found. Contact support@maitreo.com.${HELP_SUFFIX}`;
    if (!identifier) return `Please specify: COMPETITOR REMOVE <name or number>${HELP_SUFFIX}`;

    // Try by number first
    const num = parseInt(identifier);
    if (!isNaN(num)) {
      const listResult = await query<{ id: string; name: string }>(
        `SELECT id, name FROM competitors WHERE restaurant_id = $1 ORDER BY created_at ASC LIMIT 25`,
        [ctx.restaurant_id]
      );
      const comp = listResult.rows[num - 1];
      if (!comp) return `No competitor at position ${num}. Reply COMPETITOR LIST to see your list.${HELP_SUFFIX}`;

      await query(`DELETE FROM competitors WHERE id = $1`, [comp.id]);
      return `✅ Removed ${comp.name} from your competitor watch.${HELP_SUFFIX}`;
    }

    // Try by name (partial match)
    const result = await query<{ id: string; name: string }>(
      `SELECT id, name FROM competitors WHERE restaurant_id = $1 AND name ILIKE $2 LIMIT 1`,
      [ctx.restaurant_id, `%${identifier}%`]
    );

    if (result.rows.length === 0) {
      return `No competitor matching "${identifier}" found. Reply COMPETITOR LIST to see your list.${HELP_SUFFIX}`;
    }

    await query(`DELETE FROM competitors WHERE id = $1`, [result.rows[0].id]);
    return `✅ Removed ${result.rows[0].name} from your competitor watch.${HELP_SUFFIX}`;
  }
}

export const smsService = new SmsService();
