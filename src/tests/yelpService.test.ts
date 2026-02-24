/**
 * Test file for Yelp Service
 * Run with: npx ts-node src/tests/yelpService.test.ts
 */

import { yelpService } from '../services/yelpService.js';

async function testYelpService() {
  console.log('🧪 Testing Yelp Service\n');

  try {
    // Test 1: Search for restaurants
    console.log('Test 1: Searching for pizza restaurants in New York...');
    const searchResults = await yelpService.searchBusinesses('pizza', 'New York, NY', 8047, 5);
    console.log(`✅ Found ${searchResults.total} businesses (showing ${searchResults.businesses.length})`);
    
    if (searchResults.businesses.length > 0) {
      const first = searchResults.businesses[0];
      console.log(`   Top result: ${first.name} (${first.rating}★, ${first.reviewCount} reviews)`);
      console.log(`   Location: ${first.location.city}, ${first.location.state}`);
      
      // Test 2: Get business details
      console.log('\nTest 2: Getting detailed business info...');
      const details = await yelpService.getBusinessDetails(first.id);
      if (details) {
        console.log(`✅ ${details.name}`);
        console.log(`   Rating: ${details.rating}★`);
        console.log(`   Reviews: ${details.reviewCount}`);
        console.log(`   Categories: ${details.categories.join(', ')}`);
        console.log(`   Price: ${details.price || 'N/A'}`);
      }

      // Test 3: Fetch reviews
      console.log('\nTest 3: Fetching reviews...');
      const reviews = await yelpService.fetchReviews(first.id);
      console.log(`✅ Fetched ${reviews.length} reviews`);
      
      if (reviews.length > 0) {
        const review = reviews[0];
        console.log(`   Latest: ${review.rating}★ by ${review.author}`);
        console.log(`   "${review.text.substring(0, 100)}..."`);
      }
    }

    // Test 4: Search by coordinates
    console.log('\nTest 4: Searching by coordinates (NYC)...');
    const coordResults = await yelpService.searchByCoordinates(
      'italian restaurant',
      40.7580,
      -73.9855,
      5000,
      3
    );
    console.log(`✅ Found ${coordResults.businesses.length} restaurants near Times Square`);

    console.log('\n✅ All Yelp Service tests passed!');
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

testYelpService();
