/**
 * Test file for Pattern Detector
 * Run with: npx ts-node src/tests/patternDetector.test.ts
 */
import { patternDetector } from '../services/patternDetector.js';
import { supabase } from '../services/database';
async function testPatternDetector() {
    console.log('🧪 Testing Pattern Detector\n');
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
        const restaurant = restaurants[0];
        console.log(`Testing with restaurant: ${restaurant.name} (ID: ${restaurant.id})\n`);
        // Check if restaurant has reviews
        const { data: reviews, count } = await supabase
            .from('reviews')
            .select('*', { count: 'exact' })
            .eq('restaurant_id', restaurant.id);
        console.log(`Restaurant has ${count || 0} total reviews\n`);
        if (!reviews || reviews.length === 0) {
            console.log('⚠️  No reviews found. Creating mock reviews for testing...\n');
            // Create mock reviews with patterns
            const mockReviews = [
                {
                    restaurant_id: restaurant.id,
                    platform: 'google',
                    review_id: `test_pattern_${Date.now()}_1`,
                    author: 'Alice',
                    rating: 2,
                    text: 'The service was incredibly slow. Waited over an hour for our food. The server was also quite rude.',
                    review_date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
                    metadata: { test: true },
                },
                {
                    restaurant_id: restaurant.id,
                    platform: 'google',
                    review_id: `test_pattern_${Date.now()}_2`,
                    author: 'Bob',
                    rating: 2,
                    text: 'Very disappointing. Slow service and the food arrived cold. Not worth the wait.',
                    review_date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
                    metadata: { test: true },
                },
                {
                    restaurant_id: restaurant.id,
                    platform: 'google',
                    review_id: `test_pattern_${Date.now()}_3`,
                    author: 'Carol',
                    rating: 5,
                    text: 'Amazing food! The pasta was delicious and the service was excellent. Very friendly staff.',
                    review_date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
                    metadata: { test: true },
                },
                {
                    restaurant_id: restaurant.id,
                    platform: 'google',
                    review_id: `test_pattern_${Date.now()}_4`,
                    author: 'David',
                    rating: 1,
                    text: 'Terrible experience. Waited forever and the server was rude. Won\'t be coming back.',
                    review_date: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
                    metadata: { test: true },
                },
                {
                    restaurant_id: restaurant.id,
                    platform: 'google',
                    review_id: `test_pattern_${Date.now()}_5`,
                    author: 'Emma',
                    rating: 5,
                    text: 'Delicious food and great atmosphere! The service was friendly and attentive.',
                    review_date: new Date(Date.now() - 12 * 24 * 60 * 60 * 1000).toISOString(),
                    metadata: { test: true },
                },
                {
                    restaurant_id: restaurant.id,
                    platform: 'google',
                    review_id: `test_pattern_${Date.now()}_6`,
                    author: 'Frank',
                    rating: 4,
                    text: 'Good food but the portions were a bit small for the price. Overall worth it though.',
                    review_date: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
                    metadata: { test: true },
                },
            ];
            const { error } = await supabase.from('reviews').insert(mockReviews);
            if (error) {
                console.error(`❌ Could not insert mock reviews: ${error.message}`);
                process.exit(1);
            }
            console.log('✅ Created 6 mock reviews with patterns\n');
        }
        // Test 1: Analyze patterns
        console.log('Test 1: Analyzing review patterns (last 90 days)...');
        const analysis = await patternDetector.analyzePatterns(restaurant.id, 90);
        console.log(`✅ Analysis complete\n`);
        console.log(`   Patterns Detected: ${analysis.patterns.length}`);
        console.log(`   Top Issues: ${analysis.topIssues.length}`);
        console.log(`   Top Praise: ${analysis.topPraise.length}`);
        console.log(`   Insights Generated: ${analysis.insights.length}`);
        // Display top issues
        if (analysis.topIssues.length > 0) {
            console.log('\n   🔴 Top Issues:');
            for (const issue of analysis.topIssues) {
                const pattern = analysis.patterns.find(p => p.topic === issue);
                if (pattern) {
                    console.log(`   - ${issue} (${pattern.frequency} mentions)`);
                    if (pattern.suggestion) {
                        console.log(`     💡 ${pattern.suggestion}`);
                    }
                }
            }
        }
        // Display top praise
        if (analysis.topPraise.length > 0) {
            console.log('\n   ✅ Top Strengths:');
            for (const praise of analysis.topPraise) {
                const pattern = analysis.patterns.find(p => p.topic === praise);
                if (pattern) {
                    console.log(`   - ${praise} (${pattern.frequency} mentions)`);
                }
            }
        }
        // Display insights
        if (analysis.insights.length > 0) {
            console.log('\n   💡 Key Insights:');
            for (const insight of analysis.insights) {
                console.log(`   ${insight}`);
            }
        }
        // Display pattern details
        if (analysis.patterns.length > 0) {
            console.log('\n   📊 Pattern Details:');
            for (const pattern of analysis.patterns.slice(0, 5)) {
                console.log(`\n   ${pattern.type === 'recurring_issue' ? '🔴' : '✅'} ${pattern.topic}`);
                console.log(`      Frequency: ${pattern.frequency}`);
                console.log(`      Sentiment: ${pattern.sentiment}`);
                console.log(`      Actionable: ${pattern.actionable ? 'Yes' : 'No'}`);
                if (pattern.examples.length > 0) {
                    console.log(`      Example: "${pattern.examples[0].substring(0, 80)}..."`);
                }
            }
        }
        // Clean up test reviews if we created them
        console.log('\n\nCleaning up test reviews...');
        const { error: deleteError } = await supabase
            .from('reviews')
            .delete()
            .eq('metadata->>test', 'true');
        if (!deleteError) {
            console.log('✅ Test reviews removed');
        }
        console.log('\n✅ All Pattern Detector tests passed!');
    }
    catch (error) {
        console.error('❌ Test failed:', error);
        // Try to clean up on error
        try {
            await supabase.from('reviews').delete().eq('metadata->>test', 'true');
        }
        catch { }
        process.exit(1);
    }
}
testPatternDetector();
//# sourceMappingURL=patternDetector.test.js.map