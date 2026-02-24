/**
 * Google Places Review Scraper
 * Uses Google Places API (New) to fetch reviews for a business.
 */

import dotenv from 'dotenv';
dotenv.config();

export interface GoogleReviewRaw {
  id: string;
  author: string;
  rating: number;
  text: string;
  date: Date;
  metadata: {
    platform: 'google';
    profileUrl?: string;
    language?: string;
    relativeTime?: string;
  };
}

export class GoogleReviewSource {
  readonly platform = 'google' as const;
  private apiKey: string;

  constructor() {
    this.apiKey = process.env.GOOGLE_PLACES_API_KEY || '';
  }

  /**
   * Fetch reviews for a Google Place ID.
   * Uses Places API v1 (New) — returns up to 5 most recent reviews per call.
   * For more, use the legacy Places API with pagetoken.
   */
  async fetchReviews(placeId: string, since?: Date): Promise<GoogleReviewRaw[]> {
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

      const data = await response.json() as any;
      const reviews: GoogleReviewRaw[] = [];

      for (const r of data.reviews || []) {
        const publishDate = new Date(r.publishTime || r.relativePublishTimeDescription);

        // Skip old reviews if 'since' specified
        if (since && publishDate <= since) continue;

        reviews.push({
          id: `google_${placeId}_${Buffer.from(r.authorAttribution?.displayName + r.publishTime).toString('base64url').slice(0, 32)}`,
          author: r.authorAttribution?.displayName || 'Anonymous',
          rating: r.rating || 0,
          text: r.text?.text || r.originalText?.text || '',
          date: publishDate,
          metadata: {
            platform: 'google',
            profileUrl: r.authorAttribution?.uri,
            language: r.text?.languageCode,
            relativeTime: r.relativePublishTimeDescription,
          },
        });
      }

      console.log(`📍 Google: fetched ${reviews.length} new reviews for place ${placeId}`);
      return reviews;
    } catch (error) {
      console.error('❌ Google Places fetch error:', error);
      return [];
    }
  }
}

export const googleReviewSource = new GoogleReviewSource();
