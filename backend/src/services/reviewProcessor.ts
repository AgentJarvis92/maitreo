/**
 * Review Processor - Main Pipeline
 * 
 * Orchestrates: Fetch → Classify → Generate Reply → Route (auto-post or SMS approval)
 * 
 * Currently uses mock reply generator. 
 * TODO: Swap generatePlaceholderReply with OpenAI replyGenerator once API is active.
 */

import { supabase } from './database.js';
import { classifySentiment, type SentimentResult } from './sentimentClassifier.js';
import { generatePlaceholderReply } from './mockReplyGenerator.js';
import { twilioClient } from '../sms/twilioClient.js';
import type { Review, Restaurant, GenerateReplyOutput } from '../types/models.js';

export interface ProcessResult {
  reviewId: string;
  sentiment: string;
  action: 'auto_posted' | 'sms_approval' | 'error';
  draftId?: string;
  error?: string;
}

/**
 * Format SMS for approval request
 */
function formatApprovalSms(review: Review, draftReply: string, restaurant: Restaurant): string {
  const stars = '⭐'.repeat(review.rating);
  const snippet = (review.text || '').slice(0, 120);
  const draftSnippet = draftReply.slice(0, 200);

  return [
    `🍽️ ${restaurant.name}`,
    `New ${review.rating}★ review on ${review.platform}:`,
    `${stars} from ${review.author || 'Anonymous'}`,
    `"${snippet}"`,
    ``,
    `Our draft reply:`,
    `"${draftSnippet}"`,
    ``,
    `Reply YES to post, NO to skip, or type your own response.`,
  ].join('\n');
}

/**
 * Mock posting a reply (logs it, doesn't actually post to Google/Yelp)
 * TODO: Replace with actual Google Business Profile API posting
 */
async function mockPostReply(review: Review, replyText: string): Promise<void> {
  console.log(`📤 [MOCK POST] Would post reply to ${review.platform} for review ${review.review_id}:`);
  console.log(`   "${replyText.slice(0, 100)}..."`);
}

/**
 * Process a single review through the full pipeline.
 */
export async function processReview(review: Review, restaurant: Restaurant): Promise<ProcessResult> {
  try {
    // 1. Classify sentiment
    const sentimentResult: SentimentResult = classifySentiment(review.rating, review.text || '');
    const sentiment = sentimentResult.sentiment;
    console.log(`  🏷️  Review ${review.id}: ${review.rating}★ → ${sentiment} (score: ${sentimentResult.score})`);

    // 2. Generate reply (PLACEHOLDER - TODO: integrate OpenAI)
    const replyOutput: GenerateReplyOutput = generatePlaceholderReply(review, sentiment as any, restaurant);

    // 3. Store draft in database
    const { data: draft, error: draftError } = await supabase
      .from('reply_drafts')
      .insert({
        review_id: review.id,
        draft_text: replyOutput.draft_text,
        escalation_flag: replyOutput.escalation_flag,
        escalation_reasons: replyOutput.escalation_reasons,
        ai_confidence: replyOutput.confidence_score,
        ai_model_version: 'placeholder-v1', // TODO: Change to 'gpt-4o' when OpenAI is active
        status: sentiment === 'positive' ? 'approved' : 'pending',
      })
      .select()
      .single();

    if (draftError) throw new Error(`Failed to create draft: ${draftError.message}`);

    // 4. Route based on sentiment
    if (sentiment === 'positive' || sentiment === 'neutral') {
      // Auto-post (mock for now)
      await mockPostReply(review, replyOutput.draft_text);

      // Update status
      await supabase
        .from('reply_drafts')
        .update({ status: 'sent', approved_at: new Date().toISOString() })
        .eq('id', draft.id);

      console.log(`  ✅ Positive review → auto-posted (mock)`);
      return { reviewId: review.id, sentiment, action: 'auto_posted', draftId: draft.id };

    } else {
      // Negative review → SMS approval flow
      const ownerPhone = (restaurant as any).owner_phone;
      
      if (ownerPhone && twilioClient.isConfigured) {
        const smsBody = formatApprovalSms(review, replyOutput.draft_text, restaurant);
        try {
          const result = await twilioClient.sendSms(ownerPhone, smsBody);
          console.log(`  📱 Negative review → SMS sent to ${ownerPhone} (SID: ${result.sid})`);
        } catch (smsErr) {
          console.error(`  ⚠️  SMS failed: ${(smsErr as Error).message}`);
        }
      } else {
        console.log(`  ⚠️  Negative review → No phone configured, draft pending manual approval`);
      }

      return { reviewId: review.id, sentiment, action: 'sms_approval', draftId: draft.id };
    }

  } catch (error) {
    console.error(`  ❌ Error processing review ${review.id}:`, error);
    return { reviewId: review.id, sentiment: 'unknown', action: 'error', error: (error as Error).message };
  }
}

/**
 * Process all new reviews for a restaurant.
 */
export async function processNewReviews(
  reviews: Review[],
  restaurant: Restaurant
): Promise<ProcessResult[]> {
  const results: ProcessResult[] = [];
  for (const review of reviews) {
    const result = await processReview(review, restaurant);
    results.push(result);
  }
  return results;
}
