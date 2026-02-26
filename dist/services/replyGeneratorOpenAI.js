/**
 * Reply Generator - OpenAI GPT-4o Integration
 *
 * Generates AI-powered restaurant replies using OpenAI's GPT-4o model.
 * Includes sentiment classification, escalation detection, and fallback to mock if API fails.
 */
import OpenAI from 'openai';
import { mockReplyGenerator } from './mockReplyGenerator.js';
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY || '',
});
/**
 * System prompt that guides GPT-4o to generate restaurant replies
 */
const SYSTEM_PROMPT = `You are an expert restaurant response writer. Your job is to craft warm, professional, and empathetic replies to restaurant reviews on Google and Yelp.

Your replies should:
1. Be 2-3 sentences, maximum
2. Sound human and personal (not robotic)
3. Thank the reviewer by name if available
4. Address their specific comment (don't be generic)
5. Invite them back or offer to make things right
6. Use a warm, conversational tone

For positive reviews (4-5★): Express genuine gratitude and reinforce what they loved.
For neutral reviews (3★): Acknowledge their feedback, explain context if relevant, and invite them to return.
For negative reviews (1-2★): Apologize sincerely, take responsibility, and offer a concrete next step.

Do NOT:
- Use corporate jargon
- Over-explain or make excuses
- Make promises you can't keep
- Use emojis (keep it professional)
- Repeat the review text back to them

Return ONLY the reply text, nothing else. No quotes, no labels, no preamble.`;
/**
 * Escalation keywords that trigger manual review
 */
const ESCALATION_KEYWORDS = [
    'health',
    'poisoning',
    'sick',
    'illness',
    'lawsuit',
    'legal',
    'threat',
    'harassment',
    'discrimination',
    'hate',
    'racist',
    'sexist',
    'assault',
    'violence',
];
/**
 * Check if review contains escalation triggers
 */
function detectEscalation(review) {
    const reasons = [];
    const text = (review.text || '').toLowerCase();
    if (review.rating === 1 || review.rating === 2) {
        reasons.push('extreme_negativity');
    }
    // Map keywords to proper EscalationReasons
    const keywordMap = {
        'health': 'health_issue',
        'poisoning': 'health_issue',
        'sick': 'health_issue',
        'illness': 'health_issue',
        'lawsuit': 'legal_concern',
        'legal': 'legal_concern',
        'threat': 'threat',
        'harassment': 'threat',
        'discrimination': 'discrimination',
        'hate': 'discrimination',
        'racist': 'discrimination',
        'sexist': 'discrimination',
        'assault': 'threat',
        'violence': 'threat',
        'refund': 'refund_request',
    };
    for (const [keyword, reason] of Object.entries(keywordMap)) {
        if (text.includes(keyword) && !reasons.includes(reason)) {
            reasons.push(reason);
        }
    }
    return {
        hasEscalation: reasons.length > 0,
        reasons,
    };
}
/**
 * Generate a reply for a single review using OpenAI GPT-4o
 */
export async function generateReply(review, restaurant) {
    try {
        // Check for escalation
        const escalation = detectEscalation(review);
        // Build user prompt with review context
        const userPrompt = `
Restaurant: ${restaurant.name}
Rating: ${review.rating}★ out of 5
Reviewer: ${review.author || 'Anonymous'}
Review: "${review.text || '(No text provided)'}"
Platform: ${review.platform}

Write a reply to this review.`;
        console.log(`  🤖 [GPT-4o] Generating reply for ${review.platform} review (${review.rating}★)...`);
        // Call OpenAI GPT-4o via chat completions (v4 SDK)
        const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini', // Using mini for cost efficiency with $10 credit
            max_tokens: 300,
            messages: [
                {
                    role: 'system',
                    content: SYSTEM_PROMPT,
                },
                {
                    role: 'user',
                    content: userPrompt,
                },
            ],
        });
        // Extract reply text
        const replyText = response.choices[0].message.content?.trim() || '';
        console.log(`  ✅ [GPT-4o] Reply generated (${replyText.length} chars)`);
        return {
            draft_text: replyText,
            escalation_flag: escalation.hasEscalation,
            escalation_reasons: escalation.reasons,
            confidence_score: 0.95, // GPT-4o has high confidence
        };
    }
    catch (error) {
        console.error(`  ⚠️  [GPT-4o] API error: ${error.message}`);
        console.log(`  🔄 Falling back to mock reply generator...`);
        // Fallback to mock generator on API error
        return mockReplyGenerator.generateReply({ review, restaurant });
    }
}
/**
 * Batch generate replies for multiple reviews (parallel)
 */
export async function generateRepliesBatch(reviews, restaurant) {
    return Promise.all(reviews.map((review) => generateReply(review, restaurant)));
}
//# sourceMappingURL=replyGeneratorOpenAI.js.map