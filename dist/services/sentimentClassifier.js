"use strict";
/**
 * Sentiment Classifier
 * Classifies reviews as positive/negative based on rating + text signals.
 * Lightweight — no external API needed.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.classifySentiment = classifySentiment;
const NEGATIVE_WORDS = [
    'terrible', 'awful', 'worst', 'horrible', 'disgusting', 'rude', 'cold',
    'stale', 'overpriced', 'dirty', 'slow', 'bland', 'inedible', 'never again',
    'food poisoning', 'sick', 'disappointing', 'waste', 'mediocre', 'gross',
];
const POSITIVE_WORDS = [
    'amazing', 'excellent', 'delicious', 'fantastic', 'wonderful', 'best',
    'outstanding', 'perfect', 'incredible', 'friendly', 'fresh', 'love',
    'recommend', 'favorite', 'gem', 'superb', 'phenomenal', 'great', 'awesome',
];
function classifySentiment(rating, text) {
    const lower = (text || '').toLowerCase();
    const signals = [];
    // Rating-based score (primary signal)
    let score = (rating - 3) / 2; // Maps 1-5 to -1.0 to 1.0
    signals.push(`rating: ${rating}/5`);
    // Text-based adjustments
    let negCount = 0;
    let posCount = 0;
    for (const word of NEGATIVE_WORDS) {
        if (lower.includes(word)) {
            negCount++;
            signals.push(`neg: "${word}"`);
        }
    }
    for (const word of POSITIVE_WORDS) {
        if (lower.includes(word)) {
            posCount++;
            signals.push(`pos: "${word}"`);
        }
    }
    // Adjust score by text signals (±0.2 max)
    const textAdjust = Math.min(0.2, (posCount - negCount) * 0.05);
    score = Math.max(-1, Math.min(1, score + textAdjust));
    const sentiment = score > 0.1 ? 'positive' : score < -0.1 ? 'negative' : 'neutral';
    return { sentiment, score: Math.round(score * 100) / 100, signals };
}
