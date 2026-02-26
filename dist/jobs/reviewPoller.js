/**
 * Review Poller Cron Job
 * Polls all active restaurants for new reviews every 15 minutes.
 * Processes each through the review pipeline (classify → reply → route).
 *
 * Usage:
 *   npx tsx src/jobs/reviewPoller.ts          # Run once
 *   npx tsx src/jobs/reviewPoller.ts --loop    # Run continuously (every 15 min)
 */
import dotenv from 'dotenv';
dotenv.config();
import { supabase } from '../services/database';
import { syncNewReviews } from '../services/reviewFetcher.js';
import { processNewReviews } from '../services/reviewProcessor.js';
const POLL_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes
/**
 * Run one poll cycle across all restaurants.
 */
export async function pollOnce() {
    console.log(`\n🔍 Review poller running at ${new Date().toISOString()}`);
    // Get all active restaurants with a google_place_id
    const { data: restaurants, error } = await supabase
        .from('restaurants')
        .select('*')
        .not('google_place_id', 'is', null);
    if (error) {
        console.error('❌ Failed to fetch restaurants:', error.message);
        return { restaurants: 0, newReviews: 0, results: [] };
    }
    if (!restaurants || restaurants.length === 0) {
        console.log('⚠️  No restaurants configured');
        return { restaurants: 0, newReviews: 0, results: [] };
    }
    console.log(`📋 Polling ${restaurants.length} restaurant(s)...`);
    let totalNew = 0;
    const allResults = [];
    for (const restaurant of restaurants) {
        const placeId = restaurant.google_place_id;
        if (!placeId)
            continue;
        console.log(`\n🏪 ${restaurant.name} (${placeId})`);
        try {
            // Fetch & sync new reviews
            const syncResult = await syncNewReviews(restaurant.id, placeId);
            console.log(`   Fetched: ${syncResult.total} total, ${syncResult.newReviews} new, ${syncResult.duplicates} dupes`);
            if (syncResult.newReviews > 0) {
                // Process new reviews through pipeline
                const results = await processNewReviews(syncResult.reviews, restaurant);
                allResults.push(...results);
                totalNew += syncResult.newReviews;
            }
        }
        catch (err) {
            console.error(`   ❌ Error: ${err.message}`);
        }
    }
    console.log(`\n📊 Poll complete: ${totalNew} new reviews across ${restaurants.length} restaurants`);
    return { restaurants: restaurants.length, newReviews: totalNew, results: allResults };
}
/**
 * Start continuous polling loop.
 */
async function startLoop() {
    console.log('🚀 Review poller started (polling every 15 min)');
    while (true) {
        try {
            await pollOnce();
        }
        catch (err) {
            console.error('❌ Poll cycle error:', err);
        }
        await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
    }
}
// CLI runner
if (import.meta.url === `file://${process.argv[1]}`) {
    const loop = process.argv.includes('--loop');
    if (loop) {
        startLoop().catch(console.error);
    }
    else {
        pollOnce().then(() => process.exit(0)).catch(err => {
            console.error(err);
            process.exit(1);
        });
    }
}
//# sourceMappingURL=reviewPoller.js.map