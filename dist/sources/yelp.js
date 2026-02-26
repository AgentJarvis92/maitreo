"use strict";
/**
 * Yelp Review Scraper
 * Uses Yelp Fusion API to fetch reviews for a business.
 * Note: Yelp API only returns up to 3 reviews. For full scraping,
 * consider Yelp's GraphQL API or a scraping service.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.yelpReviewSource = exports.YelpReviewSource = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
class YelpReviewSource {
    constructor() {
        this.platform = 'yelp';
        this.baseUrl = 'https://api.yelp.com/v3';
        this.apiKey = process.env.YELP_API_KEY || '';
    }
    /**
     * Fetch reviews for a Yelp business ID/alias.
     * Yelp Fusion API returns up to 3 "highlighted" reviews per business.
     * For production, you'd want Yelp's GraphQL endpoint or a scraping layer.
     */
    async fetchReviews(businessId, since) {
        var _a, _b;
        if (!this.apiKey) {
            console.warn('⚠️  YELP_API_KEY not set, skipping Yelp reviews');
            return [];
        }
        try {
            const url = `${this.baseUrl}/businesses/${businessId}/reviews?sort_by=newest&limit=50`;
            const response = await fetch(url, {
                headers: {
                    Authorization: `Bearer ${this.apiKey}`,
                    Accept: 'application/json',
                },
            });
            if (!response.ok) {
                const errText = await response.text();
                throw new Error(`Yelp API error ${response.status}: ${errText}`);
            }
            const data = await response.json();
            const reviews = [];
            for (const r of data.reviews || []) {
                const reviewDate = new Date(r.time_created);
                if (since && reviewDate <= since)
                    continue;
                reviews.push({
                    id: r.id,
                    author: ((_a = r.user) === null || _a === void 0 ? void 0 : _a.name) || 'Anonymous',
                    rating: r.rating || 0,
                    text: r.text || '',
                    date: reviewDate,
                    metadata: {
                        platform: 'yelp',
                        profileUrl: (_b = r.user) === null || _b === void 0 ? void 0 : _b.profile_url,
                        timeCreated: r.time_created,
                    },
                });
            }
            console.log(`⭐ Yelp: fetched ${reviews.length} new reviews for ${businessId}`);
            return reviews;
        }
        catch (error) {
            console.error('❌ Yelp fetch error:', error);
            return [];
        }
    }
}
exports.YelpReviewSource = YelpReviewSource;
exports.yelpReviewSource = new YelpReviewSource();
