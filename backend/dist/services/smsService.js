import twilio from 'twilio';
import dotenv from 'dotenv';
dotenv.config();
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const FROM_NUMBER = process.env.TWILIO_PHONE_NUMBER;
// In-memory store for pending approvals (swap for DB in production)
const pendingApprovals = new Map();
/**
 * Send an approval SMS for a negative review
 */
export async function sendApprovalRequest(to, reviewData, draftReply) {
    const stars = '⭐'.repeat(reviewData.rating);
    const preview = reviewData.text.length > 100
        ? reviewData.text.slice(0, 100) + '...'
        : reviewData.text;
    const draftPreview = draftReply.length > 150
        ? draftReply.slice(0, 150) + '...'
        : draftReply;
    const body = [
        `⚠️ New ${reviewData.rating}-star review on ${reviewData.platform}`,
        `${stars} from ${reviewData.author}`,
        ``,
        `"${preview}"`,
        ``,
        `Our draft reply:`,
        `"${draftPreview}"`,
        ``,
        `Reply:`,
        `YES → Post this reply`,
        `EDIT → Visit maitreo.com/edit to customize`,
        `SKIP → Handle manually`,
    ].join('\n');
    const message = await client.messages.create({
        body,
        from: FROM_NUMBER,
        to,
    });
    // Store pending approval
    pendingApprovals.set(to, {
        reviewId: reviewData.reviewId,
        draftReply,
        ownerPhone: to,
        createdAt: new Date(),
    });
    console.log(`SMS sent to ${to}: ${message.sid}`);
    return message.sid;
}
/**
 * Handle incoming SMS webhook from Twilio
 * Returns TwiML response string
 */
export async function handleIncomingSMS(from, body) {
    const command = body.trim().toUpperCase();
    const pending = pendingApprovals.get(from);
    if (!pending) {
        return {
            action: 'unknown',
            reviewId: null,
            responseText: 'No pending review found. We\'ll send you a new notification when there\'s a review to approve.',
        };
    }
    switch (command) {
        case 'YES':
        case 'Y':
            pendingApprovals.delete(from);
            return {
                action: 'approve',
                reviewId: pending.reviewId,
                responseText: '✅ Reply approved! Posting now.',
            };
        case 'EDIT':
        case 'E':
            return {
                action: 'edit',
                reviewId: pending.reviewId,
                responseText: '✏️ Got it! Check your email for an edit link. Reply YES when you\'re done editing.',
            };
        case 'SKIP':
        case 'S':
        case 'NO':
        case 'N':
            pendingApprovals.delete(from);
            return {
                action: 'skip',
                reviewId: pending.reviewId,
                responseText: '⏭️ Skipped. You can reply manually from the dashboard.',
            };
        default:
            return {
                action: 'unknown',
                reviewId: pending.reviewId,
                responseText: 'Reply YES to post, EDIT to change, or SKIP to handle manually.',
            };
    }
}
/**
 * Get pending approval for a phone number
 */
export function getPendingApproval(phone) {
    return pendingApprovals.get(phone);
}
//# sourceMappingURL=smsService.js.map