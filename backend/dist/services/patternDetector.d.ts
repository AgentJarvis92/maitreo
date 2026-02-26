/**
 * Pattern Detection Service
 * Identifies recurring issues and themes across reviews
 *
 * Features:
 * - Keyword frequency analysis
 * - Topic clustering (service, food, ambiance, value)
 * - Sentiment patterns by topic
 * - Time-based pattern detection (busy hours, days)
 * - Actionable insights for owners
 */
export interface Pattern {
    type: 'recurring_issue' | 'recurring_praise' | 'time_pattern' | 'trend';
    topic: string;
    frequency: number;
    sentiment: 'positive' | 'negative' | 'mixed';
    examples: string[];
    actionable: boolean;
    suggestion?: string;
}
export interface PatternAnalysis {
    patterns: Pattern[];
    topIssues: string[];
    topPraise: string[];
    insights: string[];
}
export declare class PatternDetector {
    /**
     * Analyze patterns in reviews
     */
    analyzePatterns(restaurantId: string, daysBack?: number): Promise<PatternAnalysis>;
    /**
     * Detect patterns based on keyword matching
     */
    private detectKeywordPatterns;
    /**
     * Detect patterns by topic analysis
     */
    private detectTopicPatterns;
    /**
     * Extract relevant snippet containing keywords
     */
    private extractRelevantSnippet;
    /**
     * Generate actionable suggestion based on issue
     */
    private generateSuggestion;
    /**
     * Generate high-level insights from patterns
     */
    private generateInsights;
    /**
     * Get time-based patterns (e.g., "slow service on weekends")
     */
    getTimePatterns(restaurantId: string, daysBack?: number): Promise<any[]>;
}
export declare const patternDetector: PatternDetector;
//# sourceMappingURL=patternDetector.d.ts.map