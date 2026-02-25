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
  /**
   * Log email to database
   */
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

  /**
   * Update email log status
   */
  private async updateEmailStatus(
    logId: string,
    status: EmailLog['status'],
    error_message?: string
  ): Promise<void> {
    await query(
      `UPDATE email_logs 
       SET status = $1, sent_at = $2, error_message = $3
       WHERE id = $4`,
      [status, status === 'sent' ? new Date() : null, error_message || null, logId]
    );
  }

  /**
   * Send reply draft email to restaurant owner
   */
  async sendReplyDraftEmail(
    ownerEmail: string,
    restaurantName: string,
    review: Review,
    replyDraft: ReplyDraft
  ): Promise<void> {
    const subject = `New ${review.rating}★ Review Reply Draft - ${restaurantName}`;
    
    const html = this.buildReplyDraftEmailHTML(restaurantName, review, replyDraft);

    const logId = await this.logEmail(
      'reply_draft',
      ownerEmail,
      subject,
      'pending',
      { restaurant_name: restaurantName },
      { review_id: review.id, reply_draft_id: replyDraft.id }
    );

    try {
      const { data, error } = await getResend().emails.send({
        from: FROM_EMAIL,
        to: ownerEmail,
        subject,
        html,
      });

      if (error) {
        throw new Error(error.message);
      }

      await this.updateEmailStatus(logId, 'sent');
      console.log(`✅ Reply draft email sent to ${ownerEmail} (log: ${logId})`);
      
    } catch (error: any) {
      await this.updateEmailStatus(logId, 'failed', error.message);
      console.error(`❌ Failed to send reply draft email:`, error);
      throw error;
    }
  }

  /**
   * Build HTML for reply draft email
   */
  private buildReplyDraftEmailHTML(
    restaurantName: string,
    review: Review,
    replyDraft: ReplyDraft
  ): string {
    const escalationBadge = replyDraft.escalation_flag
      ? `<div style="background: #fef2f2; border-left: 4px solid #dc2626; padding: 12px; margin: 16px 0;">
           <strong style="color: #dc2626;">⚠️ ESCALATION ALERT</strong>
           <p style="margin: 4px 0 0; color: #991b1b;">
             This review contains: ${replyDraft.escalation_reasons.join(', ').replace(/_/g, ' ')}
           </p>
         </div>`
      : '';

    const ratingStars = '★'.repeat(review.rating) + '☆'.repeat(5 - review.rating);

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>New Review Reply Draft</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  
  <div style="background: #f8fafc; border-radius: 8px; padding: 24px; margin-bottom: 24px;">
    <h1 style="margin: 0 0 8px; color: #1e293b; font-size: 24px;">New Review Reply Ready</h1>
    <p style="margin: 0; color: #64748b; font-size: 14px;">${restaurantName}</p>
  </div>

  ${escalationBadge}

  <div style="background: white; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
    <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 12px;">
      <div>
        <strong style="color: #1e293b; font-size: 16px;">${review.author || 'Anonymous'}</strong>
        <div style="color: #f59e0b; font-size: 18px; margin: 4px 0;">${ratingStars}</div>
      </div>
      <div style="text-align: right; font-size: 12px; color: #64748b;">
        <div>${review.platform}</div>
        <div>${review.review_date ? new Date(review.review_date).toLocaleDateString() : 'Recent'}</div>
      </div>
    </div>
    <p style="margin: 12px 0 0; color: #475569; font-style: italic; padding: 12px; background: #f8fafc; border-radius: 4px;">
      "${review.text}"
    </p>
  </div>

  <div style="background: #f0fdf4; border: 1px solid #86efac; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
    <h2 style="margin: 0 0 12px; color: #166534; font-size: 18px;">📝 Suggested Reply</h2>
    <div style="white-space: pre-wrap; color: #065f46; line-height: 1.8;">${replyDraft.draft_text}</div>
  </div>

  <div style="background: #eff6ff; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
    <h3 style="margin: 0 0 12px; color: #1e40af; font-size: 16px;">What's Next?</h3>
    <ol style="margin: 0; padding-left: 20px; color: #1e40af;">
      <li style="margin-bottom: 8px;">Review the suggested reply above</li>
      <li style="margin-bottom: 8px;">Edit if needed to match your voice</li>
      <li style="margin-bottom: 8px;">Post your reply on ${review.platform}</li>
      ${replyDraft.escalation_flag ? '<li style="margin-bottom: 8px;"><strong>Consider following up directly given the escalation</strong></li>' : ''}
    </ol>
  </div>

  <div style="text-align: center; margin: 32px 0;">
    <a href="${this.getPlatformReviewUrl(review)}" 
       style="display: inline-block; background: #3b82f6; color: white; text-decoration: none; padding: 12px 32px; border-radius: 6px; font-weight: 500;">
      Reply on ${review.platform}
    </a>
  </div>

  <div style="text-align: center; padding-top: 24px; border-top: 1px solid #e2e8f0; color: #64748b; font-size: 12px;">
    <p>This is an automated email from your Restaurant SaaS system.</p>
    <p>Review ID: ${review.id} • Draft ID: ${replyDraft.id}</p>
  </div>

</body>
</html>
    `.trim();
  }

  /**
   * Get platform-specific review URL (placeholder - needs actual platform URLs)
   */
  private getPlatformReviewUrl(review: Review): string {
    // TODO: Build actual URLs based on platform and review_id
    const platformUrls: Record<string, string> = {
      google: 'https://business.google.com/reviews',
      yelp: 'https://biz.yelp.com/inbox',
      tripadvisor: 'https://www.tripadvisor.com/ManagementCenter',
      facebook: 'https://www.facebook.com/reviews',
    };
    return platformUrls[review.platform] || '#';
  }

  /**
   * Send weekly newsletter
   */
  async sendNewsletterEmail(
    ownerEmail: string,
    restaurantName: string,
    newsletter: Newsletter
  ): Promise<void> {
    const weekStart = new Date(newsletter.week_start_date).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
    
    const subject = `Your Weekly Competitive Intelligence Report - Week of ${weekStart}`;

    const logId = await this.logEmail(
      'newsletter',
      ownerEmail,
      subject,
      'pending',
      { restaurant_name: restaurantName, week_start: newsletter.week_start_date },
      { newsletter_id: newsletter.id }
    );

    try {
      const { data, error } = await getResend().emails.send({
        from: FROM_EMAIL,
        to: ownerEmail,
        subject,
        html: newsletter.content_html,
      });

      if (error) {
        throw new Error(error.message);
      }

      await this.updateEmailStatus(logId, 'sent');
      
      // Update newsletter sent_at
      await query(
        `UPDATE newsletters SET sent_at = NOW() WHERE id = $1`,
        [newsletter.id]
      );

      console.log(`✅ Newsletter sent to ${ownerEmail} (log: ${logId})`);
      
    } catch (error: any) {
      await this.updateEmailStatus(logId, 'failed', error.message);
      console.error(`❌ Failed to send newsletter:`, error);
      throw error;
    }
  }

  /**
   * Send batch emails with rate limiting
   */
  async sendBatch(
    emails: Array<{
      type: 'reply_draft' | 'newsletter';
      ownerEmail: string;
      restaurantName: string;
      data: any;
    }>
  ): Promise<void> {
    console.log(`📧 Sending ${emails.length} emails in batch...`);
    
    for (const email of emails) {
      try {
        if (email.type === 'reply_draft') {
          await this.sendReplyDraftEmail(
            email.ownerEmail,
            email.restaurantName,
            email.data.review,
            email.data.replyDraft
          );
        } else if (email.type === 'newsletter') {
          await this.sendNewsletterEmail(
            email.ownerEmail,
            email.restaurantName,
            email.data.newsletter
          );
        }
        
        // Rate limiting: wait 100ms between emails
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error) {
        console.error(`Failed to send email to ${email.ownerEmail}:`, error);
        // Continue with remaining emails
      }
    }
    
    console.log(`✅ Batch email sending complete`);
  }
}

export const emailService = new EmailService();
