import { sendApprovalRequest } from '../services/smsService.js';
const KEVIN_PHONE = '+18622901319';
const mockReview = {
    reviewId: 'test-001',
    author: 'Mike T.',
    rating: 2,
    text: 'Food was cold and the service was extremely slow. We waited 45 minutes for our appetizers. The waiter seemed disinterested and never refilled our drinks.',
    platform: 'Google',
    restaurantName: 'Bella Italia',
};
const mockDraft = 'Hi Mike, we\'re truly sorry about your experience. Cold food and slow service are not the standards we hold ourselves to. We\'d love the chance to make it right — please reach out to us directly and your next meal is on us.';
async function main() {
    console.log('Sending test SMS to Kevin...');
    try {
        const sid = await sendApprovalRequest(KEVIN_PHONE, mockReview, mockDraft);
        console.log(`✅ Test SMS sent! SID: ${sid}`);
    }
    catch (err) {
        console.error('❌ Failed to send SMS:', err);
    }
}
main();
//# sourceMappingURL=testSms.js.map