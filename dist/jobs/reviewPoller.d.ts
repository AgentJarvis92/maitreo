/**
 * Review Poller Cron Job
 * Polls all active restaurants for new reviews every 15 minutes.
 * Processes each through the review pipeline (classify → reply → route).
 *
 * Usage:
 *   npx tsx src/jobs/reviewPoller.ts          # Run once
 *   npx tsx src/jobs/reviewPoller.ts --loop    # Run continuously (every 15 min)
 */
import { type ProcessResult } from '../services/reviewProcessor.js';
/**
 * Run one poll cycle across all restaurants.
 */
export declare function pollOnce(): Promise<{
    restaurants: number;
    newReviews: number;
    results: ProcessResult[];
}>;
//# sourceMappingURL=reviewPoller.d.ts.map