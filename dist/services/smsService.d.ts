interface ReviewData {
    reviewId: string;
    author: string;
    rating: number;
    text: string;
    platform: string;
    restaurantName: string;
}
interface PendingApproval {
    reviewId: string;
    draftReply: string;
    ownerPhone: string;
    createdAt: Date;
}
/**
 * Send an approval SMS for a negative review
 */
export declare function sendApprovalRequest(to: string, reviewData: ReviewData, draftReply: string): Promise<string>;
/**
 * Handle incoming SMS webhook from Twilio
 * Returns TwiML response string
 */
export declare function handleIncomingSMS(from: string, body: string): Promise<{
    action: 'approve' | 'edit' | 'skip' | 'unknown';
    reviewId: string | null;
    responseText: string;
}>;
/**
 * Get pending approval for a phone number
 */
export declare function getPendingApproval(phone: string): PendingApproval | undefined;
export {};
//# sourceMappingURL=smsService.d.ts.map