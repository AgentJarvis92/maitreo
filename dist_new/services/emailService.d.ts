import type { Review, ReplyDraft, Newsletter } from '../types/models.js';
export declare class EmailService {
    /**
     * Log email to database
     */
    private logEmail;
    /**
     * Update email log status
     */
    private updateEmailStatus;
    /**
     * Send reply draft email to restaurant owner
     */
    sendReplyDraftEmail(ownerEmail: string, restaurantName: string, review: Review, replyDraft: ReplyDraft): Promise<void>;
    /**
     * Build HTML for reply draft email
     */
    private buildReplyDraftEmailHTML;
    /**
     * Get platform-specific review URL (placeholder - needs actual platform URLs)
     */
    private getPlatformReviewUrl;
    /**
     * Send weekly newsletter
     */
    sendNewsletterEmail(ownerEmail: string, restaurantName: string, newsletter: Newsletter): Promise<void>;
    /**
     * Send batch emails with rate limiting
     */
    sendBatch(emails: Array<{
        type: 'reply_draft' | 'newsletter';
        ownerEmail: string;
        restaurantName: string;
        data: any;
    }>): Promise<void>;
}
export declare const emailService: EmailService;
