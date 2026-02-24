#!/usr/bin/env node

/**
 * Test script for Google Places API (New)
 * Tests: Search for place, fetch details, get reviews
 */

import dotenv from 'dotenv';
import axios from 'axios';

dotenv.config();

const PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY;
const BASE_URL = 'https://places.googleapis.com/v1';

// Test 1: Search for a restaurant
async function searchRestaurant(query) {
  console.log(`\n🔍 Searching for: "${query}"`);
  
  try {
    const response = await axios.post(
      `${BASE_URL}/places:searchText`,
      { textQuery: query },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': PLACES_API_KEY,
          'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount'
        }
      }
    );
    
    if (response.data.places && response.data.places.length > 0) {
      const place = response.data.places[0];
      console.log(`✅ Found: ${place.displayName.text}`);
      console.log(`   Address: ${place.formattedAddress}`);
      console.log(`   Rating: ${place.rating} ⭐ (${place.userRatingCount} reviews)`);
      console.log(`   Place ID: ${place.id}`);
      return place.id;
    } else {
      console.log('❌ No results found');
      return null;
    }
  } catch (error) {
    console.error('❌ Search failed:', error.response?.data || error.message);
    return null;
  }
}

// Test 2: Get place details with reviews
async function getPlaceReviews(placeId) {
  console.log(`\n📝 Fetching reviews for place ID: ${placeId}`);
  
  try {
    const response = await axios.get(
      `${BASE_URL}/places/${placeId}`,
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': PLACES_API_KEY,
          'X-Goog-FieldMask': 'displayName,reviews'
        }
      }
    );
    
    const reviews = response.data.reviews || [];
    console.log(`✅ Found ${reviews.length} reviews\n`);
    
    reviews.forEach((review, index) => {
      console.log(`Review ${index + 1}:`);
      console.log(`  ⭐ ${review.rating}/5`);
      console.log(`  👤 ${review.authorAttribution?.displayName || 'Anonymous'}`);
      console.log(`  📅 ${review.relativePublishTimeDescription || 'Unknown date'}`);
      console.log(`  💬 "${review.text?.text?.substring(0, 150)}..."`);
      console.log('');
    });
    
    return reviews;
  } catch (error) {
    console.error('❌ Failed to fetch reviews:', error.response?.data || error.message);
    return [];
  }
}

// Test 3: Generate GPT-4 reply for a review
async function generateReply(review) {
  console.log(`\n🤖 Generating AI reply for ${review.rating}-star review...`);
  
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  
  try {
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: 'You are a restaurant owner responding to customer reviews. Be warm, professional, and human (not robotic). Keep responses under 100 words. For positive reviews, thank them warmly. For negative reviews, apologize sincerely and offer to make it right.'
          },
          {
            role: 'user',
            content: `Review (${review.rating}/5 stars): "${review.text?.text || 'No text'}"\n\nWrite a response:`
          }
        ],
        temperature: 0.7,
        max_tokens: 150
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${OPENAI_API_KEY}`
        }
      }
    );
    
    const reply = response.data.choices[0].message.content;
    console.log(`✅ Generated reply:\n"${reply}"\n`);
    return reply;
  } catch (error) {
    console.error('❌ Failed to generate reply:', error.response?.data || error.message);
    return null;
  }
}

// Run all tests
async function runTests() {
  console.log('🚀 ReviewReply - Google Places API Test\n');
  console.log('=' .repeat(50));
  
  // Test with Joe's Pizza (famous NYC restaurant)
  const placeId = await searchRestaurant('Joes Pizza Broadway New York');
  
  if (placeId) {
    const reviews = await getPlaceReviews(placeId);
    
    if (reviews.length > 0) {
      // Test AI reply generation on first review
      await generateReply(reviews[0]);
    }
  }
  
  console.log('\n' + '=' .repeat(50));
  console.log('✅ Tests complete!\n');
}

runTests().catch(console.error);
