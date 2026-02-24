/**
 * End-to-End Pipeline Test
 * Tests: Google Places → OpenAI Reply Generation → Twilio SMS
 */
import dotenv from 'dotenv';
dotenv.config();

import { googleReviewSource } from './sources/google.js';
import { classifySentiment } from './services/sentimentClassifier.js';
import { twilioClient } from './sms/twilioClient.js';

const JOES_PIZZA_PLACE_ID = 'ChIJifIePKtZwokRVZ-UdRGkZzs';
const KEVIN_PHONE = '+18622901319';

async function testGooglePlaces() {
  console.log('\n═══ TEST 1: Google Places API ═══');
  const reviews = await googleReviewSource.fetchReviews(JOES_PIZZA_PLACE_ID);
  console.log(`✅ Fetched ${reviews.length} reviews`);
  reviews.forEach(r => {
    const sent = classifySentiment(r.rating, r.text);
    console.log(`  ${r.rating}★ [${sent.sentiment}] ${r.author}: "${r.text.slice(0, 80)}..."`);
  });
  return reviews;
}

async function testOpenAI(reviewText: string, rating: number) {
  console.log('\n═══ TEST 2: OpenAI GPT-4o Reply Generation ═══');
  const OpenAI = (await import('openai')).default;
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `You are a friendly restaurant owner responding to a customer review. 
Keep replies warm, human, and under 80 words. No corporate speak.`,
      },
      {
        role: 'user',
        content: `Write a reply to this ${rating}-star review:\n"${reviewText}"`,
      },
    ],
    temperature: 0.8,
    max_tokens: 200,
  });

  const reply = completion.choices[0]?.message?.content || '';
  console.log(`✅ Generated reply (${reply.length} chars):\n  "${reply}"`);
  return reply;
}

async function testTwilioSms(reply: string, reviewSnippet: string, rating: number) {
  console.log('\n═══ TEST 3: Twilio SMS ═══');
  if (!twilioClient.isConfigured) {
    console.log('❌ Twilio not configured');
    return;
  }

  const body = [
    `🍽️ Maitreo Test`,
    `New ${rating}★ review:`,
    `"${reviewSnippet.slice(0, 100)}..."`,
    ``,
    `AI Reply:`,
    `"${reply.slice(0, 200)}"`,
    ``,
    `Reply YES to post, SKIP to ignore, or type your edit.`,
  ].join('\n');

  const result = await twilioClient.sendSms(KEVIN_PHONE, body);
  console.log(`✅ SMS sent! SID: ${result.sid}`);
}

async function main() {
  console.log('🚀 Maitreo Phase 1 MVP - Pipeline Test\n');

  // Step 1: Fetch reviews
  const reviews = await testGooglePlaces();
  if (reviews.length === 0) {
    console.log('⚠️ No reviews fetched, using mock data');
    const mockReview = { rating: 4, text: 'Great pizza, fast delivery. The crust was perfectly crispy.' };
    const reply = await testOpenAI(mockReview.text, mockReview.rating);
    await testTwilioSms(reply, mockReview.text, mockReview.rating);
    return;
  }

  // Step 2: Pick a review and generate reply
  const review = reviews[0];
  const reply = await testOpenAI(review.text, review.rating);

  // Step 3: SMS approval
  await testTwilioSms(reply, review.text, review.rating);

  console.log('\n═══ ALL TESTS PASSED ═══');
  console.log('Pipeline: Fetch Reviews → Classify → Generate AI Reply → SMS Approval ✅');
}

main().catch(err => {
  console.error('❌ Pipeline test failed:', err);
  process.exit(1);
});
