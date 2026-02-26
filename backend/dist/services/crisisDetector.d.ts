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
import type { Review, Restaurant } from '../types/models.js';
export interface CrisisEvent {
    type: 'multiple_negative' | 'critical_keyword' | 'rating_drop';
    severity: 'high' | 'critical';
    reviews: Review[];
    message: string;
    detectedAt: Date;
}
export interface CrisisDetectionResult {
    inCrisis: boolean;
    events: CrisisEvent[];
    shouldAlert: boolean;
}
export declare class CrisisDetector {
    /**
     * Check for crisis conditions for a restaurant
     */
    detectCrisis(restaurantId: string): Promise<CrisisDetectionResult>;
    /**
     * Send crisis alert to restaurant owner
     */
    sendCrisisAlert(restaurant: Restaurant, crisisResult: CrisisDetectionResult): Promise<void>;
    /**
     * Log crisis alert to database
     */
    private logCrisisAlert;
    /**
     * Check if restaurant was already alerted recently (prevent spam)
     */
    wasRecentlyAlerted(restaurantId: string, hoursAgo?: number): Promise<boolean>;
}
export declare const crisisDetector: CrisisDetector;
//# sourceMappingURL=crisisDetector.d.ts.map