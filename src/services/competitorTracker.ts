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

import { supabase } from './database';
import { yelpService } from './yelpService.js';
import type { Restaurant, Competitor } from '../types/models.js';

export interface CompetitorMetrics {
  competitorId: string;
  name: string;
  platform: string;
  currentRating: number;
  currentReviewCount: number;
  weeklyReviewVelocity: number; // Reviews per week
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

export class CompetitorTracker {
  private readonly RADIUS_METERS = 8047; // 5 miles
  private readonly GROWTH_THRESHOLD = 2.0; // 2x normal velocity = anomaly
  private readonly RATING_CHANGE_THRESHOLD = 0.3; // 0.3 star change = significant

  /**
   * Track all competitors for a restaurant
   */
  async trackCompetitors(restaurant: Restaurant): Promise<CompetitorMetrics[]> {
    const competitors = restaurant.competitors_json || [];
    const metrics: CompetitorMetrics[] = [];

    for (const competitor of competitors) {
      const metric = await this.getCompetitorMetrics(competitor, restaurant.id);
      if (metric) {
        metrics.push(metric);
      }
    }

    return metrics;
  }

  /**
   * Get metrics for a single competitor
   */
  private async getCompetitorMetrics(
    competitor: Competitor,
    restaurantId: string
  ): Promise<CompetitorMetrics | null> {
    try {
      let currentRating = 0;
      let currentReviewCount = 0;

      // Fetch current data based on platform
      if (competitor.platform === 'yelp') {
        const business = await yelpService.getBusinessDetails(competitor.id);
        if (business) {
          currentRating = business.rating;
          currentReviewCount = business.reviewCount;
        }
      } else if (competitor.platform === 'google') {
        // Use Google Places API (already implemented)
        // For now, skip - would need to integrate googlePlacesNew service
      }

      // Get historical data from database
      const { data: history } = await supabase
        .from('competitor_snapshots')
        .select('*')
        .eq('restaurant_id', restaurantId)
        .eq('competitor_id', competitor.id)
        .order('created_at', { ascending: false })
        .limit(10);

      // Calculate metrics
      const weeklyVelocity = this.calculateReviewVelocity(history || [], currentReviewCount);
      const ratingTrend = this.calculateRatingTrend(history || [], currentRating);
      const growthAnomaly = this.detectGrowthAnomaly(history || [], currentReviewCount);

      // Save current snapshot
      await this.saveSnapshot(restaurantId, competitor, currentRating, currentReviewCount);

      return {
        competitorId: competitor.id,
        name: competitor.name,
        platform: competitor.platform,
        currentRating,
        currentReviewCount,
        weeklyReviewVelocity: weeklyVelocity,
        ratingTrend,
        growthAnomaly: growthAnomaly.detected,
        anomalyDetails: growthAnomaly.details,
      };
    } catch (error) {
      console.error(`Error tracking competitor ${competitor.name}:`, error);
      return null;
    }
  }

  /**
   * Calculate review velocity (reviews per week)
   */
  private calculateReviewVelocity(history: any[], currentCount: number): number {
    if (history.length < 2) return 0;

    const oldest = history[history.length - 1];
    const daysSinceOldest = (Date.now() - new Date(oldest.created_at).getTime()) / (1000 * 60 * 60 * 24);
    const reviewGain = currentCount - (oldest.review_count || 0);
    
    if (daysSinceOldest === 0) return 0;
    
    return (reviewGain / daysSinceOldest) * 7; // Convert to per-week
  }

  /**
   * Calculate rating trend
   */
  private calculateRatingTrend(history: any[], currentRating: number): 'up' | 'down' | 'stable' {
    if (history.length === 0) return 'stable';

    const oldRating = history[0].rating || 0;
    const change = currentRating - oldRating;

    if (Math.abs(change) < this.RATING_CHANGE_THRESHOLD) return 'stable';
    return change > 0 ? 'up' : 'down';
  }

  /**
   * Detect growth anomaly (sudden spike in reviews)
   */
  private detectGrowthAnomaly(history: any[], currentCount: number): { detected: boolean; details?: string } {
    if (history.length < 3) return { detected: false };

    // Get recent snapshot (1 week ago if available)
    const recentSnapshot = history[0];
    const olderSnapshots = history.slice(1);

    // Calculate normal velocity from older snapshots
    const normalVelocities = [];
    for (let i = 0; i < olderSnapshots.length - 1; i++) {
      const days = (new Date(olderSnapshots[i].created_at).getTime() - 
                   new Date(olderSnapshots[i + 1].created_at).getTime()) / (1000 * 60 * 60 * 24);
      const reviewGain = (olderSnapshots[i].review_count || 0) - (olderSnapshots[i + 1].review_count || 0);
      if (days > 0) {
        normalVelocities.push(reviewGain / days);
      }
    }

    if (normalVelocities.length === 0) return { detected: false };

    const avgNormalVelocity = normalVelocities.reduce((a, b) => a + b, 0) / normalVelocities.length;

    // Calculate recent velocity
    const daysSinceRecent = (Date.now() - new Date(recentSnapshot.created_at).getTime()) / (1000 * 60 * 60 * 24);
    const recentGain = currentCount - (recentSnapshot.review_count || 0);
    const recentVelocity = daysSinceRecent > 0 ? recentGain / daysSinceRecent : 0;

    // Anomaly if recent velocity is 2x+ normal
    if (recentVelocity > avgNormalVelocity * this.GROWTH_THRESHOLD) {
      return {
        detected: true,
        details: `${Math.round(recentGain)} new reviews in ${Math.round(daysSinceRecent)} days (${(recentVelocity / avgNormalVelocity).toFixed(1)}x normal rate)`,
      };
    }

    return { detected: false };
  }

  /**
   * Save competitor snapshot
   */
  private async saveSnapshot(
    restaurantId: string,
    competitor: Competitor,
    rating: number,
    reviewCount: number
  ): Promise<void> {
    try {
      await supabase.from('competitor_snapshots').insert({
        restaurant_id: restaurantId,
        competitor_id: competitor.id,
        competitor_name: competitor.name,
        platform: competitor.platform,
        rating,
        review_count: reviewCount,
        metadata: {},
      });
    } catch (error) {
      console.error('Failed to save competitor snapshot:', error);
    }
  }

  /**
   * Generate insights from competitor metrics
   */
  generateInsights(metrics: CompetitorMetrics[]): CompetitorInsight[] {
    const insights: CompetitorInsight[] = [];

    for (const metric of metrics) {
      // Sudden growth detection
      if (metric.growthAnomaly) {
        insights.push({
          type: 'sudden_growth',
          competitor: metric.name,
          message: `${metric.name} is experiencing rapid growth: ${metric.anomalyDetails}`,
          impact: metric.weeklyReviewVelocity > 10 ? 'high' : 'medium',
          data: { weeklyVelocity: metric.weeklyReviewVelocity, details: metric.anomalyDetails },
        });
      }

      // Rating surge detection
      if (metric.ratingTrend === 'up' && metric.currentRating >= 4.5) {
        insights.push({
          type: 'rating_surge',
          competitor: metric.name,
          message: `${metric.name}'s rating is trending up (${metric.currentRating}★)`,
          impact: 'medium',
          data: { rating: metric.currentRating, trend: 'up' },
        });
      }

      // New threat detection (high velocity + high rating)
      if (metric.weeklyReviewVelocity > 5 && metric.currentRating >= 4.3) {
        insights.push({
          type: 'new_threat',
          competitor: metric.name,
          message: `${metric.name} is an emerging threat (${metric.currentRating}★, ${metric.weeklyReviewVelocity.toFixed(1)} reviews/week)`,
          impact: 'high',
          data: { rating: metric.currentRating, velocity: metric.weeklyReviewVelocity },
        });
      }

      // Declining competitor (opportunity)
      if (metric.ratingTrend === 'down' && metric.currentRating < 4.0) {
        insights.push({
          type: 'declining',
          competitor: metric.name,
          message: `${metric.name} is declining (${metric.currentRating}★, trending down) - opportunity to capture market share`,
          impact: 'low',
          data: { rating: metric.currentRating, trend: 'down' },
        });
      }
    }

    return insights;
  }

  /**
   * Find nearby competitors using Yelp
   */
  async findNearbyCompetitors(
    restaurantName: string,
    location: string,
    cuisine?: string
  ): Promise<Competitor[]> {
    try {
      const searchTerm = cuisine || 'restaurant';
      const results = await yelpService.searchBusinesses(searchTerm, location, this.RADIUS_METERS, 30);

      const competitors: Competitor[] = results.businesses
        .filter(b => b.name.toLowerCase() !== restaurantName.toLowerCase())
        .slice(0, 10) // Top 10 competitors
        .map(b => ({
          name: b.name,
          platform: 'yelp' as const,
          id: b.id,
          location: `${b.location.city}, ${b.location.state}`,
        }));

      return competitors;
    } catch (error) {
      console.error('Error finding nearby competitors:', error);
      return [];
    }
  }
}

export const competitorTracker = new CompetitorTracker();
