import OpenAI from 'openai';
import dotenv from 'dotenv';
import { format } from 'date-fns';
dotenv.config();
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});
export class NewsletterGeneratorService {
    /**
     * Analyze competitor reviews and generate insights
     */
    async analyzeCompetitorData(restaurant, competitorReviews) {
        const competitors = restaurant.competitors_json || [];
        // Group reviews by competitor
        const reviewsByCompetitor = new Map();
        competitorReviews.forEach(review => {
            const competitor = competitors.find(c => c.platform === review.platform &&
                review.text?.toLowerCase().includes(c.name.toLowerCase()));
            if (competitor) {
                const existing = reviewsByCompetitor.get(competitor.name) || [];
                reviewsByCompetitor.set(competitor.name, [...existing, review]);
            }
        });
        // Build analysis prompt
        const prompt = this.buildNewsletterPrompt(restaurant, reviewsByCompetitor);
        console.log(`🤖 Generating newsletter analysis for ${restaurant.name}...`);
        try {
            const completion = await openai.chat.completions.create({
                model: 'gpt-4-turbo-preview',
                messages: [
                    {
                        role: 'system',
                        content: `You are a competitive intelligence analyst for restaurants. 
Your job is to analyze competitor reviews and provide actionable insights.
Return your analysis as a JSON object with these sections:
- competitor_moves: Array of notable changes or trends
- review_trends: Array of metrics and patterns
- pricing_signals: Array of pricing-related observations
- action_items: Array of recommended actions

Be specific, data-driven, and actionable.`,
                    },
                    {
                        role: 'user',
                        content: prompt,
                    },
                ],
                temperature: 0.7,
                max_tokens: 2000,
                response_format: { type: 'json_object' },
            });
            const analysis = JSON.parse(completion.choices[0]?.message?.content || '{}');
            return {
                competitor_moves: analysis.competitor_moves || [],
                review_trends: analysis.review_trends || [],
                pricing_signals: analysis.pricing_signals || [],
                action_items: analysis.action_items || [],
            };
        }
        catch (error) {
            console.error('❌ Error analyzing competitor data:', error);
            throw error;
        }
    }
    /**
     * Build the analysis prompt
     */
    buildNewsletterPrompt(restaurant, reviewsByCompetitor) {
        let prompt = `Restaurant: ${restaurant.name}\n`;
        prompt += `Location: ${restaurant.location || 'N/A'}\n\n`;
        prompt += `Analyze the following competitor review data from the past week:\n\n`;
        reviewsByCompetitor.forEach((reviews, competitorName) => {
            prompt += `## ${competitorName} (${reviews.length} reviews)\n\n`;
            const avgRating = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
            prompt += `Average Rating: ${avgRating.toFixed(1)}/5\n\n`;
            prompt += `Recent Reviews:\n`;
            reviews.slice(0, 10).forEach(review => {
                prompt += `- ${review.rating}★ "${review.text?.substring(0, 200)}..."\n`;
            });
            prompt += `\n`;
        });
        if (reviewsByCompetitor.size === 0) {
            prompt += `No competitor reviews found this week.\n`;
        }
        prompt += `\nProvide insights on:\n`;
        prompt += `1. What are competitors doing well or poorly?\n`;
        prompt += `2. Any trends in customer feedback?\n`;
        prompt += `3. Pricing or value mentions?\n`;
        prompt += `4. What should ${restaurant.name} do differently?\n`;
        return prompt;
    }
    /**
     * Generate newsletter HTML
     */
    generateNewsletterHTML(restaurant, weekStartDate, content) {
        const weekFormatted = format(weekStartDate, 'MMMM d, yyyy');
        const baseUrl = process.env.BASE_URL || 'https://maitreo.com';
        const digestUrl = `${baseUrl}/digest/${restaurant.id}`;
        return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Weekly Competitive Intelligence - ${weekFormatted}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 700px; margin: 0 auto; padding: 20px; background: #f8fafc;">
  
  <!-- Header -->
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 12px; padding: 32px 24px; margin-bottom: 24px; text-align: center;">
    <h1 style="margin: 0 0 8px; color: white; font-size: 28px; font-weight: 700;">
      📊 Weekly Competitive Intelligence
    </h1>
    <p style="margin: 0; color: rgba(255,255,255,0.9); font-size: 16px;">
      ${restaurant.name} • Week of ${weekFormatted}
    </p>
  </div>

  <!-- Competitor Moves -->
  ${content.competitor_moves && content.competitor_moves.length > 0 ? `
  <div style="background: white; border-radius: 8px; padding: 24px; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
    <h2 style="margin: 0 0 16px; color: #1e293b; font-size: 20px; display: flex; align-items: center;">
      <span style="margin-right: 8px;">🎯</span> Competitor Moves
    </h2>
    ${content.competitor_moves.map(move => `
      <div style="margin-bottom: 16px; padding: 12px; background: #f8fafc; border-radius: 6px; border-left: 4px solid ${move.impact === 'high' ? '#dc2626' : move.impact === 'medium' ? '#f59e0b' : '#10b981'};">
        <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 4px;">
          <strong style="color: #1e293b;">${move.competitor_name}</strong>
          <span style="font-size: 12px; padding: 2px 8px; background: ${move.impact === 'high' ? '#fee2e2' : move.impact === 'medium' ? '#fef3c7' : '#d1fae5'}; color: ${move.impact === 'high' ? '#dc2626' : move.impact === 'medium' ? '#f59e0b' : '#10b981'}; border-radius: 12px; font-weight: 500;">
            ${move.impact.toUpperCase()} IMPACT
          </span>
        </div>
        <p style="margin: 4px 0 0; color: #475569; font-size: 14px;">
          <strong>${move.insight_type}:</strong> ${move.description}
        </p>
      </div>
    `).join('')}
  </div>
  ` : ''}

  <!-- Review Trends -->
  ${content.review_trends && content.review_trends.length > 0 ? `
  <div style="background: white; border-radius: 8px; padding: 24px; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
    <h2 style="margin: 0 0 16px; color: #1e293b; font-size: 20px; display: flex; align-items: center;">
      <span style="margin-right: 8px;">📈</span> Review Trends
    </h2>
    ${content.review_trends.map(trend => `
      <div style="margin-bottom: 12px; padding: 12px; background: #f0f9ff; border-radius: 6px;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <strong style="color: #0c4a6e;">${trend.metric}</strong>
          <span style="font-size: 18px; font-weight: 600; color: ${trend.change >= 0 ? '#10b981' : '#dc2626'};">
            ${trend.change >= 0 ? '↑' : '↓'} ${Math.abs(trend.change)}%
          </span>
        </div>
        <p style="margin: 4px 0 0; color: #475569; font-size: 13px;">
          ${trend.interpretation}
        </p>
      </div>
    `).join('')}
  </div>
  ` : ''}

  <!-- Pricing Signals -->
  ${content.pricing_signals && content.pricing_signals.length > 0 ? `
  <div style="background: white; border-radius: 8px; padding: 24px; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
    <h2 style="margin: 0 0 16px; color: #1e293b; font-size: 20px; display: flex; align-items: center;">
      <span style="margin-right: 8px;">💰</span> Pricing Signals
    </h2>
    ${content.pricing_signals.map(signal => `
      <div style="margin-bottom: 12px; padding: 12px; background: #fef3c7; border-radius: 6px;">
        <strong style="color: #92400e;">${signal.competitor}</strong>
        <p style="margin: 4px 0 0; color: #78350f; font-size: 14px;">
          <strong>${signal.signal}:</strong> ${signal.details}
        </p>
      </div>
    `).join('')}
  </div>
  ` : ''}

  <!-- Action Items -->
  ${content.action_items && content.action_items.length > 0 ? `
  <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); border-radius: 8px; padding: 24px; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
    <h2 style="margin: 0 0 16px; color: white; font-size: 20px; display: flex; align-items: center;">
      <span style="margin-right: 8px;">✅</span> Recommended Actions
    </h2>
    ${content.action_items.map((item, index) => `
      <div style="margin-bottom: 12px; padding: 14px; background: rgba(255,255,255,0.95); border-radius: 6px;">
        <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 6px;">
          <span style="font-weight: 600; color: #1e293b;">${index + 1}. ${item.category}</span>
          <span style="font-size: 11px; padding: 2px 8px; background: ${item.priority === 'high' ? '#fee2e2' : item.priority === 'medium' ? '#fef3c7' : '#dbeafe'}; color: ${item.priority === 'high' ? '#dc2626' : item.priority === 'medium' ? '#f59e0b' : '#3b82f6'}; border-radius: 10px; font-weight: 600;">
            ${item.priority.toUpperCase()}
          </span>
        </div>
        <p style="margin: 0 0 6px; color: #0f172a; font-size: 14px;">
          ${item.action}
        </p>
        <p style="margin: 0; color: #64748b; font-size: 12px; font-style: italic;">
          Why: ${item.reasoning}
        </p>
      </div>
    `).join('')}
  </div>
  ` : ''}

  <!-- Digest Link -->
  <div style="text-align: center; margin: 24px 0;">
    <a href="${digestUrl}" 
       style="display: inline-block; background: #3b82f6; color: white; text-decoration: none; padding: 12px 32px; border-radius: 6px; font-weight: 500;">
      View Full Dashboard
    </a>
  </div>

  <!-- Footer -->
  <div style="text-align: center; padding: 20px; color: #64748b; font-size: 12px;">
    <p style="margin: 0 0 8px;">
      This report is generated automatically every Sunday at 6 PM based on competitor review data.
    </p>
    <p style="margin: 0;">
      <a href="https://maitreo.com" style="color: #64748b; text-decoration: none;">Maitreo</a> • ${new Date().getFullYear()}
    </p>
  </div>

</body>
</html>
    `.trim();
    }
    /**
     * Generate complete newsletter
     */
    async generateNewsletter(input) {
        console.log(`📰 Generating newsletter for ${input.restaurant.name}...`);
        try {
            // Analyze competitor data
            const content_json = await this.analyzeCompetitorData(input.restaurant, input.competitor_reviews);
            // Generate HTML
            const content_html = this.generateNewsletterHTML(input.restaurant, input.week_start_date, content_json);
            console.log(`✅ Newsletter generated successfully`);
            return {
                content_html,
                content_json,
            };
        }
        catch (error) {
            console.error('❌ Error generating newsletter:', error);
            throw error;
        }
    }
}
export const newsletterGenerator = new NewsletterGeneratorService();
//# sourceMappingURL=newsletterGenerator.js.map