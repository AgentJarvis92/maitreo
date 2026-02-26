import OpenAI from 'openai';
import dotenv from 'dotenv';
dotenv.config();
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});
const ESCALATION_KEYWORDS = {
    health_issue: ['food poisoning', 'sick', 'illness', 'contaminated', 'hygiene', 'health department', 'unclean'],
    threat: ['sue', 'lawsuit', 'lawyer', 'attorney', 'police', 'assault', 'violence'],
    discrimination: ['racist', 'sexist', 'discriminat', 'prejudice', 'homophobic', 'transphobic'],
    refund_request: ['refund', 'money back', 'charge back', 'chargeback', 'reimburse', 'compensation'],
    legal_concern: ['violation', 'illegal', 'law', 'regulation', 'compliance'],
    extreme_negativity: ['worst', 'horrible', 'disgusting', 'never again', 'warning others'],
};
export class ReplyGeneratorService {
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
        return [...new Set(escalations)]; // Remove duplicates
    }
    /**
     * Builds the system prompt for GPT-4 based on restaurant tone profile
     */
    buildSystemPrompt(restaurant) {
        var _a, _b, _c, _d;
        const tone = ((_a = restaurant.tone_profile_json) === null || _a === void 0 ? void 0 : _a.tone) || 'professional';
        const personality = ((_b = restaurant.tone_profile_json) === null || _b === void 0 ? void 0 : _b.personality) || [];
        const avoid = ((_c = restaurant.tone_profile_json) === null || _c === void 0 ? void 0 : _c.avoid) || [];
        const emphasis = ((_d = restaurant.tone_profile_json) === null || _d === void 0 ? void 0 : _d.emphasis) || [];
        return `You are a professional customer service assistant for ${restaurant.name}, a restaurant located in ${restaurant.location || 'the area'}.

Your task is to generate thoughtful, empathetic replies to customer reviews.

TONE & STYLE:
- Overall tone: ${tone}
${personality.length > 0 ? `- Personality traits: ${personality.join(', ')}` : ''}
${avoid.length > 0 ? `- AVOID: ${avoid.join(', ')}` : ''}
${emphasis.length > 0 ? `- Emphasize: ${emphasis.join(', ')}` : ''}

GUIDELINES:
1. Thank the customer for their feedback (positive or negative)
2. For positive reviews: Express genuine appreciation and invite them back
3. For negative reviews: 
   - Acknowledge their concerns with empathy
   - Apologize sincerely if appropriate
   - Offer to make it right (but don't make specific promises without authorization)
   - Provide a way to continue the conversation offline if serious
4. Keep replies concise (2-4 sentences for positive, 3-5 for negative)
5. Be authentic and avoid generic corporate-speak
6. Match the customer's level of formality
7. Never be defensive or argumentative

For SERIOUS ISSUES (health, threats, discrimination, legal):
- Keep the public reply brief and professional
- Express concern and provide contact info for offline resolution
- Do NOT admit fault or make commitments`;
    }
    /**
     * Builds the user prompt with review details
     */
    buildUserPrompt(review, escalations) {
        const isEscalation = escalations.length > 0;
        let prompt = `Generate a reply to this ${review.rating}-star review:\n\n`;
        prompt += `Platform: ${review.platform}\n`;
        prompt += `Author: ${review.author || 'Anonymous'}\n`;
        prompt += `Rating: ${review.rating}/5\n`;
        prompt += `Review: "${review.text}"\n\n`;
        if (isEscalation) {
            prompt += `⚠️ ESCALATION DETECTED: ${escalations.join(', ')}\n`;
            prompt += `Keep this reply brief and professional. Invite them to contact you directly.\n\n`;
        }
        prompt += `Generate TWO different reply options (label them "Option 1:" and "Option 2:"). `;
        prompt += `Make them distinctly different in approach while maintaining the brand voice.`;
        return prompt;
    }
    /**
     * Generate reply drafts for a review using GPT-4
     */
    async generateReply(input) {
        var _a, _b, _c;
        const { review, restaurant } = input;
        try {
            // Detect escalations
            const escalations = this.detectEscalations(review.text || '');
            const escalation_flag = escalations.length > 0;
            // Build prompts
            const systemPrompt = this.buildSystemPrompt(restaurant);
            const userPrompt = this.buildUserPrompt(review, escalations);
            console.log(`🤖 Generating reply for review ${review.id} (${review.platform}, ${review.rating}★)`);
            if (escalation_flag) {
                console.log(`⚠️  Escalation detected: ${escalations.join(', ')}`);
            }
            // Call GPT-4
            const completion = await openai.chat.completions.create({
                model: 'gpt-4-turbo-preview',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt },
                ],
                temperature: 0.7,
                max_tokens: 500,
            });
            const draft_text = ((_b = (_a = completion.choices[0]) === null || _a === void 0 ? void 0 : _a.message) === null || _b === void 0 ? void 0 : _b.content) || '';
            if (!draft_text) {
                throw new Error('GPT-4 returned empty response');
            }
            console.log(`✅ Reply generated successfully (${draft_text.length} chars)`);
            return {
                draft_text,
                escalation_flag,
                escalation_reasons: escalations,
                confidence_score: ((_c = completion.choices[0]) === null || _c === void 0 ? void 0 : _c.finish_reason) === 'stop' ? 0.9 : 0.7,
            };
        }
        catch (error) {
            console.error('❌ Error generating reply:', error);
            throw error;
        }
    }
    /**
     * Batch generate replies for multiple reviews
     */
    async generateRepliesBatch(inputs) {
        console.log(`📦 Generating ${inputs.length} replies in batch...`);
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
        console.log(`✅ Batch complete: ${outputs.length} successes, ${errors.length} failures`);
        return outputs;
    }
}
export const replyGenerator = new ReplyGeneratorService();
//# sourceMappingURL=replyGenerator.js.map