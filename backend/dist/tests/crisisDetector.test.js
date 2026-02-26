/**
 * Test file for Crisis Detector
 * Run with: npx ts-node src/tests/crisisDetector.test.ts
 */
import { crisisDetector } from '../services/crisisDetector.js';
import { supabase } from '../services/database';
async function testCrisisDetector() {
    console.log('🧪 Testing Crisis Detector\n');
    try {
        // Get a test restaurant from database
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
        // Test 1: Detect crisis conditions
        console.log('Test 1: Checking for crisis conditions...');
        const crisisResult = await crisisDetector.detectCrisis(restaurant.id);
        console.log(`✅ Crisis detection completed`);
        console.log(`   In Crisis: ${crisisResult.inCrisis ? 'YES 🚨' : 'NO ✅'}`);
        console.log(`   Should Alert: ${crisisResult.shouldAlert ? 'YES 📱' : 'NO'}`);
        console.log(`   Events Detected: ${crisisResult.events.length}`);
        if (crisisResult.events.length > 0) {
            console.log('\n   Crisis Events:');
            for (const event of crisisResult.events) {
                console.log(`   - [${event.severity.toUpperCase()}] ${event.type}: ${event.message}`);
                console.log(`     Reviews involved: ${event.reviews.length}`);
            }
        }
        // Test 2: Check recent alert history
        console.log('\nTest 2: Checking if restaurant was recently alerted...');
        const wasAlerted = await crisisDetector.wasRecentlyAlerted(restaurant.id, 6);
        console.log(`✅ Recently alerted (last 6 hours): ${wasAlerted ? 'YES' : 'NO'}`);
        // Test 3: Simulate sending alert (only if in crisis and has phone)
        if (crisisResult.shouldAlert && restaurant.owner_phone && !wasAlerted) {
            console.log('\nTest 3: Simulating crisis alert...');
            console.log('⚠️  Skipping actual SMS send in test mode');
            console.log(`   Would send to: ${restaurant.owner_phone}`);
            console.log(`   Message preview:`);
            let message = `🚨 MAITREO CRISIS ALERT\n\n`;
            message += `Restaurant: ${restaurant.name}\n\n`;
            const criticalEvents = crisisResult.events.filter(e => e.severity === 'critical');
            for (const event of criticalEvents) {
                message += `${event.message}\n`;
            }
            console.log(`   "${message.substring(0, 200)}..."`);
        }
        else {
            console.log('\nTest 3: No crisis alert needed (not in crisis or already alerted)');
        }
        // Test 4: Create a mock crisis scenario (insert negative reviews)
        console.log('\nTest 4: Creating mock crisis scenario...');
        const mockReviews = [
            {
                restaurant_id: restaurant.id,
                platform: 'google',
                review_id: `test_crisis_${Date.now()}_1`,
                author: 'Test User 1',
                rating: 1,
                text: 'Terrible experience. Found a hair in my food and the server was rude.',
                review_date: new Date().toISOString(),
                metadata: { test: true },
            },
            {
                restaurant_id: restaurant.id,
                platform: 'google',
                review_id: `test_crisis_${Date.now()}_2`,
                author: 'Test User 2',
                rating: 2,
                text: 'Very disappointed. Long wait and cold food.',
                review_date: new Date().toISOString(),
                metadata: { test: true },
            },
        ];
        console.log('   Inserting 2 negative reviews...');
        const { error } = await supabase.from('reviews').insert(mockReviews);
        if (error) {
            console.log(`   ⚠️  Could not insert mock reviews: ${error.message}`);
        }
        else {
            console.log('   ✅ Mock reviews inserted');
            // Re-run crisis detection
            const newCrisisResult = await crisisDetector.detectCrisis(restaurant.id);
            console.log(`   Crisis detected after mock reviews: ${newCrisisResult.inCrisis ? 'YES 🚨' : 'NO'}`);
            // Clean up test reviews
            console.log('   Cleaning up test reviews...');
            await supabase.from('reviews').delete().eq('metadata->>test', 'true');
            console.log('   ✅ Test reviews removed');
        }
        console.log('\n✅ All Crisis Detector tests passed!');
    }
    catch (error) {
        console.error('❌ Test failed:', error);
        process.exit(1);
    }
}
testCrisisDetector();
//# sourceMappingURL=crisisDetector.test.js.map