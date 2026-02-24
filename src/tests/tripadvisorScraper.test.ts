/**
 * Test file for TripAdvisor Scraper
 * Run with: npx ts-node src/tests/tripadvisorScraper.test.ts
 */

import { tripadvisorScraper } from '../services/tripadvisorScraper.js';

async function testTripAdvisorScraper() {
  console.log('🧪 Testing TripAdvisor Scraper\n');

  try {
    // Use a well-known restaurant URL for testing
    // Example: Popular NYC restaurant (replace with a real URL you want to test)
    const testUrl = 'https://www.tripadvisor.com/Restaurant_Review-g60763-d456789-Reviews-Test_Restaurant-New_York_City_New_York.html';
    
    console.log('⚠️  NOTE: TripAdvisor scraper requires a real restaurant URL');
    console.log('Please replace testUrl in the test file with an actual TripAdvisor restaurant URL\n');

    // Test 1: Scrape business info
    console.log('Test 1: Scraping business information...');
    const businessInfo = await tripadvisorScraper.scrapeBusinessInfo(testUrl);
    
    if (businessInfo) {
      console.log(`✅ Restaurant: ${businessInfo.name}`);
      console.log(`   Rating: ${businessInfo.rating}★`);
      console.log(`   Reviews: ${businessInfo.reviewCount}`);
      console.log(`   Ranking: ${businessInfo.ranking || 'N/A'}`);
      console.log(`   Cuisines: ${businessInfo.cuisines.join(', ')}`);
    } else {
      console.log('⚠️  Could not fetch business info (likely invalid URL or scraper needs update)');
    }

    // Test 2: Scrape reviews (1 page)
    console.log('\nTest 2: Scraping reviews (1 page)...');
    const reviews = await tripadvisorScraper.scrapeReviews(testUrl, 1);
    
    if (reviews.length > 0) {
      console.log(`✅ Scraped ${reviews.length} reviews`);
      
      const review = reviews[0];
      console.log(`   Latest: ${review.rating}★ by ${review.author}`);
      console.log(`   Title: "${review.title}"`);
      console.log(`   "${review.text.substring(0, 100)}..."`);
      console.log(`   Date: ${review.date.toISOString()}`);
    } else {
      console.log('⚠️  No reviews scraped (HTML structure may have changed or invalid URL)');
    }

    // Test 3: Scrape with date filter
    console.log('\nTest 3: Scraping recent reviews (since 30 days ago)...');
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const recentReviews = await tripadvisorScraper.scrapeReviews(testUrl, 2, thirtyDaysAgo);
    console.log(`✅ Found ${recentReviews.length} reviews from the last 30 days`);

    console.log('\n✅ TripAdvisor Scraper tests completed!');
    console.log('⚠️  Note: Web scraping may break if TripAdvisor changes their HTML structure');
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

testTripAdvisorScraper();
