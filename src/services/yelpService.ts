/**
 * Yelp Fusion API Service
 * Enhanced service for fetching Yelp reviews and business data
 */

import dotenv from 'dotenv';
dotenv.config();

export interface YelpReview {
  id: string;
  author: string;
  rating: number;
  text: string;
  date: Date;
  url: string;
  metadata: {
    platform: 'yelp';
    profileUrl?: string;
    timeCreated?: string;
  };
}

export interface YelpBusiness {
  id: string;
  alias: string;
  name: string;
  rating: number;
  reviewCount: number;
  categories: string[];
  location: {
    address: string;
    city: string;
    state: string;
    zipCode: string;
    coordinates: {
      latitude: number;
      longitude: number;
    };
  };
  phone: string;
  price?: string;
  photos: string[];
}

export interface YelpSearchResult {
  businesses: YelpBusiness[];
  total: number;
}

export class YelpService {
  private apiKey: string;
  private baseUrl = 'https://api.yelp.com/v3';

  constructor() {
    this.apiKey = process.env.YELP_API_KEY || '';
    if (!this.apiKey) {
      console.warn('⚠️  YELP_API_KEY not configured - Yelp features will be disabled');
    }
  }

  private async request(endpoint: string): Promise<any> {
    if (!this.apiKey) {
      throw new Error('YELP_API_KEY not configured');
    }

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Yelp API error ${response.status}: ${errorText}`);
    }

    return response.json();
  }

  /**
   * Fetch reviews for a Yelp business
   * Note: Yelp Fusion API returns up to 3 highlighted reviews
   */
  async fetchReviews(businessIdOrAlias: string, since?: Date): Promise<YelpReview[]> {
    try {
      const data = await this.request(`/businesses/${businessIdOrAlias}/reviews?sort_by=newest&limit=50`);
      const reviews: YelpReview[] = [];

      for (const r of data.reviews || []) {
        const reviewDate = new Date(r.time_created);

        if (since && reviewDate <= since) continue;

        reviews.push({
          id: r.id,
          author: r.user?.name || 'Anonymous',
          rating: r.rating || 0,
          text: r.text || '',
          date: reviewDate,
          url: r.url || '',
          metadata: {
            platform: 'yelp',
            profileUrl: r.user?.profile_url,
            timeCreated: r.time_created,
          },
        });
      }

      console.log(`⭐ Yelp: fetched ${reviews.length} reviews for ${businessIdOrAlias}`);
      return reviews;
    } catch (error) {
      console.error('❌ Yelp fetchReviews error:', error);
      return [];
    }
  }

  /**
   * Get business details
   */
  async getBusinessDetails(businessIdOrAlias: string): Promise<YelpBusiness | null> {
    try {
      const data = await this.request(`/businesses/${businessIdOrAlias}`);

      return {
        id: data.id,
        alias: data.alias,
        name: data.name,
        rating: data.rating,
        reviewCount: data.review_count,
        categories: (data.categories || []).map((c: any) => c.title),
        location: {
          address: data.location?.address1 || '',
          city: data.location?.city || '',
          state: data.location?.state || '',
          zipCode: data.location?.zip_code || '',
          coordinates: {
            latitude: data.coordinates?.latitude || 0,
            longitude: data.coordinates?.longitude || 0,
          },
        },
        phone: data.phone || '',
        price: data.price,
        photos: data.photos || [],
      };
    } catch (error) {
      console.error('❌ Yelp getBusinessDetails error:', error);
      return null;
    }
  }

  /**
   * Search for businesses near a location
   * @param term Search term (e.g., "pizza")
   * @param location Location (e.g., "New York, NY")
   * @param radiusMeters Radius in meters (max 40000)
   * @param limit Number of results (max 50)
   */
  async searchBusinesses(
    term: string,
    location: string,
    radiusMeters: number = 8047, // 5 miles
    limit: number = 20
  ): Promise<YelpSearchResult> {
    try {
      const params = new URLSearchParams({
        term,
        location,
        radius: Math.min(radiusMeters, 40000).toString(),
        limit: Math.min(limit, 50).toString(),
        sort_by: 'rating',
      });

      const data = await this.request(`/businesses/search?${params.toString()}`);

      const businesses: YelpBusiness[] = (data.businesses || []).map((b: any) => ({
        id: b.id,
        alias: b.alias,
        name: b.name,
        rating: b.rating,
        reviewCount: b.review_count,
        categories: (b.categories || []).map((c: any) => c.title),
        location: {
          address: b.location?.address1 || '',
          city: b.location?.city || '',
          state: b.location?.state || '',
          zipCode: b.location?.zip_code || '',
          coordinates: {
            latitude: b.coordinates?.latitude || 0,
            longitude: b.coordinates?.longitude || 0,
          },
        },
        phone: b.phone || '',
        price: b.price,
        photos: b.photos || [],
      }));

      return {
        businesses,
        total: data.total || 0,
      };
    } catch (error) {
      console.error('❌ Yelp searchBusinesses error:', error);
      return { businesses: [], total: 0 };
    }
  }

  /**
   * Search by coordinates
   */
  async searchByCoordinates(
    term: string,
    latitude: number,
    longitude: number,
    radiusMeters: number = 8047,
    limit: number = 20
  ): Promise<YelpSearchResult> {
    try {
      const params = new URLSearchParams({
        term,
        latitude: latitude.toString(),
        longitude: longitude.toString(),
        radius: Math.min(radiusMeters, 40000).toString(),
        limit: Math.min(limit, 50).toString(),
        sort_by: 'rating',
      });

      const data = await this.request(`/businesses/search?${params.toString()}`);

      const businesses: YelpBusiness[] = (data.businesses || []).map((b: any) => ({
        id: b.id,
        alias: b.alias,
        name: b.name,
        rating: b.rating,
        reviewCount: b.review_count,
        categories: (b.categories || []).map((c: any) => c.title),
        location: {
          address: b.location?.address1 || '',
          city: b.location?.city || '',
          state: b.location?.state || '',
          zipCode: b.location?.zip_code || '',
          coordinates: {
            latitude: b.coordinates?.latitude || 0,
            longitude: b.coordinates?.longitude || 0,
          },
        },
        phone: b.phone || '',
        price: b.price,
        photos: b.photos || [],
      }));

      return {
        businesses,
        total: data.total || 0,
      };
    } catch (error) {
      console.error('❌ Yelp searchByCoordinates error:', error);
      return { businesses: [], total: 0 };
    }
  }
}

export const yelpService = new YelpService();
