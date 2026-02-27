import { Resend } from 'resend';
import dotenv from 'dotenv';
import { query } from '../db/client.js';
import type { Review, ReplyDraft, Newsletter, EmailLog } from '../types/models.js';

dotenv.config();

let _resend: Resend | null = null;
function getResend(): Resend {
  if (!_resend) {
    const key = process.env.RESEND_API_KEY;
    if (!key) throw new Error('RESEND_API_KEY not set — cannot send emails');
    _resend = new Resend(key);
  }
  return _resend;
}
const FROM_EMAIL = process.env.FROM_EMAIL || 'noreply@maitreo.com';

export class EmailService {
  private async logEmail(
    type: EmailLog['type'],
    to_email: string,
    subject: string,
    status: EmailLog['status'],
    metadata: any = {},
    relatedIds?: {
      review_id?: string;
      reply_draft_id?: string;
      newsletter_id?: string;
    }
  ): Promise<string> {
    const result = await query<{ id: string }>(
      `INSERT INTO email_logs (type, to_email, subject, status, sent_at, metadata, review_id, reply_draft_id, newsletter_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [
        type,
        to_email,
        subject,
        status,
        status === 'sent' ? new Date() : null,
        JSON.stringify(metadata),
        relatedIds?.review_id || null,
        relatedIds?.reply_draft_id || null,
        relatedIds?.newsletter_id || null,
      ]
    );

    return result.rows[0].id;
  }

  private async updateEmailStatus(
    logId: string,
    status: EmailLog['status'],
    error_message?: string
  ): Promise<void> {
    await query(
      `UPDATE email_logs SET status = $1, sent_at = $2, error_message = $3 WHERE id = $4`,
      [status, status === 'sent' ? new Date() : null, error_message || null, logId]
    );
  }

  async sendReplyDraftEmail(
    ownerEmail: string,
    restaurantName: string,
    review: Review,
    replyDraft: ReplyDraft
  ): Promise<void> {
    const subject = `New ${review.rating}★ Review Reply Draft - ${restaurantName}`;
    const html = this.buildReplyDraftEmailHTML(restaurantName, review, replyDraft);
    const logId = await this.logEmail('reply_draft', ownerEmail, subject, 'pending', { restaurant_name: restaurantName }, { review_id: review.id, reply_draft_id: replyDraft.id });

    try {
      const { data, error } = await getResend().emails.send({ from: FROM_EMAIL, to: ownerEmail, subject, html });
      if (error) throw new Error(error.message);
      await this.updateEmailStatus(logId, 'sent');
      console.log(`✅ Reply draft email sent to ${ownerEmail}`);
    } catch (error: any) {
      await this.updateEmailStatus(logId, 'failed', error.message);
      console.error(`❌ Failed to send reply draft email:`, error);
      throw error;
    }
  }

  private buildReplyDraftEmailHTML(restaurantName: string, review: Review, replyDraft: ReplyDraft): string {
    const escalationBadge = replyDraft.escalation_flag ? `<div style="background: #fef2f2; border-left: 4px solid #dc2626; padding: 12px; margin: 16px 0;"><strong style="color: #dc2626;">⚠️ ESCALATION ALERT</strong><p style="margin: 4px 0 0; color: #991b1b;">${replyDraft.escalation_reasons.join(', ').replace(/_/g, ' ')}</p></div>` : '';
    const ratingStars = '★'.repeat(review.rating) + '☆'.repeat(5 - review.rating);

    return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>New Review Reply Draft</title></head><body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;"><div style="background: #f8fafc; border-radius: 8px; padding: 24px; margin-bottom: 24px;"><h1 style="margin: 0 0 8px; color: #1e293b; font-size: 24px;">New Review Reply Ready</h1><p style="margin: 0; color: #64748b; font-size: 14px;">${restaurantName}</p></div>${escalationBadge}<div style="background: white; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin-bottom: 24px;"><div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 12px;"><div><strong style="color: #1e293b; font-size: 16px;">${review.author || 'Anonymous'}</strong><div style="color: #f59e0b; font-size: 18px; margin: 4px 0;">${ratingStars}</div></div><div style="text-align: right; font-size: 12px; color: #64748b;"><div>${review.platform}</div><div>${review.review_date ? new Date(review.review_date).toLocaleDateString() : 'Recent'}</div></div></div><p style="margin: 12px 0 0; color: #475569; font-style: italic; padding: 12px; background: #f8fafc; border-radius: 4px;">"${review.text}"</p></div><div style="background: #f0fdf4; border: 1px solid #86efac; border-radius: 8px; padding: 20px; margin-bottom: 24px;"><h2 style="margin: 0 0 12px; color: #166534; font-size: 18px;">📝 Suggested Reply</h2><div style="white-space: pre-wrap; color: #065f46; line-height: 1.8;">${replyDraft.draft_text}</div></div><div style="text-align: center; padding-top: 24px; border-top: 1px solid #e2e8f0; color: #64748b; font-size: 12px;"><p>Review ID: ${review.id} • Draft ID: ${replyDraft.id}</p></div></body></html>`;
  }

  private getPlatformReviewUrl(review: Review): string {
    const platformUrls: Record<string, string> = { google: 'https://business.google.com/reviews', yelp: 'https://biz.yelp.com/inbox', tripadvisor: 'https://www.tripadvisor.com/ManagementCenter', facebook: 'https://www.facebook.com/reviews' };
    return platformUrls[review.platform] || '#';
  }

  async sendNewsletterEmail(ownerEmail: string, restaurantName: string, newsletter: Newsletter): Promise<void> {
    const weekStart = new Date(newsletter.week_start_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    const subject = `Your Weekly Competitive Intelligence Report - Week of ${weekStart}`;
    const logId = await this.logEmail('newsletter', ownerEmail, subject, 'pending', { restaurant_name: restaurantName, week_start: newsletter.week_start_date }, { newsletter_id: newsletter.id });

    try {
      const { data, error } = await getResend().emails.send({ from: FROM_EMAIL, to: ownerEmail, subject, html: newsletter.content_html });
      if (error) throw new Error(error.message);
      await this.updateEmailStatus(logId, 'sent');
      await query(`UPDATE newsletters SET sent_at = NOW() WHERE id = $1`, [newsletter.id]);
      console.log(`✅ Newsletter sent to ${ownerEmail}`);
    } catch (error: any) {
      await this.updateEmailStatus(logId, 'failed', error.message);
      console.error(`❌ Failed to send newsletter:`, error);
      throw error;
    }
  }

  async sendBatch(emails: Array<{ type: 'reply_draft' | 'newsletter'; ownerEmail: string; restaurantName: string; data: any }>): Promise<void> {
    for (const email of emails) {
      try {
        if (email.type === 'reply_draft') {
          await this.sendReplyDraftEmail(email.ownerEmail, email.restaurantName, email.data.review, email.data.replyDraft);
        } else if (email.type === 'newsletter') {
          await this.sendNewsletterEmail(email.ownerEmail, email.restaurantName, email.data.newsletter);
        }
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        console.error(`Failed to send email to ${email.ownerEmail}:`, error);
      }
    }
  }

  async sendActivationEmail(ownerEmail: string, restaurantName: string, manageSubscriptionUrl: string, unsubscribeUrl: string = ''): Promise<void> {
    const subject = `Maitreo is now active for ${restaurantName}`;
    const html = this.buildActivationEmailHTML(restaurantName, manageSubscriptionUrl, unsubscribeUrl);
    const logId = await this.logEmail('welcome', ownerEmail, subject, 'pending', { restaurant_name: restaurantName });

    try {
      const { data, error } = await getResend().emails.send({ from: FROM_EMAIL, to: ownerEmail, subject, html });
      if (error) throw new Error(error.message);
      await this.updateEmailStatus(logId, 'sent');
      console.log(`✅ Activation email sent to ${ownerEmail}`);
    } catch (error: any) {
      await this.updateEmailStatus(logId, 'failed', error.message);
      console.error(`❌ Failed to send activation email:`, error);
      throw error;
    }
  }

  private buildActivationEmailHTML(restaurantName: string, manageSubscriptionUrl: string, unsubscribeUrl: string): string {
    return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Maitreo Activation</title>
</head>
<body style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background: #f2f2f0; margin: 0; padding: 40px 20px;">
<div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 4px; box-shadow: 0 2px 4px rgba(0,0,0,0.05); overflow: hidden;">

<!-- HEADER WITH LOGO -->
<div style="padding: 60px 40px 50px; text-align: center; border-bottom: 1px solid #e5e5e5;">
<svg width="48" height="48" viewBox="0 0 1000 1000" style="margin: 0 auto 16px; display: block;">
<path fill="#000000" d="M500,999.94C224.3,999.94,0,775.65,0,499.95S224.3-.05,500-.05s500,224.3,500,500-224.3,500-500,500ZM500,71.92c-236.01,0-428.02,192.01-428.02,428.02s192.01,428.02,428.02,428.02,428.02-192.01,428.02-428.02S736.02,71.92,500,71.92Z"/>
<rect fill="#000000" x="679.07" y="244.75" width="71.98" height="510.39"/>
<rect fill="#000000" x="175.33" y="463.96" width="649.33" height="71.98"/>
<rect fill="#000000" x="472.05" y="293.72" width="71.97" height="349.04"/>
<rect fill="#000000" x="265.02" y="244.75" width="71.98" height="510.39"/>
</svg>
<div style="font-size: 11px; font-weight: 500; letter-spacing: 3px; text-transform: uppercase; color: #1a1a1a;">Maitreo</div>
</div>

<!-- MAIN CONTENT -->
<div style="padding: 60px 40px;">

<h1 style="font-size: 28px; font-weight: 300; color: #1a1a1a; margin: 0 0 40px; line-height: 1.3;">Maitreo is now active for ${restaurantName}.</h1>

<p style="font-size: 15px; color: #4a4a4a; line-height: 1.7; margin: 0 0 24px;">Your Google Business Profile is now being monitored. Every new review will be analyzed instantly, and you'll receive an SMS alert with a drafted response ready for your approval.</p>

<p style="font-size: 15px; color: #4a4a4a; line-height: 1.7; margin: 0 0 48px;">No dashboard. No logins. Just a text when something needs attention.</p>

<div style="height: 1px; background: #e5e5e5; margin: 0 0 48px;"></div>

<h2 style="font-size: 11px; font-weight: 500; letter-spacing: 1px; text-transform: uppercase; color: #999; margin: 0 0 32px;">When a review arrives</h2>

<table style="width: 100%; border-collapse: collapse; margin: 0 0 48px;">
<tr style="border-bottom: 1px solid #f0f0f0;">
<td style="padding: 14px 0; font-family: 'Courier New', monospace; font-size: 11px; font-weight: 700; color: #1a1a1a; width: 100px;">APPROVE</td>
<td style="padding: 14px 0 14px 24px; font-size: 13px; color: #666;">Post the reply instantly</td>
</tr>
<tr style="border-bottom: 1px solid #f0f0f0;">
<td style="padding: 14px 0; font-family: 'Courier New', monospace; font-size: 11px; font-weight: 700; color: #1a1a1a; width: 100px;">EDIT</td>
<td style="padding: 14px 0 14px 24px; font-size: 13px; color: #666;">Revise before posting</td>
</tr>
<tr style="border-bottom: 1px solid #f0f0f0;">
<td style="padding: 14px 0; font-family: 'Courier New', monospace; font-size: 11px; font-weight: 700; color: #1a1a1a; width: 100px;">IGNORE</td>
<td style="padding: 14px 0 14px 24px; font-size: 13px; color: #666;">Mark as handled</td>
</tr>
<tr style="border-bottom: 1px solid #f0f0f0;">
<td style="padding: 14px 0; font-family: 'Courier New', monospace; font-size: 11px; font-weight: 700; color: #1a1a1a; width: 100px;">PAUSE</td>
<td style="padding: 14px 0 14px 24px; font-size: 13px; color: #666;">Temporarily stop monitoring</td>
</tr>
<tr style="border-bottom: 1px solid #f0f0f0;">
<td style="padding: 14px 0; font-family: 'Courier New', monospace; font-size: 11px; font-weight: 700; color: #1a1a1a; width: 100px;">RESUME</td>
<td style="padding: 14px 0 14px 24px; font-size: 13px; color: #666;">Restart monitoring</td>
</tr>
<tr style="border-bottom: 1px solid #f0f0f0;">
<td style="padding: 14px 0; font-family: 'Courier New', monospace; font-size: 11px; font-weight: 700; color: #1a1a1a; width: 100px;">STATUS</td>
<td style="padding: 14px 0 14px 24px; font-size: 13px; color: #666;">Check system status</td>
</tr>
<tr style="border-bottom: 1px solid #f0f0f0;">
<td style="padding: 14px 0; font-family: 'Courier New', monospace; font-size: 11px; font-weight: 700; color: #1a1a1a; width: 100px;">BILLING</td>
<td style="padding: 14px 0 14px 24px; font-size: 13px; color: #666;">Manage subscription</td>
</tr>
</table>

<div style="height: 1px; background: #e5e5e5; margin: 0 0 48px;"></div>

<h2 style="font-size: 11px; font-weight: 500; letter-spacing: 1px; text-transform: uppercase; color: #999; margin: 0 0 16px;">Your Subscription</h2>

<p style="font-size: 14px; color: #4a4a4a; line-height: 1.7; margin: 0 0 20px;">Your subscription is active. To manage billing, update your card, or cancel at any time, simply reply <span style="font-family: 'Courier New', monospace; font-weight: 700;">BILLING</span> to any Maitreo message.</p>

<a href="${manageSubscriptionUrl}" style="display: inline-block; font-size: 12px; color: #1a1a1a; text-decoration: none; border-bottom: 1px solid #1a1a1a; padding-bottom: 4px; margin-top: 16px;">Manage or cancel your subscription →</a>

<div style="text-align: center; margin-top: 60px; padding-top: 48px; border-top: 1px solid #e5e5e5;">
<div style="font-family: 'Playfair Display', serif; font-style: italic; font-size: 24px; color: #1a1a1a; margin-bottom: 32px;">Reputation, handled.</div>
<div style="display: inline-block; padding: 6px 14px; background: #fcfcfb; border: 1px solid #e0e0e0; border-radius: 20px;">
<span style="display: inline-block; width: 6px; height: 6px; background: #4ade80; border-radius: 50%; margin-right: 8px; vertical-align: middle;"></span>
<span style="font-size: 8px; font-weight: 600; letter-spacing: 1px; text-transform: uppercase; color: #1a1a1a;">Active Monitoring</span>
</div>
</div>

</div>

<!-- FOOTER -->
<div style="background: #fafaf8; padding: 40px; text-align: center; border-top: 1px solid #f0f0f0; font-size: 11px; color: #888;">
<p style="margin: 0 0 12px; color: #999; font-size: 10px; text-transform: uppercase; letter-spacing: 1px;">© 2025 Maitreo Inc.</p>
<p style="margin: 0;">
<a href="mailto:hello@maitreo.com" style="color: #888; text-decoration: none;">hello@maitreo.com</a>
<span style="color: #ccc; margin: 0 8px;">|</span>
<a href="${manageSubscriptionUrl}" style="color: #888; text-decoration: none;">Manage subscription</a>
<span style="color: #ccc; margin: 0 8px;">|</span>
<a href="${unsubscribeUrl}" style="color: #888; text-decoration: none;">Email preferences</a>
</p>
</div>

</div>
</body>
</html>`;
  }
}

export const emailService = new EmailService();
