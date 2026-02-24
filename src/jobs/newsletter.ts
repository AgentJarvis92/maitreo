/**
 * Weekly Newsletter Job
 * 
 * Generates and sends competitive intelligence newsletters every Monday at 9am.
 * Analyzes competitor reviews from the past 7 days and provides actionable insights.
 * 
 * Schedule: Every Monday at 9:00 AM
 */

import { startOfWeek, subDays, format } from 'date-fns';
import { query } from '../db/client.js';
import { newsletterGenerator } from '../services/newsletterGenerator.js';
import { emailService } from '../services/emailService.js';
import type { Restaurant, Review, Newsletter } from '../types/models.js';

export class NewsletterJob {
  /**
   * Fetch all active restaurants
   */
  private async getAllRestaurants(): Promise<Restaurant[]> {
    const result = await query<Restaurant>(
      `SELECT * FROM restaurants ORDER BY created_at ASC`
    );
    return result.rows;
  }

  /**
   * Get competitor reviews for the past 7 days
   */
  private async getCompetitorReviews(
    restaurant: Restaurant,
    weekStartDate: Date
  ): Promise<Review[]> {
    const weekEndDate = new Date(weekStartDate);
    weekEndDate.setDate(weekEndDate.getDate() + 7);

    // Build query to find reviews mentioning competitors
    const competitorNames = (restaurant.competitors_json || []).map(c => c.name);
    
    if (competitorNames.length === 0) {
      console.log(`  ⚠️  No competitors configured for ${restaurant.name}`);
      return [];
    }

    // This is a simplified approach - ideally we'd have competitor IDs linked
    // For now, search for reviews mentioning competitor names
    const result = await query<Review>(
      `SELECT * FROM reviews 
       WHERE review_date >= $1 
       AND review_date < $2
       AND (${competitorNames.map((_, i) => `LOWER(text) LIKE $${i + 3}`).join(' OR ')})
       ORDER BY review_date DESC
       LIMIT 100`,
      [
        weekStartDate,
        weekEndDate,
        ...competitorNames.map(name => `%${name.toLowerCase()}%`),
      ]
    );

    return result.rows;
  }

  /**
   * Check if newsletter already exists for this week
   */
  private async newsletterExists(
    restaurantId: string,
    weekStartDate: Date
  ): Promise<boolean> {
    const result = await query<{ count: number }>(
      `SELECT COUNT(*) as count FROM newsletters 
       WHERE restaurant_id = $1 AND week_start_date = $2`,
      [restaurantId, weekStartDate]
    );
    return parseInt(String(result.rows[0]?.count || 0)) > 0;
  }

  /**
   * Save newsletter to database
   */
  private async saveNewsletter(
    restaurantId: string,
    weekStartDate: Date,
    contentHtml: string,
    contentJson: any
  ): Promise<Newsletter> {
    const result = await query<Newsletter>(
      `INSERT INTO newsletters (restaurant_id, week_start_date, content_html, content_json)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [restaurantId, weekStartDate, contentHtml, JSON.stringify(contentJson)]
    );
    return result.rows[0];
  }

  /**
   * Process a single restaurant
   */
  private async processRestaurant(
    restaurant: Restaurant,
    weekStartDate: Date
  ): Promise<void> {
    console.log(`\n📍 Processing newsletter for: ${restaurant.name}`);

    try {
      // Check if already generated
      if (await this.newsletterExists(restaurant.id, weekStartDate)) {
        console.log(`  ⏭️  Newsletter already exists for this week`);
        return;
      }

      // Get competitor reviews
      console.log(`  📊 Fetching competitor reviews...`);
      const competitorReviews = await this.getCompetitorReviews(restaurant, weekStartDate);
      console.log(`  Found ${competitorReviews.length} competitor reviews`);

      // Generate newsletter
      console.log(`  🤖 Generating newsletter content...`);
      const { content_html, content_json } = await newsletterGenerator.generateNewsletter({
        restaurant,
        week_start_date: weekStartDate,
        competitor_reviews: competitorReviews,
      });

      // Save to database
      console.log(`  💾 Saving newsletter...`);
      const newsletter = await this.saveNewsletter(
        restaurant.id,
        weekStartDate,
        content_html,
        content_json
      );
      console.log(`  ✅ Newsletter saved: ${newsletter.id}`);

      // Send email
      if (restaurant.owner_email) {
        console.log(`  📧 Sending email to ${restaurant.owner_email}...`);
        await emailService.sendNewsletterEmail(
          restaurant.owner_email,
          restaurant.name,
          newsletter
        );
        console.log(`  ✅ Newsletter email sent!`);
      } else {
        console.warn(`  ⚠️  No owner email for restaurant ${restaurant.name}`);
      }

    } catch (error) {
      console.error(`  ❌ Error processing newsletter:`, error);
      throw error;
    }
  }

  /**
   * Run the newsletter job
   */
  async run(weekStartDate?: Date): Promise<void> {
    console.log('🚀 Starting weekly newsletter job...');
    
    // Use provided date or calculate current week start (Monday)
    const targetWeek = weekStartDate || startOfWeek(new Date(), { weekStartsOn: 1 });
    console.log(`   Target week: ${format(targetWeek, 'MMMM d, yyyy')}`);
    
    const startTime = Date.now();

    try {
      const restaurants = await this.getAllRestaurants();
      console.log(`\n📋 Processing newsletters for ${restaurants.length} restaurants...\n`);

      for (const restaurant of restaurants) {
        await this.processRestaurant(restaurant, targetWeek);
      }

      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(`\n✅ Newsletter job completed in ${duration}s`);
      
    } catch (error) {
      console.error('❌ Newsletter job failed:', error);
      throw error;
    }
  }
}

// CLI runner
if (import.meta.url === `file://${process.argv[1]}`) {
  const job = new NewsletterJob();
  
  // Allow passing a specific date for testing
  const targetDate = process.argv[2] ? new Date(process.argv[2]) : undefined;
  
  job.run(targetDate)
    .then(() => {
      console.log('\n🎉 Newsletter job finished successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Newsletter job failed:', error);
      process.exit(1);
    });
}

export const newsletterJob = new NewsletterJob();
