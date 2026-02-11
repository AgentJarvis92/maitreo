/**
 * Mock Reply Generator (Temporary)
 * Generates placeholder review replies until OpenAI integration is activated.
 * 
 * TODO: Replace with OpenAI GPT-4o integration once API key is active.
 * See replyGenerator.ts for the full OpenAI implementation.
 */

import type { Review, Restaurant, GenerateReplyOutput, EscalationReason } from '../types/models.js';

const ESCALATION_KEYWORDS: Record<EscalationReason, string[]> = {
  health_issue: ['food poisoning', 'sick', 'illness', 'contaminated', 'hygiene', 'health department'],
  threat: ['sue', 'lawsuit', 'lawyer', 'attorney', 'police'],
  discrimination: ['racist', 'sexist', 'discriminat', 'prejudice'],
  refund_request: ['refund', 'money back', 'chargeback', 'reimburse'],
  legal_concern: ['violation', 'illegal', 'law', 'regulation'],
  extreme_negativity: ['worst', 'horrible', 'disgusting', 'never again'],
};

function detectEscalations(text: string): EscalationReason[] {
  const lower = (text || '').toLowerCase();
  const found: EscalationReason[] = [];
  for (const [reason, keywords] of Object.entries(ESCALATION_KEYWORDS)) {
    if (keywords.some(k => lower.includes(k))) {
      found.push(reason as EscalationReason);
    }
  }
  return found;
}

/**
 * Generate a placeholder reply based on sentiment.
 * These are simple templates — OpenAI will produce much better responses.
 */
export function generatePlaceholderReply(
  review: Review,
  sentiment: 'positive' | 'negative' | 'neutral',
  restaurant?: Restaurant
): GenerateReplyOutput {
  const name = restaurant?.name || 'our restaurant';
  const escalation_reasons = detectEscalations(review.text || '');
  const escalation_flag = escalation_reasons.length > 0;

  let draft_text: string;

  if (escalation_flag) {
    draft_text = `Thank you for bringing this to our attention. We take all feedback very seriously. ` +
      `We'd like to discuss this further — please reach out to us directly so we can make this right.`;
  } else if (sentiment === 'positive') {
    const templates = [
      `Thank you so much for the ${review.rating}-star review! We're thrilled you enjoyed your experience at ${name}. Hope to see you again soon!`,
      `Wow, thank you for the kind words! The team at ${name} really appreciates your ${review.rating}-star review. Can't wait to welcome you back!`,
      `Thank you for taking the time to leave us ${review.rating} stars! We're so glad you had a great experience. See you next time!`,
    ];
    draft_text = templates[Math.floor(Math.random() * templates.length)];
  } else {
    const templates = [
      `Thank you for your feedback. We're sorry we didn't meet your expectations this time. We'd love to make this right — please reach out to us directly.`,
      `We appreciate you sharing your experience. This isn't the standard we hold ourselves to at ${name}. We'd love the chance to make it up to you.`,
      `Thank you for letting us know. We're sorry about your experience and are working to improve. Please contact us directly so we can address your concerns.`,
    ];
    draft_text = templates[Math.floor(Math.random() * templates.length)];
  }

  return {
    draft_text,
    escalation_flag,
    escalation_reasons,
    confidence_score: 0.5, // Low confidence since it's a template, not AI-generated
  };
}
