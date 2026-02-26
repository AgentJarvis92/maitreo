/**
 * Sentiment Classifier
 * Classifies reviews as positive/negative based on rating + text signals.
 * Lightweight — no external API needed.
 */
export type Sentiment = 'positive' | 'negative' | 'neutral';
export interface SentimentResult {
    sentiment: Sentiment;
    score: number;
    signals: string[];
}
export declare function classifySentiment(rating: number, text: string): SentimentResult;
//# sourceMappingURL=sentimentClassifier.d.ts.map