"use strict";
/**
 * Google Places Review Scraper
 * Uses Google Places API (New) to fetch reviews for a business.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.googleReviewSource = exports.GoogleReviewSource = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
class GoogleReviewSource {
    constructor() {
        this.platform = 'google';
        this.apiKey = process.env.GOOGLE_PLACES_API_KEY || '';
    }
    /**
     * Fetch reviews for a Google Place ID.
     * Uses Places API v1 (New) — returns up to 5 most recent reviews per call.
     * For more, use the legacy Places API with pagetoken.
     */
    async fetchReviews(placeId, since) {
        var _a, _b, _c, _d, _e, _f;
        if (!this.apiKey) {
            console.warn('⚠️  GOOGLE_PLACES_API_KEY not set, skipping Google reviews');
            return [];
        }
        try {
            // Places API (New) - Get Place Details with reviews
            const url = `https://places.googleapis.com/v1/places/${placeId}?fields=reviews&key=${this.apiKey}`;
            const response = await fetch(url, {
                headers: {
                    'X-Goog-Api-Key': this.apiKey,
                    'X-Goog-FieldMask': 'reviews',
                },
            });
            if (!response.ok) {
                const errText = await response.text();
                throw new Error(`Google Places API error ${response.status}: ${errText}`);
            }
            const data = await response.json();
            const reviews = [];
            for (const r of data.reviews || []) {
                const publishDate = new Date(r.publishTime || r.relativePublishTimeDescription);
                // Skip old reviews if 'since' specified
                if (since && publishDate <= since)
                    continue;
                reviews.push({
                    id: `google_${placeId}_${Buffer.from(((_a = r.authorAttribution) === null || _a === void 0 ? void 0 : _a.displayName) + r.publishTime).toString('base64url').slice(0, 32)}`,
                    author: ((_b = r.authorAttribution) === null || _b === void 0 ? void 0 : _b.displayName) || 'Anonymous',
                    rating: r.rating || 0,
                    text: ((_c = r.text) === null || _c === void 0 ? void 0 : _c.text) || ((_d = r.originalText) === null || _d === void 0 ? void 0 : _d.text) || '',
                    date: publishDate,
                    metadata: {
                        platform: 'google',
                        profileUrl: (_e = r.authorAttribution) === null || _e === void 0 ? void 0 : _e.uri,
                        language: (_f = r.text) === null || _f === void 0 ? void 0 : _f.languageCode,
                        relativeTime: r.relativePublishTimeDescription,
                    },
                });
            }
            console.log(`📍 Google: fetched ${reviews.length} new reviews for place ${placeId}`);
            return reviews;
        }
        catch (error) {
            console.error('❌ Google Places fetch error:', error);
            return [];
        }
    }
}
exports.GoogleReviewSource = GoogleReviewSource;
exports.googleReviewSource = new GoogleReviewSource();
