/**
 * SMS Service — Full Command Engine for Maitreo
 * Handles all 8 commands + STOP compliance + context/state tracking.
 */

import { query } from '../db/client.js';
import { twilioClient } from './twilioClient.js';
import { parseCommand, type CommandType, type ParsedCommand } from './commandParser.js';
import { createPortalSession, cancelSubscription } from '../services/stripeService.js';
import type { Review, ReplyDraft, Restaurant } from '../types/models.js';

const HELP_SUFFIX = '\nReply HELP anytime.';

// ─── Message Templates ───────────────────────────────────────────────

const TEMPLATES = {
  help: `Maitreo Commands:
Review: APPROVE, EDIT, IGNORE
Account: PAUSE, RESUME, STATUS
Billing: BILLING, CANCEL
Support: text 'help' or email support@maitreo.com${HELP_SUFFIX}`,

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

  unknownCommand: `Sorry, I didn't understand that command.\n\nMaitreo Commands:
Review: APPROVE, EDIT, IGNORE
Account: PAUSE, RESUME, STATUS
Billing: BILLING, CANCEL
Support: text 'help' or email support@maitreo.com${HELP_SUFFIX}`,
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
        return TEMPLATES.cancelDeny;
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
        console.error('Failed to cancel Stripe subscription:', err);
        // Still update local state even if Stripe call fails
      }
    }

    // Update local DB state
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
}

export const smsService = new SmsService();
