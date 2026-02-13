/**
 * Test file for Competitor Tracker
 * Run with: npx ts-node src/tests/competitorTracker.test.ts
 */

import { competitorTracker } from '../services/competitorTracker.js';
import { supabase } from '../services/database.js';
import type { Restaurant } from '../types/models.js';

async function testCompetitorTracker() {
  console.log('🧪 Testing Competitor Tracker\n');

  try {
    // Get a test restaurant
    const { data: restaurants } = await supabase
      .from('restaurants')
      .select('*')
      .limit(1);

    if (!restaurants || restaurants.length === 0) {
      console.error('❌ No restaurants found in database. Please add a test restaurant first.');
      process.exit(1);
    }

    let restaurant = restaurants[0] as Restaurant;
    console.log(`Testing with restaurant: ${restaurant.name}\n`);

    // Test 1: Find nearby competitors
    if (!restaurant.competitors_json || restaurant.competitors_json.length === 0) {
      console.log('Test 1: Finding nearby competitors...');
      const location = restaurant.location || 'New York, NY';
      const competitors = await competitorTracker.findNearbyCompetitors(
        restaurant.name,
        location,
        'restaurant'
      );

      console.log(`✅ Found ${competitors.length} potential competitors`);
      
      if (competitors.length > 0) {
        console.log('   Top competitors:');
        for (const comp of competitors.slice(0, 5)) {
          console.log(`   - ${comp.name} (${comp.platform})`);
        }

        // Save competitors to restaurant
        console.log('\n   Saving competitors to restaurant profile...');
        const { error } = await supabase
          .from('restaurants')
          .update({ competitors_json: competitors })
          .eq('id', restaurant.id);

        if (error) {
          console.log(`   ⚠️  Could not save competitors: ${error.message}`);
        } else {
          console.log('   ✅ Competitors saved');
          restaurant.competitors_json = competitors;
        }
      }
    } else {
      console.log('Test 1: Restaurant already has competitors configured');
      console.log(`   Tracking ${restaurant.competitors_json.length} competitors`);
    }

    // Test 2: Track competitors
    if (restaurant.competitors_json && restaurant.competitors_json.length > 0) {
      console.log('\nTest 2: Tracking competitor metrics...');
      const metrics = await competitorTracker.trackCompetitors(restaurant);
      
      console.log(`✅ Tracked ${metrics.length} competitors`);
      
      for (const metric of metrics) {
        console.log(`\n   ${metric.name}:`);
        console.log(`   - Rating: ${metric.currentRating}★ (${metric.ratingTrend})`);
        console.log(`   - Reviews: ${metric.currentReviewCount}`);
        console.log(`   - Velocity: ${metric.weeklyReviewVelocity.toFixed(1)} reviews/week`);
        console.log(`   - Growth Anomaly: ${metric.growthAnomaly ? '🚨 YES' : 'No'}`);
        if (metric.anomalyDetails) {
          console.log(`     ${metric.anomalyDetails}`);
        }
      }

      // Test 3: Generate insights
      console.log('\nTest 3: Generating competitor insights...');
      const insights = competitorTracker.generateInsights(metrics);
      
      console.log(`✅ Generated ${insights.length} insights`);
      
      if (insights.length > 0) {
        console.log('\n   Key Insights:');
        for (const insight of insights) {
          const icon = insight.impact === 'high' ? '🔴' : insight.impact === 'medium' ? '🟡' : '🟢';
          console.log(`   ${icon} [${insight.type}] ${insight.message}`);
        }
      } else {
        console.log('   No significant insights detected');
      }
    } else {
      console.log('\nTest 2 & 3: Skipped (no competitors configured)');
    }

    console.log('\n✅ All Competitor Tracker tests passed!');
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

testCompetitorTracker();
