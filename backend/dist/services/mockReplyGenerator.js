const ESCALATION_KEYWORDS = {
    health_issue: ['food poisoning', 'sick', 'illness', 'contaminated', 'hygiene', 'health department', 'unclean'],
    threat: ['sue', 'lawsuit', 'lawyer', 'attorney', 'police', 'assault', 'violence'],
    discrimination: ['racist', 'sexist', 'discriminat', 'prejudice', 'homophobic', 'transphobic'],
    refund_request: ['refund', 'money back', 'charge back', 'chargeback', 'reimburse', 'compensation'],
    legal_concern: ['violation', 'illegal', 'law', 'regulation', 'compliance'],
    extreme_negativity: ['worst', 'horrible', 'disgusting', 'never again', 'warning others'],
};
/**
 * Mock Reply Generator - Uses templates instead of OpenAI
 * Use this while waiting for OpenAI billing to activate
 */
export class MockReplyGeneratorService {
    /**
     * Detects escalation triggers in review text
     */
    detectEscalations(reviewText) {
        const text = reviewText.toLowerCase();
        const escalations = [];
        for (const [reason, keywords] of Object.entries(ESCALATION_KEYWORDS)) {
            if (keywords.some(keyword => text.includes(keyword))) {
                escalations.push(reason);
            }
        }
        return [...new Set(escalations)];
    }
    /**
     * Generate mock reply based on rating
     */
    generateMockReply(review, restaurant, escalations) {
        const rating = review.rating;
        const restaurantName = restaurant.name;
        const hasEscalation = escalations.length > 0;
        // Escalation templates (serious issues)
        if (hasEscalation) {
            return `Thank you for bringing this to our attention. We take your concerns very seriously and would like to discuss this with you directly. Please contact us at ${restaurant.phone || '(phone)'} or ${restaurant.email || '(email)'} so we can address this properly.`;
        }
        // 5-star templates
        if (rating === 5) {
            const templates = [
                `Thank you so much for the amazing review! We're thrilled you enjoyed your experience at ${restaurantName}. We can't wait to serve you again soon!`,
                `We're so glad you had a great time at ${restaurantName}! Your kind words mean the world to our team. Hope to see you again soon!`,
                `Thanks for the five stars! It's customers like you that make what we do so rewarding. Looking forward to your next visit!`,
            ];
            return templates[Math.floor(Math.random() * templates.length)];
        }
        // 4-star templates
        if (rating === 4) {
            const templates = [
                `Thank you for your positive feedback! We're so glad you enjoyed your visit to ${restaurantName}. We're always working to improve, and we'd love to earn that fifth star next time!`,
                `Thanks for dining with us! We appreciate the 4-star review and would love to hear any suggestions on how we can make your next experience even better.`,
                `We're happy you had a good experience! Thanks for choosing ${restaurantName}. Hope to see you again soon!`,
            ];
            return templates[Math.floor(Math.random() * templates.length)];
        }
        // 3-star templates
        if (rating === 3) {
            const templates = [
                `Thank you for your feedback. We're glad you gave us a try, but we're sorry we didn't fully meet your expectations. We'd love to hear more about your experience and make it right. Please reach out to us directly.`,
                `Thanks for taking the time to share your thoughts. We're always working to improve, and your feedback helps us do that. We hope you'll give us another chance to serve you better.`,
                `We appreciate your honest review. We're sorry your experience wasn't perfect, and we'd like to make it up to you. Please contact us so we can discuss how to improve.`,
            ];
            return templates[Math.floor(Math.random() * templates.length)];
        }
        // 2-star templates
        if (rating === 2) {
            const templates = [
                `We're truly sorry your experience at ${restaurantName} didn't meet expectations. This isn't the standard we hold ourselves to. Please reach out to us directly at ${restaurant.phone || '(phone)'} so we can make this right.`,
                `Thank you for bringing this to our attention. We're disappointed to hear about your experience and would like the opportunity to address your concerns. Please contact us so we can discuss this further.`,
                `We sincerely apologize for falling short. Your feedback is important to us, and we'd like to make things right. Please give us a call or send us a message.`,
            ];
            return templates[Math.floor(Math.random() * templates.length)];
        }
        // 1-star templates
        const templates = [
            `We're very sorry to hear about your experience. This is not acceptable, and we take full responsibility. Please contact us immediately at ${restaurant.phone || '(phone)'} or ${restaurant.email || '(email)'} so we can resolve this.`,
            `We sincerely apologize for your terrible experience at ${restaurantName}. This is absolutely not the level of service we strive for. Please reach out to us directly so we can make this right and regain your trust.`,
            `Thank you for bringing this to our attention, though we're devastated to hear about your visit. We would like to speak with you personally to address this. Please contact us at your earliest convenience.`,
        ];
        return templates[Math.floor(Math.random() * templates.length)];
    }
    /**
     * Generate reply using mock templates
     */
    async generateReply(input) {
        const { review, restaurant } = input;
        try {
            // Detect escalations
            const escalations = this.detectEscalations(review.text || '');
            const escalation_flag = escalations.length > 0;
            console.log(`🤖 [MOCK] Generating reply for review ${review.id} (${review.platform}, ${review.rating}★)`);
            if (escalation_flag) {
                console.log(`⚠️  Escalation detected: ${escalations.join(', ')}`);
            }
            // Generate mock reply
            const draft_text = this.generateMockReply(review, restaurant, escalations);
            console.log(`✅ [MOCK] Reply generated: "${draft_text.substring(0, 50)}..."`);
            return {
                draft_text,
                escalation_flag,
                escalation_reasons: escalations,
                confidence_score: 0.8, // Mock confidence
            };
        }
        catch (error) {
            console.error('❌ Error generating mock reply:', error);
            throw error;
        }
    }
    /**
     * Batch generate replies
     */
    async generateRepliesBatch(inputs) {
        console.log(`📦 [MOCK] Generating ${inputs.length} replies in batch...`);
        const results = await Promise.allSettled(inputs.map(input => this.generateReply(input)));
        const outputs = [];
        const errors = [];
        results.forEach((result, index) => {
            if (result.status === 'fulfilled') {
                outputs.push(result.value);
            }
            else {
                console.error(`Failed to generate reply for review ${inputs[index].review.id}:`, result.reason);
                errors.push(result.reason);
            }
        });
        console.log(`✅ [MOCK] Batch complete: ${outputs.length} successes, ${errors.length} failures`);
        return outputs;
    }
}
export const mockReplyGenerator = new MockReplyGeneratorService();
//# sourceMappingURL=mockReplyGenerator.js.map