/**
 * SMS Service — Full Command Engine for Maitreo
 * Handles all 8 commands + STOP compliance + context/state tracking.
 */
import type { Review, ReplyDraft, Restaurant } from '../types/models.js';
export declare class SmsService {
    private twilioPhone;
    /**
     * Send an SMS and log it.
     */
    sendSms(to: string, body: string): Promise<void>;
    /**
     * Send a mock review alert (for testing until Agent 1 is done).
     */
    sendMockReviewAlert(toPhone: string, restaurantId?: string): Promise<void>;
    /**
     * Send review alert for a real review + draft.
     */
    sendReviewAlert(review: Review, draft: ReplyDraft, restaurant: Restaurant, ownerPhone: string): Promise<string>;
    /**
     * Handle an incoming SMS — the main command dispatcher.
     */
    handleIncoming(fromPhone: string, body: string, messageSid?: string): Promise<string>;
    private handleStop;
    private handleApprove;
    private handleEdit;
    private handleCustomReply;
    private handleIgnore;
    private handlePause;
    private handleResume;
    private handleStatus;
    private handleBilling;
    private handleCancel;
    private handleCancelConfirm;
}
export declare const smsService: SmsService;
//# sourceMappingURL=smsService.d.ts.map