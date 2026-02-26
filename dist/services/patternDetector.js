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
import { supabase } from './database';
// Predefined topic keywords
const TOPIC_KEYWORDS = {
    service: ['server', 'waiter', 'waitress', 'staff', 'service', 'waited', 'slow', 'rude', 'friendly', 'attentive'],
    food: ['food', 'dish', 'meal', 'taste', 'flavor', 'fresh', 'stale', 'cold', 'hot', 'delicious', 'bland', 'undercooked', 'overcooked'],
    ambiance: ['ambiance', 'atmosphere', 'decor', 'music', 'noise', 'loud', 'quiet', 'cozy', 'romantic', 'clean', 'dirty'],
    value: ['price', 'expensive', 'cheap', 'value', 'worth', 'overpriced', 'affordable', 'portion', 'size'],
    wait_time: ['wait', 'waiting', 'reservation', 'busy', 'crowded', 'line', 'queue'],
    cleanliness: ['clean', 'dirty', 'sanitary', 'bathroom', 'restroom', 'table'],
};
// Common issue keywords
const ISSUE_KEYWORDS = {
    'slow service': ['slow', 'wait', 'forever', 'long time', 'took forever'],
    'rude staff': ['rude', 'impolite', 'dismissive', 'unprofessional'],
    'cold food': ['cold', 'lukewarm', 'not hot', 'room temperature'],
    'small portions': ['small', 'tiny', 'not enough', 'portion'],
    'overpriced': ['expensive', 'overpriced', 'not worth', 'too much'],
    'noisy': ['loud', 'noisy', 'too much noise', 'can\'t hear'],
    'dirty': ['dirty', 'unclean', 'messy', 'gross'],
    'long wait': ['wait', 'waited', 'long wait', 'reservation'],
};
// Common praise keywords
const PRAISE_KEYWORDS = {
    'excellent service': ['excellent service', 'great service', 'amazing service', 'attentive'],
    'delicious food': ['delicious', 'amazing food', 'incredible', 'best'],
    'great atmosphere': ['great atmosphere', 'nice ambiance', 'beautiful', 'cozy'],
    'good value': ['good value', 'reasonable price', 'worth it', 'affordable'],
    'friendly staff': ['friendly', 'welcoming', 'kind', 'helpful'],
};
export class PatternDetector {
    /**
     * Analyze patterns in reviews
     */
    async analyzePatterns(restaurantId, daysBack = 90) {
        const sinceDate = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);
        const { data: reviews } = await supabase
            .from('reviews')
            .select('*')
            .eq('restaurant_id', restaurantId)
            .gte('review_date', sinceDate.toISOString())
            .order('review_date', { ascending: false });
        if (!reviews || reviews.length === 0) {
            return { patterns: [], topIssues: [], topPraise: [], insights: [] };
        }
        const patterns = [];
        // Detect recurring issues
        const issuePatterns = this.detectKeywordPatterns(reviews, ISSUE_KEYWORDS, 'recurring_issue', 'negative');
        patterns.push(...issuePatterns);
        // Detect recurring praise
        const praisePatterns = this.detectKeywordPatterns(reviews, PRAISE_KEYWORDS, 'recurring_praise', 'positive');
        patterns.push(...praisePatterns);
        // Detect topic-based patterns
        const topicPatterns = this.detectTopicPatterns(reviews);
        patterns.push(...topicPatterns);
        // Generate insights
        const topIssues = issuePatterns
            .sort((a, b) => b.frequency - a.frequency)
            .slice(0, 5)
            .map(p => p.topic);
        const topPraise = praisePatterns
            .sort((a, b) => b.frequency - a.frequency)
            .slice(0, 5)
            .map(p => p.topic);
        const insights = this.generateInsights(patterns, reviews.length);
        return {
            patterns: patterns.sort((a, b) => b.frequency - a.frequency),
            topIssues,
            topPraise,
            insights,
        };
    }
    /**
     * Detect patterns based on keyword matching
     */
    detectKeywordPatterns(reviews, keywordMap, type, sentiment) {
        const patterns = [];
        for (const [topic, keywords] of Object.entries(keywordMap)) {
            const matches = [];
            for (const review of reviews) {
                if (!review.text)
                    continue;
                const text = review.text.toLowerCase();
                const hasKeyword = keywords.some(keyword => text.includes(keyword.toLowerCase()));
                if (hasKeyword) {
                    matches.push(review);
                }
            }
            if (matches.length >= 2) { // At least 2 mentions to be a pattern
                const examples = matches
                    .slice(0, 3)
                    .map(r => this.extractRelevantSnippet(r.text || '', keywords));
                const frequency = matches.length;
                const percentage = (frequency / reviews.length) * 100;
                patterns.push({
                    type,
                    topic,
                    frequency,
                    sentiment,
                    examples,
                    actionable: sentiment === 'negative',
                    suggestion: sentiment === 'negative' ? this.generateSuggestion(topic) : undefined,
                });
            }
        }
        return patterns;
    }
    /**
     * Detect patterns by topic analysis
     */
    detectTopicPatterns(reviews) {
        const patterns = [];
        for (const [topic, keywords] of Object.entries(TOPIC_KEYWORDS)) {
            const positiveMatches = [];
            const negativeMatches = [];
            for (const review of reviews) {
                if (!review.text)
                    continue;
                const text = review.text.toLowerCase();
                const hasKeyword = keywords.some(keyword => text.includes(keyword.toLowerCase()));
                if (hasKeyword) {
                    if (review.rating >= 4) {
                        positiveMatches.push(review);
                    }
                    else if (review.rating <= 2) {
                        negativeMatches.push(review);
                    }
                }
            }
            // If there's a clear sentiment pattern for this topic
            if (positiveMatches.length >= 3 && positiveMatches.length > negativeMatches.length * 2) {
                patterns.push({
                    type: 'recurring_praise',
                    topic: `${topic} (strength)`,
                    frequency: positiveMatches.length,
                    sentiment: 'positive',
                    examples: positiveMatches.slice(0, 3).map(r => r.text?.substring(0, 100) || ''),
                    actionable: false,
                });
            }
            else if (negativeMatches.length >= 3 && negativeMatches.length > positiveMatches.length * 2) {
                patterns.push({
                    type: 'recurring_issue',
                    topic: `${topic} (weakness)`,
                    frequency: negativeMatches.length,
                    sentiment: 'negative',
                    examples: negativeMatches.slice(0, 3).map(r => r.text?.substring(0, 100) || ''),
                    actionable: true,
                    suggestion: this.generateSuggestion(topic),
                });
            }
        }
        return patterns;
    }
    /**
     * Extract relevant snippet containing keywords
     */
    extractRelevantSnippet(text, keywords) {
        const sentences = text.split(/[.!?]+/);
        for (const sentence of sentences) {
            const lowerSentence = sentence.toLowerCase();
            if (keywords.some(kw => lowerSentence.includes(kw.toLowerCase()))) {
                return sentence.trim().substring(0, 150);
            }
        }
        return text.substring(0, 150);
    }
    /**
     * Generate actionable suggestion based on issue
     */
    generateSuggestion(issue) {
        const suggestions = {
            'slow service': 'Consider hiring additional staff during peak hours or improving kitchen workflow',
            'rude staff': 'Schedule customer service training for front-of-house team',
            'cold food': 'Review food preparation timing and server pickup procedures',
            'small portions': 'Consider portion size standards and customer expectations',
            'overpriced': 'Review menu pricing against local competitors and perceived value',
            'noisy': 'Add sound dampening materials or adjust music volume',
            'dirty': 'Increase cleaning frequency and implement hygiene checklists',
            'long wait': 'Implement reservation system or add bar seating for waiting guests',
            'service': 'Focus on staff training and service speed improvements',
            'food': 'Review recipes, ingredient quality, and kitchen procedures',
            'ambiance': 'Consider decor updates or lighting/music adjustments',
            'value': 'Review pricing strategy and portion sizes',
            'wait_time': 'Optimize table turnover and reservation management',
            'cleanliness': 'Increase cleaning standards and frequency',
        };
        return suggestions[issue] || 'Monitor this issue and gather more specific feedback';
    }
    /**
     * Generate high-level insights from patterns
     */
    generateInsights(patterns, totalReviews) {
        const insights = [];
        // Most mentioned issue
        const topIssue = patterns
            .filter(p => p.type === 'recurring_issue')
            .sort((a, b) => b.frequency - a.frequency)[0];
        if (topIssue) {
            const percentage = ((topIssue.frequency / totalReviews) * 100).toFixed(0);
            insights.push(`🔴 ${topIssue.topic} is mentioned in ${percentage}% of reviews - this should be your top priority`);
        }
        // Most mentioned strength
        const topStrength = patterns
            .filter(p => p.type === 'recurring_praise')
            .sort((a, b) => b.frequency - a.frequency)[0];
        if (topStrength) {
            const percentage = ((topStrength.frequency / totalReviews) * 100).toFixed(0);
            insights.push(`✅ ${topStrength.topic} is your strongest asset (${percentage}% mention rate) - lean into this!`);
        }
        // Multiple recurring issues
        const issues = patterns.filter(p => p.type === 'recurring_issue' && p.frequency >= 3);
        if (issues.length >= 3) {
            insights.push(`⚠️  You have ${issues.length} recurring issues that need attention. Focus on the top 2-3 first.`);
        }
        // Balance analysis
        const totalIssues = patterns.filter(p => p.type === 'recurring_issue').reduce((sum, p) => sum + p.frequency, 0);
        const totalPraise = patterns.filter(p => p.type === 'recurring_praise').reduce((sum, p) => sum + p.frequency, 0);
        if (totalPraise > totalIssues * 2) {
            insights.push(`🎉 Customers love your restaurant! ${totalPraise} positive mentions vs ${totalIssues} issues.`);
        }
        else if (totalIssues > totalPraise) {
            insights.push(`📊 More issues than praise detected. Address top complaints to improve ratings.`);
        }
        return insights;
    }
    /**
     * Get time-based patterns (e.g., "slow service on weekends")
     */
    async getTimePatterns(restaurantId, daysBack = 90) {
        // This would require review timestamps with day-of-week analysis
        // Placeholder for future implementation
        return [];
    }
}
export const patternDetector = new PatternDetector();
//# sourceMappingURL=patternDetector.js.map