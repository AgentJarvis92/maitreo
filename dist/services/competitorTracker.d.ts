/**
 * Competitor Tracking Engine
 * Monitors competitors within a radius and detects growth anomalies
 *
 * Features:
 * - Track competitors within 5-mile radius
 * - Detect sudden review spikes (growth anomalies)
 * - Monitor rating changes
 * - Track review velocity (reviews per week)
 * - Identify emerging threats
 */
import type { Restaurant, Competitor } from '../types/models.js';
export interface CompetitorMetrics {
    competitorId: string;
    name: string;
    platform: string;
    currentRating: number;
    currentReviewCount: number;
    weeklyReviewVelocity: number;
    ratingTrend: 'up' | 'down' | 'stable';
    growthAnomaly: boolean;
    anomalyDetails?: string;
}
export interface CompetitorInsight {
    type: 'sudden_growth' | 'rating_surge' | 'new_threat' | 'declining';
    competitor: string;
    message: string;
    impact: 'high' | 'medium' | 'low';
    data: any;
}
export declare class CompetitorTracker {
    private readonly RADIUS_METERS;
    private readonly GROWTH_THRESHOLD;
    private readonly RATING_CHANGE_THRESHOLD;
    /**
     * Track all competitors for a restaurant
     */
    trackCompetitors(restaurant: Restaurant): Promise<CompetitorMetrics[]>;
    /**
     * Get metrics for a single competitor
     */
    private getCompetitorMetrics;
    /**
     * Calculate review velocity (reviews per week)
     */
    private calculateReviewVelocity;
    /**
     * Calculate rating trend
     */
    private calculateRatingTrend;
    /**
     * Detect growth anomaly (sudden spike in reviews)
     */
    private detectGrowthAnomaly;
    /**
     * Save competitor snapshot
     */
    private saveSnapshot;
    /**
     * Generate insights from competitor metrics
     */
    generateInsights(metrics: CompetitorMetrics[]): CompetitorInsight[];
    /**
     * Find nearby competitors using Yelp
     */
    findNearbyCompetitors(restaurantName: string, location: string, cuisine?: string): Promise<Competitor[]>;
}
export declare const competitorTracker: CompetitorTracker;
//# sourceMappingURL=competitorTracker.d.ts.map