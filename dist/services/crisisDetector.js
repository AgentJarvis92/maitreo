/**
 * Crisis Mode Detection Service
 * Detects critical situations requiring immediate owner attention
 *
 * Crisis Triggers:
 * - 2+ negative reviews (≤2 stars) within 24 hours
 * - 3+ negative reviews within 72 hours
 * - Single 1-star review with specific keywords (health, sick, poison, etc.)
 * - Sudden drop in average rating
 */
import { supabase } from './database';
import { twilioClient } from '../sms/twilioClient.js';
const CRITICAL_KEYWORDS = [
    'sick', 'food poisoning', 'poison', 'illness', 'hospital',
    'vomit', 'diarrhea', 'health department', 'roach', 'bug',
    'dirty', 'unsanitary', 'disgusting', 'moldy', 'rotten',
    'raw', 'undercooked', 'hair', 'foreign object'
];
export class CrisisDetector {
    /**
     * Check for crisis conditions for a restaurant
     */
    async detectCrisis(restaurantId) {
        const events = [];
        // Get recent reviews (last 7 days)
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const { data: recentReviews } = await supabase
            .from('reviews')
            .select('*')
            .eq('restaurant_id', restaurantId)
            .gte('review_date', sevenDaysAgo.toISOString())
            .order('review_date', { ascending: false });
        if (!recentReviews || recentReviews.length === 0) {
            return { inCrisis: false, events: [], shouldAlert: false };
        }
        // Check 1: Multiple negative reviews in 24 hours
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const negativeReviews24h = recentReviews.filter((r) => r.rating <= 2 && new Date(r.review_date) >= oneDayAgo);
        if (negativeReviews24h.length >= 2) {
            events.push({
                type: 'multiple_negative',
                severity: 'critical',
                reviews: negativeReviews24h,
                message: `🚨 CRISIS: ${negativeReviews24h.length} negative reviews in the last 24 hours!`,
                detectedAt: new Date(),
            });
        }
        // Check 2: Multiple negative reviews in 72 hours
        const threeDaysAgo = new Date(Date.now() - 72 * 60 * 60 * 1000);
        const negativeReviews72h = recentReviews.filter((r) => r.rating <= 2 && new Date(r.review_date) >= threeDaysAgo);
        if (negativeReviews72h.length >= 3 && negativeReviews24h.length < 2) {
            events.push({
                type: 'multiple_negative',
                severity: 'high',
                reviews: negativeReviews72h,
                message: `⚠️  WARNING: ${negativeReviews72h.length} negative reviews in the last 72 hours`,
                detectedAt: new Date(),
            });
        }
        // Check 3: Critical keyword detection
        for (const review of recentReviews) {
            if (review.rating <= 2 && review.text) {
                const text = review.text.toLowerCase();
                const foundKeywords = CRITICAL_KEYWORDS.filter(keyword => text.includes(keyword));
                if (foundKeywords.length > 0) {
                    events.push({
                        type: 'critical_keyword',
                        severity: 'critical',
                        reviews: [review],
                        message: `🚨 CRITICAL: Review mentions: ${foundKeywords.join(', ')}`,
                        detectedAt: new Date(),
                    });
                }
            }
        }
        // Check 4: Sudden rating drop (comparing last 7 days vs previous 30 days)
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const { data: olderReviews } = await supabase
            .from('reviews')
            .select('rating')
            .eq('restaurant_id', restaurantId)
            .gte('review_date', thirtyDaysAgo.toISOString())
            .lt('review_date', sevenDaysAgo.toISOString());
        if (olderReviews && olderReviews.length >= 5) {
            const recentAvg = recentReviews.reduce((sum, r) => sum + r.rating, 0) / recentReviews.length;
            const olderAvg = olderReviews.reduce((sum, r) => sum + r.rating, 0) / olderReviews.length;
            const drop = olderAvg - recentAvg;
            if (drop >= 1.5) {
                events.push({
                    type: 'rating_drop',
                    severity: 'high',
                    reviews: recentReviews,
                    message: `📉 Rating dropped ${drop.toFixed(1)} stars (${olderAvg.toFixed(1)} → ${recentAvg.toFixed(1)})`,
                    detectedAt: new Date(),
                });
            }
        }
        const inCrisis = events.length > 0;
        const shouldAlert = events.some(e => e.severity === 'critical');
        return { inCrisis, events, shouldAlert };
    }
    /**
     * Send crisis alert to restaurant owner
     */
    async sendCrisisAlert(restaurant, crisisResult) {
        if (!crisisResult.shouldAlert || !restaurant.owner_phone) {
            return;
        }
        const criticalEvents = crisisResult.events.filter(e => e.severity === 'critical');
        let message = `🚨 MAITREO CRISIS ALERT\n\n`;
        message += `Restaurant: ${restaurant.name}\n\n`;
        for (const event of criticalEvents) {
            message += `${event.message}\n\n`;
            if (event.reviews.length <= 3) {
                for (const review of event.reviews) {
                    message += `⭐ ${review.rating}/5 by ${review.author}\n`;
                    message += `"${review.text?.substring(0, 150)}${(review.text?.length || 0) > 150 ? '...' : ''}"\n\n`;
                }
            }
        }
        message += `🔗 Check your dashboard: https://maitreo.com/dashboard`;
        try {
            await twilioClient.sendSms(restaurant.owner_phone, message);
            console.log(`📱 Crisis alert sent to ${restaurant.owner_phone}`);
            // Log the alert
            await this.logCrisisAlert(restaurant.id, crisisResult);
        }
        catch (error) {
            console.error('❌ Failed to send crisis alert:', error);
        }
    }
    /**
     * Log crisis alert to database
     */
    async logCrisisAlert(restaurantId, crisisResult) {
        try {
            await supabase.from('crisis_alerts').insert({
                restaurant_id: restaurantId,
                event_type: crisisResult.events[0].type,
                severity: crisisResult.events[0].severity,
                review_count: crisisResult.events.reduce((sum, e) => sum + e.reviews.length, 0),
                message: crisisResult.events[0].message,
                metadata: {
                    events: crisisResult.events.map(e => ({
                        type: e.type,
                        severity: e.severity,
                        message: e.message,
                        reviewIds: e.reviews.map(r => r.id),
                    })),
                },
            });
        }
        catch (error) {
            console.error('Failed to log crisis alert:', error);
        }
    }
    /**
     * Check if restaurant was already alerted recently (prevent spam)
     */
    async wasRecentlyAlerted(restaurantId, hoursAgo = 6) {
        const threshold = new Date(Date.now() - hoursAgo * 60 * 60 * 1000);
        const { data } = await supabase
            .from('crisis_alerts')
            .select('id')
            .eq('restaurant_id', restaurantId)
            .gte('created_at', threshold.toISOString())
            .limit(1);
        return (data?.length || 0) > 0;
    }
}
export const crisisDetector = new CrisisDetector();
//# sourceMappingURL=crisisDetector.js.map