/**
 * Weekly Digest Engine — Maitreo Agent 6
 *
 * Generates a weekly review digest for each restaurant:
 *   1. Aggregates last 7 days of reviews (with TZ-aware windowing)
 *   2. Extracts themes via OpenAI
 *   3. Renders & sends email digest via Resend
 *   4. Sends SMS summary via Twilio
 *   5. Logs everything in the `digests` table
 *
 * Scheduling: intended for Sundays at 09:00 in each customer's TZ.
 * Can also be triggered manually: `tsx src/jobs/weeklyDigest.ts [restaurantId]`
 */
export declare function generateDigest(restaurantId?: string): Promise<void>;
//# sourceMappingURL=weeklyDigest.d.ts.map