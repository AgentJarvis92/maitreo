/**
 * TripAdvisor Scraper Service
 * Since TripAdvisor doesn't have a public API, we use web scraping
 * Note: Web scraping may break if TripAdvisor changes their HTML structure
 */
import * as cheerio from 'cheerio';
export class TripAdvisorScraper {
    baseUrl = 'https://www.tripadvisor.com';
    userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    /**
     * Scrape reviews from a TripAdvisor restaurant URL
     * @param restaurantUrl Full TripAdvisor URL (e.g., https://www.tripadvisor.com/Restaurant_Review-g123-d456-Reviews-Restaurant_Name.html)
     * @param maxPages Number of review pages to scrape (default: 1)
     */
    async scrapeReviews(restaurantUrl, maxPages = 1, since) {
        const reviews = [];
        try {
            for (let page = 0; page < maxPages; page++) {
                const pageOffset = page * 10; // TripAdvisor shows 10 reviews per page
                const url = page === 0 ? restaurantUrl : `${restaurantUrl.replace('-Reviews-', `-Reviews-or${pageOffset}-`)}`;
                console.log(`🔍 Scraping TripAdvisor page ${page + 1}/${maxPages}: ${url}`);
                const response = await fetch(url, {
                    headers: {
                        'User-Agent': this.userAgent,
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                        'Accept-Language': 'en-US,en;q=0.5',
                        'Connection': 'keep-alive',
                    },
                });
                if (!response.ok) {
                    console.error(`❌ Failed to fetch page: ${response.status}`);
                    break;
                }
                const html = await response.text();
                const $ = cheerio.load(html);
                // TripAdvisor review container selector (may need updating if site changes)
                const reviewElements = $('[data-automation="reviewCard"]');
                if (reviewElements.length === 0) {
                    console.warn('⚠️  No reviews found - TripAdvisor HTML structure may have changed');
                    break;
                }
                let foundOldReview = false;
                reviewElements.each((index, element) => {
                    try {
                        const $review = $(element);
                        // Extract rating (from bubble rating class)
                        const ratingClass = $review.find('[class*="bubble_"]').attr('class') || '';
                        const ratingMatch = ratingClass.match(/bubble_(\d)(\d)/);
                        const rating = ratingMatch ? parseInt(ratingMatch[1]) : 0;
                        // Extract title
                        const title = $review.find('[data-automation="reviewTitle"]').text().trim();
                        // Extract review text
                        const text = $review.find('[data-automation="reviewText"]').text().trim();
                        // Extract author
                        const author = $review.find('[class*="info_text"]').first().text().trim() || 'Anonymous';
                        // Extract date
                        const dateText = $review.find('[class*="date"]').text().trim();
                        const reviewDate = this.parseDate(dateText);
                        // Skip if older than 'since' date
                        if (since && reviewDate && reviewDate <= since) {
                            foundOldReview = true;
                            return; // Skip this review
                        }
                        // Generate unique ID from URL or index
                        const reviewId = $review.find('a').attr('href') || `tripadvisor-${Date.now()}-${index}`;
                        const id = reviewId.split('-').pop() || `${Date.now()}-${index}`;
                        // Extract metadata
                        const contributions = this.extractNumber($review.find('[class*="contributions"]').text());
                        const helpfulVotes = this.extractNumber($review.find('[class*="helpful"]').text());
                        const visitDate = $review.find('[class*="visitDate"]').text().trim();
                        if (title || text) {
                            reviews.push({
                                id: `tripadvisor_${id}`,
                                author,
                                rating,
                                title,
                                text,
                                date: reviewDate || new Date(),
                                url: restaurantUrl,
                                metadata: {
                                    platform: 'tripadvisor',
                                    contributions,
                                    helpfulVotes,
                                    visitDate,
                                },
                            });
                        }
                    }
                    catch (err) {
                        console.error('Error parsing review:', err);
                    }
                });
                // Stop pagination if we've reached reviews older than 'since'
                if (foundOldReview) {
                    console.log('Reached reviews older than since date, stopping pagination');
                    break;
                }
                // Add delay between pages to avoid rate limiting
                if (page < maxPages - 1) {
                    await this.delay(2000 + Math.random() * 1000);
                }
            }
            console.log(`🏆 TripAdvisor: scraped ${reviews.length} reviews`);
            return reviews;
        }
        catch (error) {
            console.error('❌ TripAdvisor scraping error:', error);
            return reviews; // Return whatever we collected so far
        }
    }
    /**
     * Scrape basic business information
     */
    async scrapeBusinessInfo(restaurantUrl) {
        try {
            const response = await fetch(restaurantUrl, {
                headers: {
                    'User-Agent': this.userAgent,
                    'Accept': 'text/html',
                },
            });
            if (!response.ok) {
                console.error(`❌ Failed to fetch business info: ${response.status}`);
                return null;
            }
            const html = await response.text();
            const $ = cheerio.load(html);
            // Extract business details
            const name = $('h1[data-automation="mainH1"]').text().trim() || $('h1').first().text().trim();
            const ratingText = $('[class*="rating"]').first().text().trim();
            const rating = parseFloat(ratingText) || 0;
            const reviewCountText = $('[class*="reviewCount"]').text().trim();
            const reviewCount = this.extractNumber(reviewCountText);
            const ranking = $('[class*="ranking"]').text().trim();
            const priceRange = $('[class*="price"]').text().trim();
            const cuisines = [];
            $('[class*="cuisine"]').each((i, el) => {
                const cuisine = $(el).text().trim();
                if (cuisine)
                    cuisines.push(cuisine);
            });
            // Extract ID from URL
            const idMatch = restaurantUrl.match(/d(\d+)/);
            const id = idMatch ? idMatch[1] : `tripadvisor-${Date.now()}`;
            return {
                id,
                name,
                rating,
                reviewCount,
                ranking,
                priceRange,
                cuisines,
                url: restaurantUrl,
            };
        }
        catch (error) {
            console.error('❌ Error scraping business info:', error);
            return null;
        }
    }
    /**
     * Search for restaurants (uses TripAdvisor search)
     */
    async searchRestaurants(query, location, limit = 10) {
        try {
            // TripAdvisor search is complex - for MVP, return empty
            // In production, you'd want to use a scraping service like ScrapingBee or Apify
            console.warn('⚠️  TripAdvisor search not implemented - use direct URLs instead');
            return [];
        }
        catch (error) {
            console.error('❌ TripAdvisor search error:', error);
            return [];
        }
    }
    /**
     * Parse various date formats TripAdvisor uses
     */
    parseDate(dateStr) {
        try {
            // Remove "Reviewed" prefix if present
            dateStr = dateStr.replace(/Reviewed\s+/i, '').trim();
            // Try parsing common formats
            // "December 2024", "Dec 2024", "12/15/2024", etc.
            const monthYearMatch = dateStr.match(/(\w+)\s+(\d{4})/);
            if (monthYearMatch) {
                const monthStr = monthYearMatch[1];
                const year = parseInt(monthYearMatch[2]);
                const monthNames = ['january', 'february', 'march', 'april', 'may', 'june',
                    'july', 'august', 'september', 'october', 'november', 'december'];
                const month = monthNames.findIndex(m => m.startsWith(monthStr.toLowerCase()));
                if (month >= 0) {
                    return new Date(year, month, 1);
                }
            }
            // Try standard date parsing
            const parsed = new Date(dateStr);
            if (!isNaN(parsed.getTime())) {
                return parsed;
            }
            return null;
        }
        catch {
            return null;
        }
    }
    /**
     * Extract number from text (e.g., "123 contributions" -> 123)
     */
    extractNumber(text) {
        const match = text.match(/\d+/);
        return match ? parseInt(match[0]) : 0;
    }
    /**
     * Delay helper
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
export const tripadvisorScraper = new TripAdvisorScraper();
//# sourceMappingURL=tripadvisorScraper.js.map