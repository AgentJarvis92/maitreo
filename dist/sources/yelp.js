/**
 * Yelp Review Scraper
 * Uses Yelp Fusion API to fetch reviews for a business.
 * Note: Yelp API only returns up to 3 reviews. For full scraping,
 * consider Yelp's GraphQL API or a scraping service.
 */
import dotenv from 'dotenv';
dotenv.config();
export class YelpReviewSource {
    platform = 'yelp';
    apiKey;
    baseUrl = 'https://api.yelp.com/v3';
    constructor() {
        this.apiKey = process.env.YELP_API_KEY || '';
    }
    /**
     * Fetch reviews for a Yelp business ID/alias.
     * Yelp Fusion API returns up to 3 "highlighted" reviews per business.
     * For production, you'd want Yelp's GraphQL endpoint or a scraping layer.
     */
    async fetchReviews(businessId, since) {
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
                    author: r.user?.name || 'Anonymous',
                    rating: r.rating || 0,
                    text: r.text || '',
                    date: reviewDate,
                    metadata: {
                        platform: 'yelp',
                        profileUrl: r.user?.profile_url,
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
export const yelpReviewSource = new YelpReviewSource();
//# sourceMappingURL=yelp.js.map