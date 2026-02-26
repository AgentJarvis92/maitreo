// frontend/src/index.ts
import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv10 from "dotenv";

// frontend/src/db/client.ts
import pg from "pg";
import dotenv from "dotenv";
dotenv.config();
var { Pool } = pg;
var pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 3e4,
  connectionTimeoutMillis: 2e3
});
pool.on("connect", () => {
  console.log("\u2705 Database connected");
});
pool.on("error", (err) => {
  console.error("\u274C Unexpected database error:", err);
  pool.query("SELECT 1").then(() => {
    console.log("\u2705 Database reconnected after error");
  }).catch((reconnectErr) => {
    console.error("\u274C Database reconnection failed:", reconnectErr.message);
  });
});
async function query(text, params) {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    console.log("Executed query", { text: text.substring(0, 100), duration, rows: res.rowCount });
    return res;
  } catch (error) {
    console.error("Database query error:", error);
    throw error;
  }
}
async function transaction(callback) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
var client_default = pool;

// frontend/src/services/replyGenerator.ts
import OpenAI from "openai";
import dotenv2 from "dotenv";
dotenv2.config();
var openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});
var ESCALATION_KEYWORDS = {
  health_issue: ["food poisoning", "sick", "illness", "contaminated", "hygiene", "health department", "unclean"],
  threat: ["sue", "lawsuit", "lawyer", "attorney", "police", "assault", "violence"],
  discrimination: ["racist", "sexist", "discriminat", "prejudice", "homophobic", "transphobic"],
  refund_request: ["refund", "money back", "charge back", "chargeback", "reimburse", "compensation"],
  legal_concern: ["violation", "illegal", "law", "regulation", "compliance"],
  extreme_negativity: ["worst", "horrible", "disgusting", "never again", "warning others"]
};
var ReplyGeneratorService = class {
  /**
   * Detects escalation triggers in review text
   */
  detectEscalations(reviewText) {
    const text = reviewText.toLowerCase();
    const escalations = [];
    for (const [reason, keywords] of Object.entries(ESCALATION_KEYWORDS)) {
      if (keywords.some((keyword) => text.includes(keyword))) {
        escalations.push(reason);
      }
    }
    return [...new Set(escalations)];
  }
  /**
   * Builds the system prompt for GPT-4 based on restaurant tone profile
   */
  buildSystemPrompt(restaurant) {
    const tone = restaurant.tone_profile_json?.tone || "professional";
    const personality = restaurant.tone_profile_json?.personality || [];
    const avoid = restaurant.tone_profile_json?.avoid || [];
    const emphasis = restaurant.tone_profile_json?.emphasis || [];
    return `You are a professional customer service assistant for ${restaurant.name}, a restaurant located in ${restaurant.location || "the area"}.

Your task is to generate thoughtful, empathetic replies to customer reviews.

TONE & STYLE:
- Overall tone: ${tone}
${personality.length > 0 ? `- Personality traits: ${personality.join(", ")}` : ""}
${avoid.length > 0 ? `- AVOID: ${avoid.join(", ")}` : ""}
${emphasis.length > 0 ? `- Emphasize: ${emphasis.join(", ")}` : ""}

GUIDELINES:
1. Thank the customer for their feedback (positive or negative)
2. For positive reviews: Express genuine appreciation and invite them back
3. For negative reviews: 
   - Acknowledge their concerns with empathy
   - Apologize sincerely if appropriate
   - Offer to make it right (but don't make specific promises without authorization)
   - Provide a way to continue the conversation offline if serious
4. Keep replies concise (2-4 sentences for positive, 3-5 for negative)
5. Be authentic and avoid generic corporate-speak
6. Match the customer's level of formality
7. Never be defensive or argumentative

For SERIOUS ISSUES (health, threats, discrimination, legal):
- Keep the public reply brief and professional
- Express concern and provide contact info for offline resolution
- Do NOT admit fault or make commitments`;
  }
  /**
   * Builds the user prompt with review details
   */
  buildUserPrompt(review, escalations) {
    const isEscalation = escalations.length > 0;
    let prompt = `Generate a reply to this ${review.rating}-star review:

`;
    prompt += `Platform: ${review.platform}
`;
    prompt += `Author: ${review.author || "Anonymous"}
`;
    prompt += `Rating: ${review.rating}/5
`;
    prompt += `Review: "${review.text}"

`;
    if (isEscalation) {
      prompt += `\u26A0\uFE0F ESCALATION DETECTED: ${escalations.join(", ")}
`;
      prompt += `Keep this reply brief and professional. Invite them to contact you directly.

`;
    }
    prompt += `Generate TWO different reply options (label them "Option 1:" and "Option 2:"). `;
    prompt += `Make them distinctly different in approach while maintaining the brand voice.`;
    return prompt;
  }
  /**
   * Generate reply drafts for a review using GPT-4
   */
  async generateReply(input) {
    const { review, restaurant } = input;
    try {
      const escalations = this.detectEscalations(review.text || "");
      const escalation_flag = escalations.length > 0;
      const systemPrompt = this.buildSystemPrompt(restaurant);
      const userPrompt = this.buildUserPrompt(review, escalations);
      console.log(`\u{1F916} Generating reply for review ${review.id} (${review.platform}, ${review.rating}\u2605)`);
      if (escalation_flag) {
        console.log(`\u26A0\uFE0F  Escalation detected: ${escalations.join(", ")}`);
      }
      const completion = await openai.chat.completions.create({
        model: "gpt-4-turbo-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        temperature: 0.7,
        max_tokens: 500
      });
      const draft_text = completion.choices[0]?.message?.content || "";
      if (!draft_text) {
        throw new Error("GPT-4 returned empty response");
      }
      console.log(`\u2705 Reply generated successfully (${draft_text.length} chars)`);
      return {
        draft_text,
        escalation_flag,
        escalation_reasons: escalations,
        confidence_score: completion.choices[0]?.finish_reason === "stop" ? 0.9 : 0.7
      };
    } catch (error) {
      console.error("\u274C Error generating reply:", error);
      throw error;
    }
  }
  /**
   * Batch generate replies for multiple reviews
   */
  async generateRepliesBatch(inputs) {
    console.log(`\u{1F4E6} Generating ${inputs.length} replies in batch...`);
    const results = await Promise.allSettled(
      inputs.map((input) => this.generateReply(input))
    );
    const outputs = [];
    const errors = [];
    results.forEach((result, index) => {
      if (result.status === "fulfilled") {
        outputs.push(result.value);
      } else {
        console.error(`Failed to generate reply for review ${inputs[index].review.id}:`, result.reason);
        errors.push(result.reason);
      }
    });
    console.log(`\u2705 Batch complete: ${outputs.length} successes, ${errors.length} failures`);
    return outputs;
  }
};
var replyGenerator = new ReplyGeneratorService();

// frontend/src/services/emailService.ts
import { Resend } from "resend";
import dotenv3 from "dotenv";
dotenv3.config();
var _resend = null;
function getResend() {
  if (!_resend) {
    const key = process.env.RESEND_API_KEY;
    if (!key) throw new Error("RESEND_API_KEY not set \u2014 cannot send emails");
    _resend = new Resend(key);
  }
  return _resend;
}
var FROM_EMAIL = process.env.FROM_EMAIL || "noreply@maitreo.com";
var EmailService = class {
  /**
   * Log email to database
   */
  async logEmail(type, to_email, subject, status, metadata = {}, relatedIds) {
    const result = await query(
      `INSERT INTO email_logs (type, to_email, subject, status, sent_at, metadata, review_id, reply_draft_id, newsletter_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [
        type,
        to_email,
        subject,
        status,
        status === "sent" ? /* @__PURE__ */ new Date() : null,
        JSON.stringify(metadata),
        relatedIds?.review_id || null,
        relatedIds?.reply_draft_id || null,
        relatedIds?.newsletter_id || null
      ]
    );
    return result.rows[0].id;
  }
  /**
   * Update email log status
   */
  async updateEmailStatus(logId, status, error_message) {
    await query(
      `UPDATE email_logs 
       SET status = $1, sent_at = $2, error_message = $3
       WHERE id = $4`,
      [status, status === "sent" ? /* @__PURE__ */ new Date() : null, error_message || null, logId]
    );
  }
  /**
   * Send reply draft email to restaurant owner
   */
  async sendReplyDraftEmail(ownerEmail, restaurantName, review, replyDraft) {
    const subject = `New ${review.rating}\u2605 Review Reply Draft - ${restaurantName}`;
    const html = this.buildReplyDraftEmailHTML(restaurantName, review, replyDraft);
    const logId = await this.logEmail(
      "reply_draft",
      ownerEmail,
      subject,
      "pending",
      { restaurant_name: restaurantName },
      { review_id: review.id, reply_draft_id: replyDraft.id }
    );
    try {
      const { data, error } = await getResend().emails.send({
        from: FROM_EMAIL,
        to: ownerEmail,
        subject,
        html
      });
      if (error) {
        throw new Error(error.message);
      }
      await this.updateEmailStatus(logId, "sent");
      console.log(`\u2705 Reply draft email sent to ${ownerEmail} (log: ${logId})`);
    } catch (error) {
      await this.updateEmailStatus(logId, "failed", error.message);
      console.error(`\u274C Failed to send reply draft email:`, error);
      throw error;
    }
  }
  /**
   * Build HTML for reply draft email
   */
  buildReplyDraftEmailHTML(restaurantName, review, replyDraft) {
    const escalationBadge = replyDraft.escalation_flag ? `<div style="background: #fef2f2; border-left: 4px solid #dc2626; padding: 12px; margin: 16px 0;">
           <strong style="color: #dc2626;">\u26A0\uFE0F ESCALATION ALERT</strong>
           <p style="margin: 4px 0 0; color: #991b1b;">
             This review contains: ${replyDraft.escalation_reasons.join(", ").replace(/_/g, " ")}
           </p>
         </div>` : "";
    const ratingStars = "\u2605".repeat(review.rating) + "\u2606".repeat(5 - review.rating);
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>New Review Reply Draft</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  
  <div style="background: #f8fafc; border-radius: 8px; padding: 24px; margin-bottom: 24px;">
    <h1 style="margin: 0 0 8px; color: #1e293b; font-size: 24px;">New Review Reply Ready</h1>
    <p style="margin: 0; color: #64748b; font-size: 14px;">${restaurantName}</p>
  </div>

  ${escalationBadge}

  <div style="background: white; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
    <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 12px;">
      <div>
        <strong style="color: #1e293b; font-size: 16px;">${review.author || "Anonymous"}</strong>
        <div style="color: #f59e0b; font-size: 18px; margin: 4px 0;">${ratingStars}</div>
      </div>
      <div style="text-align: right; font-size: 12px; color: #64748b;">
        <div>${review.platform}</div>
        <div>${review.review_date ? new Date(review.review_date).toLocaleDateString() : "Recent"}</div>
      </div>
    </div>
    <p style="margin: 12px 0 0; color: #475569; font-style: italic; padding: 12px; background: #f8fafc; border-radius: 4px;">
      "${review.text}"
    </p>
  </div>

  <div style="background: #f0fdf4; border: 1px solid #86efac; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
    <h2 style="margin: 0 0 12px; color: #166534; font-size: 18px;">\u{1F4DD} Suggested Reply</h2>
    <div style="white-space: pre-wrap; color: #065f46; line-height: 1.8;">${replyDraft.draft_text}</div>
  </div>

  <div style="background: #eff6ff; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
    <h3 style="margin: 0 0 12px; color: #1e40af; font-size: 16px;">What's Next?</h3>
    <ol style="margin: 0; padding-left: 20px; color: #1e40af;">
      <li style="margin-bottom: 8px;">Review the suggested reply above</li>
      <li style="margin-bottom: 8px;">Edit if needed to match your voice</li>
      <li style="margin-bottom: 8px;">Post your reply on ${review.platform}</li>
      ${replyDraft.escalation_flag ? '<li style="margin-bottom: 8px;"><strong>Consider following up directly given the escalation</strong></li>' : ""}
    </ol>
  </div>

  <div style="text-align: center; margin: 32px 0;">
    <a href="${this.getPlatformReviewUrl(review)}" 
       style="display: inline-block; background: #3b82f6; color: white; text-decoration: none; padding: 12px 32px; border-radius: 6px; font-weight: 500;">
      Reply on ${review.platform}
    </a>
  </div>

  <div style="text-align: center; padding-top: 24px; border-top: 1px solid #e2e8f0; color: #64748b; font-size: 12px;">
    <p>This is an automated email from your Restaurant SaaS system.</p>
    <p>Review ID: ${review.id} \u2022 Draft ID: ${replyDraft.id}</p>
  </div>

</body>
</html>
    `.trim();
  }
  /**
   * Get platform-specific review URL (placeholder - needs actual platform URLs)
   */
  getPlatformReviewUrl(review) {
    const platformUrls = {
      google: "https://business.google.com/reviews",
      yelp: "https://biz.yelp.com/inbox",
      tripadvisor: "https://www.tripadvisor.com/ManagementCenter",
      facebook: "https://www.facebook.com/reviews"
    };
    return platformUrls[review.platform] || "#";
  }
  /**
   * Send weekly newsletter
   */
  async sendNewsletterEmail(ownerEmail, restaurantName, newsletter) {
    const weekStart = new Date(newsletter.week_start_date).toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric"
    });
    const subject = `Your Weekly Competitive Intelligence Report - Week of ${weekStart}`;
    const logId = await this.logEmail(
      "newsletter",
      ownerEmail,
      subject,
      "pending",
      { restaurant_name: restaurantName, week_start: newsletter.week_start_date },
      { newsletter_id: newsletter.id }
    );
    try {
      const { data, error } = await getResend().emails.send({
        from: FROM_EMAIL,
        to: ownerEmail,
        subject,
        html: newsletter.content_html
      });
      if (error) {
        throw new Error(error.message);
      }
      await this.updateEmailStatus(logId, "sent");
      await query(
        `UPDATE newsletters SET sent_at = NOW() WHERE id = $1`,
        [newsletter.id]
      );
      console.log(`\u2705 Newsletter sent to ${ownerEmail} (log: ${logId})`);
    } catch (error) {
      await this.updateEmailStatus(logId, "failed", error.message);
      console.error(`\u274C Failed to send newsletter:`, error);
      throw error;
    }
  }
  /**
   * Send batch emails with rate limiting
   */
  async sendBatch(emails) {
    console.log(`\u{1F4E7} Sending ${emails.length} emails in batch...`);
    for (const email of emails) {
      try {
        if (email.type === "reply_draft") {
          await this.sendReplyDraftEmail(
            email.ownerEmail,
            email.restaurantName,
            email.data.review,
            email.data.replyDraft
          );
        } else if (email.type === "newsletter") {
          await this.sendNewsletterEmail(
            email.ownerEmail,
            email.restaurantName,
            email.data.newsletter
          );
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      } catch (error) {
        console.error(`Failed to send email to ${email.ownerEmail}:`, error);
      }
    }
    console.log(`\u2705 Batch email sending complete`);
  }
};
var emailService = new EmailService();

// frontend/src/jobs/ingestion.ts
var IngestionJob = class {
  constructor() {
    this.sources = [];
  }
  /**
   * Register review sources (Google, Yelp, etc.)
   */
  registerSource(source) {
    this.sources.push(source);
    console.log(`\u2705 Registered review source: ${source.platform}`);
  }
  /**
   * Fetch all restaurants from database
   */
  async getAllRestaurants() {
    const result = await query(
      `SELECT * FROM restaurants ORDER BY created_at ASC`
    );
    return result.rows;
  }
  /**
   * Get the last ingestion time for a restaurant/platform
   */
  async getLastIngestionTime(restaurantId, platform) {
    const result = await query(
      `SELECT MAX(review_date) as max_date 
       FROM reviews 
       WHERE restaurant_id = $1 AND platform = $2`,
      [restaurantId, platform]
    );
    return result.rows[0]?.max_date || null;
  }
  /**
   * Check if review already exists (deduplication)
   */
  async reviewExists(platform, reviewId) {
    const result = await query(
      `SELECT COUNT(*) as count FROM reviews WHERE platform = $1 AND review_id = $2`,
      [platform, reviewId]
    );
    return parseInt(String(result.rows[0]?.count || 0)) > 0;
  }
  /**
   * Insert new review into database
   */
  async insertReview(review) {
    const result = await query(
      `INSERT INTO reviews (
        restaurant_id, platform, review_id, author, rating, text, review_date, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id`,
      [
        review.restaurant_id,
        review.platform,
        review.review_id,
        review.author,
        review.rating,
        review.text,
        review.review_date,
        JSON.stringify(review.metadata || {})
      ]
    );
    return result.rows[0].id;
  }
  /**
   * Generate and store reply draft
   */
  async generateAndStoreReply(review, restaurant) {
    const replyOutput = await replyGenerator.generateReply({ review, restaurant });
    const result = await query(
      `INSERT INTO reply_drafts (
        review_id, draft_text, escalation_flag, escalation_reasons, status, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *`,
      [
        review.id,
        replyOutput.draft_text,
        replyOutput.escalation_flag,
        JSON.stringify(replyOutput.escalation_reasons),
        "pending",
        JSON.stringify({ confidence_score: replyOutput.confidence_score })
      ]
    );
    return result.rows[0];
  }
  /**
   * Process a single restaurant
   */
  async processRestaurant(restaurant) {
    console.log(`
\u{1F4CD} Processing restaurant: ${restaurant.name}`);
    let newReviewsCount = 0;
    for (const source of this.sources) {
      try {
        console.log(`  Fetching reviews from ${source.platform}...`);
        const since = await this.getLastIngestionTime(restaurant.id, source.platform);
        const rawReviews = [];
        console.log(`  Found ${rawReviews.length} potential new reviews`);
        for (const rawReview of rawReviews) {
          if (await this.reviewExists(source.platform, rawReview.id)) {
            console.log(`  \u23ED\uFE0F  Skipping duplicate: ${rawReview.id}`);
            continue;
          }
          const reviewId = await this.insertReview({
            restaurant_id: restaurant.id,
            platform: source.platform,
            review_id: rawReview.id,
            author: rawReview.author,
            rating: rawReview.rating,
            text: rawReview.text,
            review_date: rawReview.date,
            metadata: rawReview.metadata
          });
          console.log(`  \u2705 Inserted review: ${reviewId}`);
          const reviewResult = await query(
            `SELECT * FROM reviews WHERE id = $1`,
            [reviewId]
          );
          const review = reviewResult.rows[0];
          const replyDraft = await this.generateAndStoreReply(review, restaurant);
          console.log(`  \u{1F4AC} Generated reply draft: ${replyDraft.id}`);
          await emailService.sendReplyDraftEmail(
            restaurant.owner_email,
            restaurant.name,
            review,
            replyDraft
          );
          console.log(`  \u{1F4E7} Email sent to ${restaurant.owner_email}`);
          newReviewsCount++;
        }
      } catch (error) {
        console.error(`  \u274C Error processing ${source.platform}:`, error);
      }
    }
    console.log(`  \u{1F4CA} Total new reviews processed: ${newReviewsCount}`);
  }
  /**
   * Run the ingestion job
   */
  async run() {
    console.log("\u{1F680} Starting review ingestion job...");
    console.log(`   Registered sources: ${this.sources.map((s) => s.platform).join(", ")}`);
    const startTime = Date.now();
    try {
      const restaurants = await this.getAllRestaurants();
      console.log(`
\u{1F4CB} Processing ${restaurants.length} restaurants...
`);
      for (const restaurant of restaurants) {
        await this.processRestaurant(restaurant);
      }
      const duration = ((Date.now() - startTime) / 1e3).toFixed(2);
      console.log(`
\u2705 Ingestion job completed in ${duration}s`);
    } catch (error) {
      console.error("\u274C Ingestion job failed:", error);
      throw error;
    }
  }
};
var ingestionJob = new IngestionJob();

// frontend/src/jobs/newsletter.ts
import { startOfWeek as startOfWeek2, format as format2 } from "date-fns";

// frontend/src/services/newsletterGenerator.ts
import OpenAI2 from "openai";
import dotenv4 from "dotenv";
import { format } from "date-fns";
dotenv4.config();
var openai2 = new OpenAI2({
  apiKey: process.env.OPENAI_API_KEY
});
var NewsletterGeneratorService = class {
  /**
   * Analyze competitor reviews and generate insights
   */
  async analyzeCompetitorData(restaurant, competitorReviews) {
    const competitors = restaurant.competitors_json || [];
    const reviewsByCompetitor = /* @__PURE__ */ new Map();
    competitorReviews.forEach((review) => {
      const competitor = competitors.find(
        (c) => c.platform === review.platform && review.text?.toLowerCase().includes(c.name.toLowerCase())
      );
      if (competitor) {
        const existing = reviewsByCompetitor.get(competitor.name) || [];
        reviewsByCompetitor.set(competitor.name, [...existing, review]);
      }
    });
    const prompt = this.buildNewsletterPrompt(restaurant, reviewsByCompetitor);
    console.log(`\u{1F916} Generating newsletter analysis for ${restaurant.name}...`);
    try {
      const completion = await openai2.chat.completions.create({
        model: "gpt-4-turbo-preview",
        messages: [
          {
            role: "system",
            content: `You are a competitive intelligence analyst for restaurants. 
Your job is to analyze competitor reviews and provide actionable insights.
Return your analysis as a JSON object with these sections:
- competitor_moves: Array of notable changes or trends
- review_trends: Array of metrics and patterns
- pricing_signals: Array of pricing-related observations
- action_items: Array of recommended actions

Be specific, data-driven, and actionable.`
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 2e3,
        response_format: { type: "json_object" }
      });
      const analysis = JSON.parse(completion.choices[0]?.message?.content || "{}");
      return {
        competitor_moves: analysis.competitor_moves || [],
        review_trends: analysis.review_trends || [],
        pricing_signals: analysis.pricing_signals || [],
        action_items: analysis.action_items || []
      };
    } catch (error) {
      console.error("\u274C Error analyzing competitor data:", error);
      throw error;
    }
  }
  /**
   * Build the analysis prompt
   */
  buildNewsletterPrompt(restaurant, reviewsByCompetitor) {
    let prompt = `Restaurant: ${restaurant.name}
`;
    prompt += `Location: ${restaurant.location || "N/A"}

`;
    prompt += `Analyze the following competitor review data from the past week:

`;
    reviewsByCompetitor.forEach((reviews, competitorName) => {
      prompt += `## ${competitorName} (${reviews.length} reviews)

`;
      const avgRating = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
      prompt += `Average Rating: ${avgRating.toFixed(1)}/5

`;
      prompt += `Recent Reviews:
`;
      reviews.slice(0, 10).forEach((review) => {
        prompt += `- ${review.rating}\u2605 "${review.text?.substring(0, 200)}..."
`;
      });
      prompt += `
`;
    });
    if (reviewsByCompetitor.size === 0) {
      prompt += `No competitor reviews found this week.
`;
    }
    prompt += `
Provide insights on:
`;
    prompt += `1. What are competitors doing well or poorly?
`;
    prompt += `2. Any trends in customer feedback?
`;
    prompt += `3. Pricing or value mentions?
`;
    prompt += `4. What should ${restaurant.name} do differently?
`;
    return prompt;
  }
  /**
   * Generate newsletter HTML
   */
  generateNewsletterHTML(restaurant, weekStartDate, content) {
    const weekFormatted = format(weekStartDate, "MMMM d, yyyy");
    const baseUrl = process.env.BASE_URL || "https://maitreo.com";
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
      \u{1F4CA} Weekly Competitive Intelligence
    </h1>
    <p style="margin: 0; color: rgba(255,255,255,0.9); font-size: 16px;">
      ${restaurant.name} \u2022 Week of ${weekFormatted}
    </p>
  </div>

  <!-- Competitor Moves -->
  ${content.competitor_moves && content.competitor_moves.length > 0 ? `
  <div style="background: white; border-radius: 8px; padding: 24px; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
    <h2 style="margin: 0 0 16px; color: #1e293b; font-size: 20px; display: flex; align-items: center;">
      <span style="margin-right: 8px;">\u{1F3AF}</span> Competitor Moves
    </h2>
    ${content.competitor_moves.map((move) => `
      <div style="margin-bottom: 16px; padding: 12px; background: #f8fafc; border-radius: 6px; border-left: 4px solid ${move.impact === "high" ? "#dc2626" : move.impact === "medium" ? "#f59e0b" : "#10b981"};">
        <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 4px;">
          <strong style="color: #1e293b;">${move.competitor_name}</strong>
          <span style="font-size: 12px; padding: 2px 8px; background: ${move.impact === "high" ? "#fee2e2" : move.impact === "medium" ? "#fef3c7" : "#d1fae5"}; color: ${move.impact === "high" ? "#dc2626" : move.impact === "medium" ? "#f59e0b" : "#10b981"}; border-radius: 12px; font-weight: 500;">
            ${move.impact.toUpperCase()} IMPACT
          </span>
        </div>
        <p style="margin: 4px 0 0; color: #475569; font-size: 14px;">
          <strong>${move.insight_type}:</strong> ${move.description}
        </p>
      </div>
    `).join("")}
  </div>
  ` : ""}

  <!-- Review Trends -->
  ${content.review_trends && content.review_trends.length > 0 ? `
  <div style="background: white; border-radius: 8px; padding: 24px; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
    <h2 style="margin: 0 0 16px; color: #1e293b; font-size: 20px; display: flex; align-items: center;">
      <span style="margin-right: 8px;">\u{1F4C8}</span> Review Trends
    </h2>
    ${content.review_trends.map((trend) => `
      <div style="margin-bottom: 12px; padding: 12px; background: #f0f9ff; border-radius: 6px;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <strong style="color: #0c4a6e;">${trend.metric}</strong>
          <span style="font-size: 18px; font-weight: 600; color: ${trend.change >= 0 ? "#10b981" : "#dc2626"};">
            ${trend.change >= 0 ? "\u2191" : "\u2193"} ${Math.abs(trend.change)}%
          </span>
        </div>
        <p style="margin: 4px 0 0; color: #475569; font-size: 13px;">
          ${trend.interpretation}
        </p>
      </div>
    `).join("")}
  </div>
  ` : ""}

  <!-- Pricing Signals -->
  ${content.pricing_signals && content.pricing_signals.length > 0 ? `
  <div style="background: white; border-radius: 8px; padding: 24px; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
    <h2 style="margin: 0 0 16px; color: #1e293b; font-size: 20px; display: flex; align-items: center;">
      <span style="margin-right: 8px;">\u{1F4B0}</span> Pricing Signals
    </h2>
    ${content.pricing_signals.map((signal) => `
      <div style="margin-bottom: 12px; padding: 12px; background: #fef3c7; border-radius: 6px;">
        <strong style="color: #92400e;">${signal.competitor}</strong>
        <p style="margin: 4px 0 0; color: #78350f; font-size: 14px;">
          <strong>${signal.signal}:</strong> ${signal.details}
        </p>
      </div>
    `).join("")}
  </div>
  ` : ""}

  <!-- Action Items -->
  ${content.action_items && content.action_items.length > 0 ? `
  <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); border-radius: 8px; padding: 24px; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
    <h2 style="margin: 0 0 16px; color: white; font-size: 20px; display: flex; align-items: center;">
      <span style="margin-right: 8px;">\u2705</span> Recommended Actions
    </h2>
    ${content.action_items.map((item, index) => `
      <div style="margin-bottom: 12px; padding: 14px; background: rgba(255,255,255,0.95); border-radius: 6px;">
        <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 6px;">
          <span style="font-weight: 600; color: #1e293b;">${index + 1}. ${item.category}</span>
          <span style="font-size: 11px; padding: 2px 8px; background: ${item.priority === "high" ? "#fee2e2" : item.priority === "medium" ? "#fef3c7" : "#dbeafe"}; color: ${item.priority === "high" ? "#dc2626" : item.priority === "medium" ? "#f59e0b" : "#3b82f6"}; border-radius: 10px; font-weight: 600;">
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
    `).join("")}
  </div>
  ` : ""}

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
      <a href="https://maitreo.com" style="color: #64748b; text-decoration: none;">Maitreo</a> \u2022 ${(/* @__PURE__ */ new Date()).getFullYear()}
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
    console.log(`\u{1F4F0} Generating newsletter for ${input.restaurant.name}...`);
    try {
      const content_json = await this.analyzeCompetitorData(
        input.restaurant,
        input.competitor_reviews
      );
      const content_html = this.generateNewsletterHTML(
        input.restaurant,
        input.week_start_date,
        content_json
      );
      console.log(`\u2705 Newsletter generated successfully`);
      return {
        content_html,
        content_json
      };
    } catch (error) {
      console.error("\u274C Error generating newsletter:", error);
      throw error;
    }
  }
};
var newsletterGenerator = new NewsletterGeneratorService();

// frontend/src/jobs/newsletter.ts
var NewsletterJob = class {
  /**
   * Fetch all active restaurants
   */
  async getAllRestaurants() {
    const result = await query(
      `SELECT * FROM restaurants ORDER BY created_at ASC`
    );
    return result.rows;
  }
  /**
   * Get competitor reviews for the past 7 days
   */
  async getCompetitorReviews(restaurant, weekStartDate) {
    const weekEndDate = new Date(weekStartDate);
    weekEndDate.setDate(weekEndDate.getDate() + 7);
    const competitorNames = (restaurant.competitors_json || []).map((c) => c.name);
    if (competitorNames.length === 0) {
      console.log(`  \u26A0\uFE0F  No competitors configured for ${restaurant.name}`);
      return [];
    }
    const result = await query(
      `SELECT * FROM reviews 
       WHERE review_date >= $1 
       AND review_date < $2
       AND (${competitorNames.map((_, i) => `LOWER(text) LIKE $${i + 3}`).join(" OR ")})
       ORDER BY review_date DESC
       LIMIT 100`,
      [
        weekStartDate,
        weekEndDate,
        ...competitorNames.map((name) => `%${name.toLowerCase()}%`)
      ]
    );
    return result.rows;
  }
  /**
   * Check if newsletter already exists for this week
   */
  async newsletterExists(restaurantId, weekStartDate) {
    const result = await query(
      `SELECT COUNT(*) as count FROM newsletters 
       WHERE restaurant_id = $1 AND week_start_date = $2`,
      [restaurantId, weekStartDate]
    );
    return parseInt(String(result.rows[0]?.count || 0)) > 0;
  }
  /**
   * Save newsletter to database
   */
  async saveNewsletter(restaurantId, weekStartDate, contentHtml, contentJson) {
    const result = await query(
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
  async processRestaurant(restaurant, weekStartDate) {
    console.log(`
\u{1F4CD} Processing newsletter for: ${restaurant.name}`);
    try {
      if (await this.newsletterExists(restaurant.id, weekStartDate)) {
        console.log(`  \u23ED\uFE0F  Newsletter already exists for this week`);
        return;
      }
      console.log(`  \u{1F4CA} Fetching competitor reviews...`);
      const competitorReviews = await this.getCompetitorReviews(restaurant, weekStartDate);
      console.log(`  Found ${competitorReviews.length} competitor reviews`);
      console.log(`  \u{1F916} Generating newsletter content...`);
      const { content_html, content_json } = await newsletterGenerator.generateNewsletter({
        restaurant,
        week_start_date: weekStartDate,
        competitor_reviews: competitorReviews
      });
      console.log(`  \u{1F4BE} Saving newsletter...`);
      const newsletter = await this.saveNewsletter(
        restaurant.id,
        weekStartDate,
        content_html,
        content_json
      );
      console.log(`  \u2705 Newsletter saved: ${newsletter.id}`);
      console.log(`  \u{1F4E7} Sending email to ${restaurant.owner_email}...`);
      await emailService.sendNewsletterEmail(
        restaurant.owner_email,
        restaurant.name,
        newsletter
      );
      console.log(`  \u2705 Newsletter email sent!`);
    } catch (error) {
      console.error(`  \u274C Error processing newsletter:`, error);
      throw error;
    }
  }
  /**
   * Run the newsletter job
   */
  async run(weekStartDate) {
    console.log("\u{1F680} Starting weekly newsletter job...");
    const targetWeek = weekStartDate || startOfWeek2(/* @__PURE__ */ new Date(), { weekStartsOn: 1 });
    console.log(`   Target week: ${format2(targetWeek, "MMMM d, yyyy")}`);
    const startTime = Date.now();
    try {
      const restaurants = await this.getAllRestaurants();
      console.log(`
\u{1F4CB} Processing newsletters for ${restaurants.length} restaurants...
`);
      for (const restaurant of restaurants) {
        await this.processRestaurant(restaurant, targetWeek);
      }
      const duration = ((Date.now() - startTime) / 1e3).toFixed(2);
      console.log(`
\u2705 Newsletter job completed in ${duration}s`);
    } catch (error) {
      console.error("\u274C Newsletter job failed:", error);
      throw error;
    }
  }
};
var newsletterJob = new NewsletterJob();

// frontend/src/sources/google.ts
import dotenv5 from "dotenv";
dotenv5.config();
var GoogleReviewSource = class {
  constructor() {
    this.platform = "google";
    this.apiKey = process.env.GOOGLE_PLACES_API_KEY || "";
  }
  /**
   * Fetch reviews for a Google Place ID.
   * Uses Places API v1 (New) — returns up to 5 most recent reviews per call.
   * For more, use the legacy Places API with pagetoken.
   */
  async fetchReviews(placeId, since) {
    if (!this.apiKey) {
      console.warn("\u26A0\uFE0F  GOOGLE_PLACES_API_KEY not set, skipping Google reviews");
      return [];
    }
    try {
      const url = `https://places.googleapis.com/v1/places/${placeId}?fields=reviews&key=${this.apiKey}`;
      const response = await fetch(url, {
        headers: {
          "X-Goog-Api-Key": this.apiKey,
          "X-Goog-FieldMask": "reviews"
        }
      });
      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Google Places API error ${response.status}: ${errText}`);
      }
      const data = await response.json();
      const reviews = [];
      for (const r of data.reviews || []) {
        const publishDate = new Date(r.publishTime || r.relativePublishTimeDescription);
        if (since && publishDate <= since) continue;
        reviews.push({
          id: `google_${placeId}_${Buffer.from(r.authorAttribution?.displayName + r.publishTime).toString("base64url").slice(0, 32)}`,
          author: r.authorAttribution?.displayName || "Anonymous",
          rating: r.rating || 0,
          text: r.text?.text || r.originalText?.text || "",
          date: publishDate,
          metadata: {
            platform: "google",
            profileUrl: r.authorAttribution?.uri,
            language: r.text?.languageCode,
            relativeTime: r.relativePublishTimeDescription
          }
        });
      }
      console.log(`\u{1F4CD} Google: fetched ${reviews.length} new reviews for place ${placeId}`);
      return reviews;
    } catch (error) {
      console.error("\u274C Google Places fetch error:", error);
      return [];
    }
  }
};
var googleReviewSource = new GoogleReviewSource();

// frontend/src/sources/yelp.ts
import dotenv6 from "dotenv";
dotenv6.config();
var YelpReviewSource = class {
  constructor() {
    this.platform = "yelp";
    this.baseUrl = "https://api.yelp.com/v3";
    this.apiKey = process.env.YELP_API_KEY || "";
  }
  /**
   * Fetch reviews for a Yelp business ID/alias.
   * Yelp Fusion API returns up to 3 "highlighted" reviews per business.
   * For production, you'd want Yelp's GraphQL endpoint or a scraping layer.
   */
  async fetchReviews(businessId, since) {
    if (!this.apiKey) {
      console.warn("\u26A0\uFE0F  YELP_API_KEY not set, skipping Yelp reviews");
      return [];
    }
    try {
      const url = `${this.baseUrl}/businesses/${businessId}/reviews?sort_by=newest&limit=50`;
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          Accept: "application/json"
        }
      });
      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Yelp API error ${response.status}: ${errText}`);
      }
      const data = await response.json();
      const reviews = [];
      for (const r of data.reviews || []) {
        const reviewDate = new Date(r.time_created);
        if (since && reviewDate <= since) continue;
        reviews.push({
          id: r.id,
          author: r.user?.name || "Anonymous",
          rating: r.rating || 0,
          text: r.text || "",
          date: reviewDate,
          metadata: {
            platform: "yelp",
            profileUrl: r.user?.profile_url,
            timeCreated: r.time_created
          }
        });
      }
      console.log(`\u2B50 Yelp: fetched ${reviews.length} new reviews for ${businessId}`);
      return reviews;
    } catch (error) {
      console.error("\u274C Yelp fetch error:", error);
      return [];
    }
  }
};
var yelpReviewSource = new YelpReviewSource();

// frontend/src/services/sentimentClassifier.ts
var NEGATIVE_WORDS = [
  "terrible",
  "awful",
  "worst",
  "horrible",
  "disgusting",
  "rude",
  "cold",
  "stale",
  "overpriced",
  "dirty",
  "slow",
  "bland",
  "inedible",
  "never again",
  "food poisoning",
  "sick",
  "disappointing",
  "waste",
  "mediocre",
  "gross"
];
var POSITIVE_WORDS = [
  "amazing",
  "excellent",
  "delicious",
  "fantastic",
  "wonderful",
  "best",
  "outstanding",
  "perfect",
  "incredible",
  "friendly",
  "fresh",
  "love",
  "recommend",
  "favorite",
  "gem",
  "superb",
  "phenomenal",
  "great",
  "awesome"
];
function classifySentiment(rating, text) {
  const lower = (text || "").toLowerCase();
  const signals = [];
  let score = (rating - 3) / 2;
  signals.push(`rating: ${rating}/5`);
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
  const textAdjust = Math.min(0.2, (posCount - negCount) * 0.05);
  score = Math.max(-1, Math.min(1, score + textAdjust));
  const sentiment = score > 0.1 ? "positive" : score < -0.1 ? "negative" : "neutral";
  return { sentiment, score: Math.round(score * 100) / 100, signals };
}

// frontend/src/sms/twilioClient.ts
import dotenv7 from "dotenv";
dotenv7.config();
var TwilioClient = class {
  constructor() {
    this.accountSid = process.env.TWILIO_ACCOUNT_SID || "";
    this.authToken = process.env.TWILIO_AUTH_TOKEN || "";
    this.fromNumber = process.env.TWILIO_PHONE_NUMBER || "";
    this.baseUrl = `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}`;
  }
  get isConfigured() {
    return !!(this.accountSid && this.authToken && this.fromNumber);
  }
  /**
   * Send an SMS message via Twilio REST API (no SDK needed).
   */
  async sendSms(to, body) {
    if (!this.isConfigured) {
      throw new Error("Twilio not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER");
    }
    const url = `${this.baseUrl}/Messages.json`;
    const auth = Buffer.from(`${this.accountSid}:${this.authToken}`).toString("base64");
    const params = new URLSearchParams({
      To: to,
      From: this.fromNumber,
      Body: body
    });
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: params.toString()
    });
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Twilio API error ${response.status}: ${errText}`);
    }
    const data = await response.json();
    console.log(`\u{1F4F1} SMS sent to ${to} (SID: ${data.sid})`);
    return {
      sid: data.sid,
      status: data.status,
      to: data.to,
      body: data.body
    };
  }
};
var twilioClient = new TwilioClient();

// frontend/src/sms/commandParser.ts
var EXACT_COMMANDS = {
  "APPROVE": "APPROVE",
  "EDIT": "EDIT",
  "IGNORE": "IGNORE",
  "PAUSE": "PAUSE",
  "RESUME": "RESUME",
  "STATUS": "STATUS",
  "BILLING": "BILLING",
  "CANCEL": "CANCEL",
  "HELP": "HELP",
  "STOP": "STOP",
  "YES": "CANCEL_CONFIRM",
  "NO": "CANCEL_DENY"
};
var FUZZY_MAP = {
  "APROVE": "APPROVE",
  "APPROV": "APPROVE",
  "APRROVE": "APPROVE",
  "APORVE": "APPROVE",
  "EDTI": "EDIT",
  "IGNOR": "IGNORE",
  "INGNORE": "IGNORE",
  "PAUS": "PAUSE",
  "PASUE": "PAUSE",
  "RESUM": "RESUME",
  "RSUME": "RESUME",
  "STAUTS": "STATUS",
  "STATS": "STATUS",
  "STAUS": "STATUS",
  "BILING": "BILLING",
  "BILLIN": "BILLING",
  "CANCLE": "CANCEL",
  "CANEL": "CANCEL",
  "HLEP": "HELP",
  "HEPL": "HELP",
  "STPO": "STOP",
  "SOTP": "STOP",
  "Y": "CANCEL_CONFIRM",
  "YEP": "CANCEL_CONFIRM",
  "YEAH": "CANCEL_CONFIRM",
  "YA": "CANCEL_CONFIRM",
  "NOPE": "CANCEL_DENY",
  "NAH": "CANCEL_DENY",
  "N": "CANCEL_DENY"
};
function parseCommand(body, conversationState) {
  const raw = body.trim();
  const normalized = raw.toUpperCase().trim();
  if (conversationState === "waiting_for_custom_reply") {
    const override = EXACT_COMMANDS[normalized];
    if (override && override !== "CANCEL_CONFIRM" && override !== "CANCEL_DENY") {
      return { type: override, raw };
    }
    return { type: "CUSTOM_REPLY", raw, body: raw };
  }
  if (conversationState === "waiting_for_cancel_confirm") {
    if (normalized === "YES" || normalized === "Y" || normalized === "YEP" || normalized === "YEAH" || normalized === "YA") {
      return { type: "CANCEL_CONFIRM", raw };
    }
    if (normalized === "NO" || normalized === "N" || normalized === "NOPE" || normalized === "NAH") {
      return { type: "CANCEL_DENY", raw };
    }
    return { type: "CANCEL_DENY", raw };
  }
  const exact = EXACT_COMMANDS[normalized];
  if (exact) {
    if (exact === "CANCEL_CONFIRM" || exact === "CANCEL_DENY") {
      return { type: "UNKNOWN", raw };
    }
    return { type: exact, raw };
  }
  const fuzzy = FUZZY_MAP[normalized];
  if (fuzzy) {
    if (fuzzy === "CANCEL_CONFIRM" || fuzzy === "CANCEL_DENY") {
      return { type: "UNKNOWN", raw };
    }
    return { type: fuzzy, raw };
  }
  return { type: "UNKNOWN", raw };
}

// frontend/src/services/stripeService.ts
import Stripe from "stripe";
import dotenv8 from "dotenv";
dotenv8.config();
var stripeKey = process.env.STRIPE_SECRET_KEY || "sk_test_stub_key_not_configured";
if (!process.env.STRIPE_SECRET_KEY) {
  console.warn("\u26A0\uFE0F  STRIPE_SECRET_KEY not configured - Stripe operations will fail at runtime");
}
var stripe = new Stripe(stripeKey);
var PRODUCT_NAME = "Maitreo \u2014 Google Review Management";
var PRICE_AMOUNT = 9900;
var TRIAL_DAYS = 14;
var _priceId = null;
async function ensurePriceId() {
  if (_priceId) return _priceId;
  const products = await stripe.products.search({
    query: `name:"${PRODUCT_NAME}" AND active:"true"`
  });
  let productId;
  if (products.data.length > 0) {
    productId = products.data[0].id;
  } else {
    const product = await stripe.products.create({
      name: PRODUCT_NAME,
      description: "AI-powered Google review management with automated responses, competitive intelligence, and SMS alerts."
    });
    productId = product.id;
    console.log(`\u2705 Created Stripe product: ${productId}`);
  }
  const prices = await stripe.prices.list({
    product: productId,
    active: true,
    type: "recurring"
  });
  const existing = prices.data.find(
    (p) => p.unit_amount === PRICE_AMOUNT && p.recurring?.interval === "month"
  );
  if (existing) {
    _priceId = existing.id;
  } else {
    const price = await stripe.prices.create({
      product: productId,
      unit_amount: PRICE_AMOUNT,
      currency: "usd",
      recurring: { interval: "month" }
    });
    _priceId = price.id;
    console.log(`\u2705 Created Stripe price: ${_priceId}`);
  }
  return _priceId;
}
async function createCheckoutSession(params) {
  const priceId = await ensurePriceId();
  const baseUrl = process.env.APP_BASE_URL || "https://maitreo.com";
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    payment_method_types: ["card"],
    line_items: [{ price: priceId, quantity: 1 }],
    subscription_data: {
      trial_period_days: TRIAL_DAYS,
      metadata: { restaurant_id: params.restaurantId }
    },
    metadata: { restaurant_id: params.restaurantId },
    customer_email: params.customerEmail || void 0,
    success_url: params.successUrl || `${baseUrl}/welcome?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: params.cancelUrl || `${baseUrl}/pricing`
  });
  return session;
}
async function createPortalSession(stripeCustomerId) {
  const baseUrl = process.env.APP_BASE_URL || "https://maitreo.com";
  const session = await stripe.billingPortal.sessions.create({
    customer: stripeCustomerId,
    return_url: `${baseUrl}/dashboard`
  });
  return session.url;
}
async function cancelSubscription(subscriptionId) {
  return stripe.subscriptions.cancel(subscriptionId);
}
function mapStripeStatus(status) {
  switch (status) {
    case "trialing":
      return "trialing";
    case "active":
      return "active";
    case "past_due":
      return "past_due";
    case "canceled":
    case "unpaid":
    case "incomplete_expired":
      return "canceled";
    default:
      return "active";
  }
}
async function syncSubscriptionState(sub) {
  const restaurantId = sub.metadata?.restaurant_id;
  if (!restaurantId) {
    console.warn(`\u26A0\uFE0F Subscription ${sub.id} has no restaurant_id metadata`);
    return;
  }
  const state = mapStripeStatus(sub.status);
  const trialEnd = sub.trial_end ? new Date(sub.trial_end * 1e3) : null;
  const periodEndTs = sub.current_period_end;
  const periodEnd = periodEndTs ? new Date(periodEndTs * 1e3) : null;
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  await query(
    `UPDATE restaurants SET
       stripe_customer_id = $1,
       stripe_subscription_id = $2,
       subscription_state = $3,
       trial_ends_at = $4,
       current_period_end = $5,
       updated_at = NOW()
     WHERE id = $6`,
    [customerId, sub.id, state, trialEnd, periodEnd, restaurantId]
  );
  console.log(`\u{1F4E6} Restaurant ${restaurantId} \u2192 subscription_state=${state}`);
  if (state === "canceled" || state === "past_due") {
    await query(
      `UPDATE restaurants SET monitoring_paused = true WHERE id = $1`,
      [restaurantId]
    );
  } else if (state === "active" || state === "trialing") {
    await query(
      `UPDATE restaurants SET monitoring_paused = false WHERE id = $1`,
      [restaurantId]
    );
  }
}
async function findRestaurantBySubscriptionId(subscriptionId) {
  const result = await query(
    `SELECT id, owner_phone, subscription_state FROM restaurants WHERE stripe_subscription_id = $1 LIMIT 1`,
    [subscriptionId]
  );
  return result.rows[0] || null;
}

// frontend/src/sms/smsService.ts
var HELP_SUFFIX = "\nReply HELP anytime.";
var TEMPLATES = {
  help: `Maitreo Commands:
Review: APPROVE, EDIT, IGNORE
Account: PAUSE, RESUME, STATUS
Billing: BILLING, CANCEL
Support: text 'help' or email support@maitreo.com${HELP_SUFFIX}`,
  stop: `You've been unsubscribed from Maitreo alerts. Reply START to re-subscribe anytime.`,
  approve: `\u2705 Response approved and posted!${HELP_SUFFIX}`,
  editPrompt: `\u270F\uFE0F Type your custom reply now. Your next message will be posted as the response.${HELP_SUFFIX}`,
  customReplyConfirm: `\u2705 Your custom response has been posted!${HELP_SUFFIX}`,
  ignore: `\u{1F44D} Review dismissed. No reply will be posted.${HELP_SUFFIX}`,
  pause: `\u23F8\uFE0F Review monitoring paused. Text RESUME to restart.${HELP_SUFFIX}`,
  resume: `\u25B6\uFE0F Review monitoring resumed! You'll receive alerts for new reviews.${HELP_SUFFIX}`,
  cancelPrompt: `\u26A0\uFE0F Are you sure you want to cancel your Maitreo subscription? Reply YES to confirm or NO to keep your account.${HELP_SUFFIX}`,
  cancelConfirm: `Your cancellation request has been submitted. You'll receive a confirmation email. We're sorry to see you go.${HELP_SUFFIX}`,
  cancelDeny: `Great, your account remains active!${HELP_SUFFIX}`,
  noPendingReview: `No pending review to respond to. We'll notify you when the next one arrives.${HELP_SUFFIX}`,
  unknownCommand: `Sorry, I didn't understand that command.

Maitreo Commands:
Review: APPROVE, EDIT, IGNORE
Account: PAUSE, RESUME, STATUS
Billing: BILLING, CANCEL
Support: text 'help' or email support@maitreo.com${HELP_SUFFIX}`
};
async function getOrCreateContext(phone) {
  const result = await query(
    `SELECT phone, state, pending_review_id, restaurant_id 
     FROM sms_context WHERE phone = $1`,
    [phone]
  );
  if (result.rows.length > 0) return result.rows[0];
  const restResult = await query(
    `SELECT id FROM restaurants WHERE owner_phone = $1 LIMIT 1`,
    [phone]
  );
  const restaurantId = restResult.rows[0]?.id || null;
  await query(
    `INSERT INTO sms_context (phone, state, pending_review_id, restaurant_id)
     VALUES ($1, NULL, NULL, $2)
     ON CONFLICT (phone) DO NOTHING`,
    [phone, restaurantId]
  );
  return { phone, state: null, pending_review_id: null, restaurant_id: restaurantId };
}
async function updateContext(phone, updates) {
  const sets = [];
  const vals = [];
  let i = 1;
  if ("state" in updates) {
    sets.push(`state = $${i++}`);
    vals.push(updates.state);
  }
  if ("pending_review_id" in updates) {
    sets.push(`pending_review_id = $${i++}`);
    vals.push(updates.pending_review_id);
  }
  if ("restaurant_id" in updates) {
    sets.push(`restaurant_id = $${i++}`);
    vals.push(updates.restaurant_id);
  }
  sets.push(`updated_at = NOW()`);
  vals.push(phone);
  await query(
    `UPDATE sms_context SET ${sets.join(", ")} WHERE phone = $${i}`,
    vals
  );
}
async function logSms(params) {
  await query(
    `INSERT INTO sms_logs (direction, from_phone, to_phone, body, command_parsed, status, twilio_sid)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [params.direction, params.from_phone, params.to_phone, params.body, params.command || null, params.status, params.twilio_sid || null]
  );
}
var SmsService = class {
  constructor() {
    this.twilioPhone = process.env.TWILIO_PHONE_NUMBER || "";
  }
  /**
   * Send an SMS and log it.
   */
  async sendSms(to, body) {
    try {
      const result = await twilioClient.sendSms(to, body);
      await logSms({
        direction: "outbound",
        from_phone: this.twilioPhone,
        to_phone: to,
        body,
        status: "sent",
        twilio_sid: result.sid
      });
    } catch (error) {
      await logSms({
        direction: "outbound",
        from_phone: this.twilioPhone,
        to_phone: to,
        body,
        status: "failed"
      }).catch(() => {
      });
      throw error;
    }
  }
  /**
   * Send a mock review alert (for testing until Agent 1 is done).
   */
  async sendMockReviewAlert(toPhone, restaurantId) {
    const mock = {
      id: `mock-${Date.now()}`,
      author: "Sarah",
      rating: 2,
      text: "Food was cold and service was slow. Very disappointing experience.",
      draft_reply: "We're sorry to hear about your experience, Sarah. We're addressing kitchen timing and service speed. We'd love the chance to make it right \u2014 please reach out to us directly.",
      status: "pending"
    };
    await getOrCreateContext(toPhone);
    await updateContext(toPhone, {
      pending_review_id: mock.id,
      state: null,
      restaurant_id: restaurantId || null
    });
    const body = `New review from ${mock.author}: "${mock.text}" (${mock.rating}\u2605)
Draft reply: "${mock.draft_reply}"
APPROVE to post | EDIT for custom reply | IGNORE to skip.${HELP_SUFFIX}`;
    await this.sendSms(toPhone, body);
  }
  /**
   * Send review alert for a real review + draft.
   */
  async sendReviewAlert(review, draft, restaurant, ownerPhone) {
    const snippet = (review.text || "").slice(0, 120) + ((review.text || "").length > 120 ? "..." : "");
    let draftSnippet = draft.draft_text;
    const opt1Match = draftSnippet.match(/Option 1[:\s]*(.+?)(?=Option 2|$)/is);
    if (opt1Match) draftSnippet = opt1Match[1].trim();
    draftSnippet = draftSnippet.slice(0, 300);
    const body = `New review from ${review.author || "Anonymous"}: "${snippet}" (${review.rating}\u2605)
Draft reply: "${draftSnippet}"
APPROVE to post | EDIT for custom reply | IGNORE to skip.${HELP_SUFFIX}`;
    await getOrCreateContext(ownerPhone);
    await updateContext(ownerPhone, {
      pending_review_id: review.id,
      state: null,
      restaurant_id: restaurant.id
    });
    const insertResult = await query(
      `INSERT INTO sms_messages (
        restaurant_id, review_id, reply_draft_id, phone_number,
        direction, body, status
      ) VALUES ($1, $2, $3, $4, 'outbound', $5, 'sending')
      RETURNING id`,
      [restaurant.id, review.id, draft.id, ownerPhone, body]
    );
    await this.sendSms(ownerPhone, body);
    await query(
      `UPDATE sms_messages SET status = 'sent' WHERE id = $1`,
      [insertResult.rows[0].id]
    );
    return insertResult.rows[0].id;
  }
  /**
   * Handle an incoming SMS — the main command dispatcher.
   */
  async handleIncoming(fromPhone, body, messageSid) {
    const ctx = await getOrCreateContext(fromPhone);
    const parsed = parseCommand(body, ctx.state || void 0);
    await logSms({
      direction: "inbound",
      from_phone: fromPhone,
      to_phone: this.twilioPhone,
      body,
      command: parsed.type,
      status: "received",
      twilio_sid: messageSid || null
    });
    if (ctx.restaurant_id && parsed.type !== "BILLING" && parsed.type !== "STOP") {
      const subCheck = await query(`SELECT subscription_state FROM restaurants WHERE id = $1`, [ctx.restaurant_id]);
      if (subCheck.rows[0]?.subscription_state === "canceled") {
        return "Your subscription is inactive. Text BILLING to reactivate.";
      }
    }
    switch (parsed.type) {
      case "STOP":
        return this.handleStop(fromPhone, ctx);
      case "HELP":
        return TEMPLATES.help;
      case "APPROVE":
        return this.handleApprove(fromPhone, ctx);
      case "EDIT":
        return this.handleEdit(fromPhone, ctx);
      case "CUSTOM_REPLY":
        return this.handleCustomReply(fromPhone, ctx, parsed.body || body.trim());
      case "IGNORE":
        return this.handleIgnore(fromPhone, ctx);
      case "PAUSE":
        return this.handlePause(fromPhone, ctx);
      case "RESUME":
        return this.handleResume(fromPhone, ctx);
      case "STATUS":
        return this.handleStatus(fromPhone, ctx);
      case "BILLING":
        return this.handleBilling(fromPhone, ctx);
      case "CANCEL":
        return this.handleCancel(fromPhone, ctx);
      case "CANCEL_CONFIRM":
        return this.handleCancelConfirm(fromPhone, ctx);
      case "CANCEL_DENY":
        await updateContext(fromPhone, { state: null });
        return TEMPLATES.cancelDeny;
      case "UNKNOWN":
      default:
        return TEMPLATES.unknownCommand;
    }
  }
  // ─── Command Handlers ────────────────────────────────────────────
  async handleStop(phone, ctx) {
    if (ctx.restaurant_id) {
      await query(
        `UPDATE restaurants SET sms_opted_out = true, monitoring_paused = true WHERE id = $1`,
        [ctx.restaurant_id]
      ).catch(() => {
      });
    }
    await updateContext(phone, { state: null, pending_review_id: null });
    return TEMPLATES.stop;
  }
  async handleApprove(phone, ctx) {
    if (!ctx.pending_review_id) return TEMPLATES.noPendingReview;
    if (ctx.pending_review_id.startsWith("mock-")) {
      console.log(`\u2705 Mock review ${ctx.pending_review_id} approved via SMS`);
      await updateContext(phone, { state: null, pending_review_id: null });
      return TEMPLATES.approve;
    }
    await query(
      `UPDATE reply_drafts SET status = 'approved', approved_at = NOW()
       WHERE review_id = $1 AND status = 'pending'`,
      [ctx.pending_review_id]
    );
    await updateContext(phone, { state: null, pending_review_id: null });
    console.log(`\u2705 Review ${ctx.pending_review_id} approved via SMS`);
    return TEMPLATES.approve;
  }
  async handleEdit(phone, ctx) {
    if (!ctx.pending_review_id) return TEMPLATES.noPendingReview;
    await updateContext(phone, { state: "waiting_for_custom_reply" });
    return TEMPLATES.editPrompt;
  }
  async handleCustomReply(phone, ctx, customText) {
    if (!ctx.pending_review_id) {
      await updateContext(phone, { state: null });
      return TEMPLATES.noPendingReview;
    }
    if (ctx.pending_review_id.startsWith("mock-")) {
      console.log(`\u270F\uFE0F Mock review ${ctx.pending_review_id} custom reply: "${customText.slice(0, 80)}..."`);
      await updateContext(phone, { state: null, pending_review_id: null });
      return TEMPLATES.customReplyConfirm;
    }
    await query(
      `UPDATE reply_drafts 
       SET draft_text = $1, status = 'approved', approved_at = NOW(),
           metadata = jsonb_set(COALESCE(metadata, '{}'), '{custom_response}', 'true')
       WHERE review_id = $2 AND status = 'pending'`,
      [customText, ctx.pending_review_id]
    );
    await updateContext(phone, { state: null, pending_review_id: null });
    return TEMPLATES.customReplyConfirm;
  }
  async handleIgnore(phone, ctx) {
    if (!ctx.pending_review_id) return TEMPLATES.noPendingReview;
    if (!ctx.pending_review_id.startsWith("mock-")) {
      await query(
        `UPDATE reply_drafts SET status = 'rejected' WHERE review_id = $1 AND status = 'pending'`,
        [ctx.pending_review_id]
      );
    }
    console.log(`\u{1F6AB} Review ${ctx.pending_review_id} ignored via SMS`);
    await updateContext(phone, { state: null, pending_review_id: null });
    return TEMPLATES.ignore;
  }
  async handlePause(phone, ctx) {
    if (ctx.restaurant_id) {
      await query(
        `UPDATE restaurants SET monitoring_paused = true WHERE id = $1`,
        [ctx.restaurant_id]
      ).catch(() => {
      });
    }
    await updateContext(phone, { state: null });
    return TEMPLATES.pause;
  }
  async handleResume(phone, ctx) {
    if (ctx.restaurant_id) {
      await query(
        `UPDATE restaurants SET monitoring_paused = false WHERE id = $1`,
        [ctx.restaurant_id]
      ).catch(() => {
      });
    }
    await updateContext(phone, { state: null });
    return TEMPLATES.resume;
  }
  async handleStatus(phone, ctx) {
    if (!ctx.restaurant_id) {
      return `No account found for this phone number. Contact support@maitreo.com for help.${HELP_SUFFIX}`;
    }
    const restResult = await query(
      `SELECT name, COALESCE(monitoring_paused, false) as monitoring_paused FROM restaurants WHERE id = $1`,
      [ctx.restaurant_id]
    );
    if (restResult.rows.length === 0) {
      return `Account not found. Contact support@maitreo.com.${HELP_SUFFIX}`;
    }
    const rest = restResult.rows[0];
    const statusText = rest.monitoring_paused ? "\u23F8\uFE0F Paused" : "\u2705 Active";
    const reviewCount = await query(
      `SELECT COUNT(*) as count FROM reviews WHERE restaurant_id = $1`,
      [ctx.restaurant_id]
    ).catch(() => ({ rows: [{ count: "0" }] }));
    return `\u{1F4CA} ${rest.name}
Status: ${statusText}
Reviews tracked: ${reviewCount.rows[0].count}
Billing: Active${HELP_SUFFIX}`;
  }
  async handleBilling(phone, ctx) {
    if (!ctx.restaurant_id) {
      return `No account found for this phone number. Contact support@maitreo.com for help.${HELP_SUFFIX}`;
    }
    const result = await query(
      `SELECT stripe_customer_id FROM restaurants WHERE id = $1`,
      [ctx.restaurant_id]
    );
    const customerId = result.rows[0]?.stripe_customer_id;
    if (!customerId) {
      return `No billing account found. Complete signup first at https://maitreo.com/pricing${HELP_SUFFIX}`;
    }
    try {
      const portalUrl = await createPortalSession(customerId);
      return `Manage billing: ${portalUrl} (expires in 1 hour).${HELP_SUFFIX}`;
    } catch (err) {
      console.error("Failed to create portal session:", err);
      return `Unable to generate billing link. Contact support@maitreo.com for help.${HELP_SUFFIX}`;
    }
  }
  async handleCancel(phone, ctx) {
    await updateContext(phone, { state: "waiting_for_cancel_confirm" });
    return TEMPLATES.cancelPrompt;
  }
  async handleCancelConfirm(phone, ctx) {
    if (!ctx.restaurant_id) {
      await updateContext(phone, { state: null });
      return `No account found. Contact support@maitreo.com.${HELP_SUFFIX}`;
    }
    const result = await query(
      `SELECT stripe_subscription_id FROM restaurants WHERE id = $1`,
      [ctx.restaurant_id]
    );
    const subId = result.rows[0]?.stripe_subscription_id;
    if (subId) {
      try {
        await cancelSubscription(subId);
        console.log(`\u{1F6AB} Stripe subscription ${subId} canceled for restaurant ${ctx.restaurant_id}`);
      } catch (err) {
        console.error("\u{1F6A8} HIGH SEVERITY: Stripe cancellation failed for subscription", subId, err);
        await updateContext(phone, { state: null });
        return `Cancellation failed, please try again or contact support@maitreo.com.${HELP_SUFFIX}`;
      }
    }
    await query(
      `UPDATE restaurants SET
         subscription_state = 'canceled',
         monitoring_paused = true,
         updated_at = NOW()
       WHERE id = $1`,
      [ctx.restaurant_id]
    );
    await updateContext(phone, { state: null });
    console.log(`\u{1F6AB} Cancellation confirmed for phone ${phone}`);
    return `Subscription canceled. You won't be charged again.${HELP_SUFFIX}`;
  }
};
var smsService = new SmsService();

// frontend/src/jobs/reviewMonitor.ts
var POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS || "300000");
var ReviewMonitorJob = class {
  constructor() {
    this.running = false;
  }
  /**
   * Get all restaurants with their platform IDs from competitors_json
   */
  async getRestaurants() {
    const result = await query(`SELECT * FROM restaurants WHERE monitoring_paused IS NOT TRUE AND (subscription_state IN ('active', 'trialing') OR subscription_state IS NULL) ORDER BY created_at`);
    return result.rows;
  }
  /**
   * Check if review already exists
   */
  async reviewExists(platform, reviewId) {
    const result = await query(
      `SELECT COUNT(*) as count FROM reviews WHERE platform = $1 AND review_id = $2`,
      [platform, reviewId]
    );
    return parseInt(result.rows[0]?.count || "0") > 0;
  }
  /**
   * Get last review date for a restaurant+platform
   */
  async getLastReviewDate(restaurantId, platform) {
    const result = await query(
      `SELECT MAX(review_date) as max_date FROM reviews WHERE restaurant_id = $1 AND platform = $2`,
      [restaurantId, platform]
    );
    return result.rows[0]?.max_date || null;
  }
  /**
   * Process a single restaurant — fetch, store, classify, generate reply, send SMS
   */
  async processRestaurant(restaurant) {
    let newCount = 0;
    const competitors = restaurant.competitors_json || [];
    for (const comp of competitors) {
      const platform = comp.platform;
      const platformId = comp.id;
      if (!platformId) continue;
      if (platform !== "google" && platform !== "yelp") continue;
      const since = await this.getLastReviewDate(restaurant.id, platform);
      let rawReviews = [];
      try {
        if (platform === "google") {
          rawReviews = await googleReviewSource.fetchReviews(platformId, since || void 0);
        } else if (platform === "yelp") {
          rawReviews = await yelpReviewSource.fetchReviews(platformId, since || void 0);
        }
      } catch (err) {
        console.error(`  \u274C Error fetching ${platform} for ${restaurant.name}:`, err);
        continue;
      }
      for (const raw of rawReviews) {
        if (await this.reviewExists(platform, raw.id)) continue;
        const sentiment = classifySentiment(raw.rating, raw.text);
        const { review, draft } = await transaction(async (client) => {
          const insertResult = await client.query(
            `INSERT INTO reviews (
              restaurant_id, platform, review_id, author, rating, text,
              review_date, metadata, sentiment, sentiment_score
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING id`,
            [
              restaurant.id,
              platform,
              raw.id,
              raw.author,
              raw.rating,
              raw.text,
              raw.date,
              JSON.stringify(raw.metadata || {}),
              sentiment.sentiment,
              sentiment.score
            ]
          );
          const reviewId = insertResult.rows[0].id;
          const reviewResult = await client.query(`SELECT * FROM reviews WHERE id = $1`, [reviewId]);
          const review2 = reviewResult.rows[0];
          const replyOutput = await replyGenerator.generateReply({ review: review2, restaurant });
          const draftResult = await client.query(
            `INSERT INTO reply_drafts (
              review_id, draft_text, escalation_flag, escalation_reasons, status, metadata
            ) VALUES ($1, $2, $3, $4, 'pending', $5)
            RETURNING *`,
            [
              reviewId,
              replyOutput.draft_text,
              replyOutput.escalation_flag,
              JSON.stringify(replyOutput.escalation_reasons),
              JSON.stringify({ confidence_score: replyOutput.confidence_score })
            ]
          );
          return { review: review2, draft: draftResult.rows[0] };
        });
        const ownerPhone = restaurant.owner_phone;
        if (ownerPhone) {
          try {
            await smsService.sendReviewAlert(review, draft, restaurant, ownerPhone);
          } catch (err) {
            console.error(`  \u274C SMS failed for ${ownerPhone}:`, err);
            await query(
              `UPDATE reviews SET metadata = jsonb_set(COALESCE(metadata::jsonb, '{}'), '{sms_alert_failed}', 'true') WHERE id = $1`,
              [review.id]
            ).catch((retryErr) => console.error("Failed to mark SMS retry:", retryErr));
          }
        } else {
          console.log(`  \u26A0\uFE0F  No phone for ${restaurant.name}, skipping SMS`);
        }
        newCount++;
        console.log(`  \u2705 New ${raw.rating}\u2B50 ${platform} review \u2192 ${sentiment.sentiment} \u2192 draft ${draft.id}`);
      }
    }
    return newCount;
  }
  /**
   * Run one poll cycle
   */
  async runOnce() {
    console.log(`
\u{1F50D} Review monitor polling at ${(/* @__PURE__ */ new Date()).toISOString()}`);
    const restaurants = await this.getRestaurants();
    let totalNew = 0;
    for (const r of restaurants) {
      const count = await this.processRestaurant(r);
      totalNew += count;
    }
    console.log(`\u{1F4CA} Poll complete: ${totalNew} new reviews across ${restaurants.length} restaurants`);
  }
  /**
   * Start continuous polling (every 5 minutes)
   */
  async start() {
    if (this.running) return;
    this.running = true;
    console.log("\u{1F680} Review monitor started (polling every 5 min)");
    while (this.running) {
      try {
        await this.runOnce();
      } catch (err) {
        console.error("\u274C Monitor cycle error:", err);
      }
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }
  }
  stop() {
    this.running = false;
    console.log("\u23F9\uFE0F  Review monitor stopped");
  }
};
var reviewMonitor = new ReviewMonitorJob();

// frontend/src/services/tokenEncryption.ts
import crypto from "crypto";
var ALGORITHM = "aes-256-gcm";
var IV_LENGTH = 16;
function getEncryptionKey() {
  const key = process.env.TOKEN_ENCRYPTION_KEY;
  if (!key) {
    throw new Error("TOKEN_ENCRYPTION_KEY not set in environment");
  }
  if (key.length === 64) {
    return Buffer.from(key, "hex");
  }
  return crypto.createHash("sha256").update(key).digest();
}
function encryptToken(plaintext) {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted}`;
}
function decryptToken(encrypted) {
  const key = getEncryptionKey();
  const parts = encrypted.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted token format");
  }
  const iv = Buffer.from(parts[0], "hex");
  const tag = Buffer.from(parts[1], "hex");
  const ciphertext = parts[2];
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  let decrypted = decipher.update(ciphertext, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

// frontend/src/services/googleOAuth.ts
import crypto2 from "crypto";
var GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
var GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
var SCOPES = ["https://www.googleapis.com/auth/business.manage"];
var pendingStates = /* @__PURE__ */ new Map();
function getClientId() {
  const id = process.env.GOOGLE_CLIENT_ID;
  if (!id) throw new Error("GOOGLE_CLIENT_ID not set");
  return id;
}
function getClientSecret() {
  const secret = process.env.GOOGLE_CLIENT_SECRET;
  if (!secret) throw new Error("GOOGLE_CLIENT_SECRET not set");
  return secret;
}
function getRedirectUri() {
  return process.env.GOOGLE_REDIRECT_URI || "http://localhost:3000/auth/google/callback";
}
function generateAuthUrl(restaurantId) {
  const state = crypto2.randomBytes(32).toString("hex");
  pendingStates.set(state, {
    restaurantId,
    expiresAt: Date.now() + 10 * 60 * 1e3
  });
  for (const [key, val] of pendingStates) {
    if (val.expiresAt < Date.now()) pendingStates.delete(key);
  }
  const params = new URLSearchParams({
    client_id: getClientId(),
    redirect_uri: getRedirectUri(),
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    // Gets refresh token
    prompt: "consent",
    // Force consent to always get refresh token
    state
  });
  console.log(`\u{1F510} [OAuth] Generated auth URL for restaurant ${restaurantId}`);
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}
async function handleCallback(code, state) {
  const pending = pendingStates.get(state);
  if (!pending) {
    console.error("\u{1F510} [OAuth] Invalid or expired state parameter");
    return { restaurantId: "", success: false, error: "Invalid or expired state parameter" };
  }
  if (pending.expiresAt < Date.now()) {
    pendingStates.delete(state);
    console.error("\u{1F510} [OAuth] State expired");
    return { restaurantId: pending.restaurantId, success: false, error: "Authorization session expired" };
  }
  const { restaurantId } = pending;
  pendingStates.delete(state);
  try {
    const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: getClientId(),
        client_secret: getClientSecret(),
        redirect_uri: getRedirectUri(),
        grant_type: "authorization_code"
      })
    });
    const tokenData = await tokenResponse.json();
    if (!tokenResponse.ok) {
      console.error("\u{1F510} [OAuth] Token exchange failed:", tokenData);
      return { restaurantId, success: false, error: tokenData.error_description || tokenData.error || "Token exchange failed" };
    }
    const { access_token, refresh_token, expires_in } = tokenData;
    if (!access_token) {
      return { restaurantId, success: false, error: "No access token received" };
    }
    await storeTokens(restaurantId, access_token, refresh_token, expires_in, null);
    console.log(`\u2705 [OAuth] Tokens stored for restaurant ${restaurantId}`);
    try {
      const accountId = await fetchAccountId(access_token);
      await query(
        "UPDATE restaurants SET google_account_id = $1 WHERE id = $2",
        [accountId, restaurantId]
      );
      console.log(`\u2705 [OAuth] Account ID stored: ${accountId}`);
    } catch (accountErr) {
      console.warn(`\u26A0\uFE0F [OAuth] Could not fetch account ID (non-fatal): ${accountErr.message}`);
    }
    return { restaurantId, success: true };
  } catch (error) {
    console.error("\u{1F510} [OAuth] Callback error:", error);
    return { restaurantId, success: false, error: error.message };
  }
}
async function fetchAccountId(accessToken) {
  const response = await fetch("https://mybusinessaccountmanagement.googleapis.com/v1/accounts", {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Failed to fetch account ID: ${response.status} ${err}`);
  }
  const data = await response.json();
  const accounts = data.accounts || [];
  if (accounts.length === 0) {
    throw new Error("No Google Business accounts found for this user");
  }
  return accounts[0].name;
}
async function storeTokens(restaurantId, accessToken, refreshToken, expiresIn, accountId) {
  const expiresAt = new Date(Date.now() + expiresIn * 1e3);
  await query(
    `UPDATE restaurants SET
      google_access_token = $1,
      google_refresh_token = COALESCE($2, google_refresh_token),
      google_token_expires_at = $3,
      google_account_id = $4,
      updated_at = NOW()
    WHERE id = $5`,
    [
      encryptToken(accessToken),
      refreshToken ? encryptToken(refreshToken) : null,
      expiresAt.toISOString(),
      accountId,
      restaurantId
    ]
  );
}
async function getValidAccessToken(restaurantId) {
  const result = await query(
    `SELECT google_access_token, google_refresh_token, google_token_expires_at, google_account_id
     FROM restaurants WHERE id = $1`,
    [restaurantId]
  );
  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  if (!row.google_access_token || !row.google_refresh_token) {
    console.warn(`\u26A0\uFE0F [OAuth] No Google tokens for restaurant ${restaurantId}`);
    return null;
  }
  const expiresAt = new Date(row.google_token_expires_at);
  const now = /* @__PURE__ */ new Date();
  const fiveMinFromNow = new Date(now.getTime() + 5 * 60 * 1e3);
  if (expiresAt > fiveMinFromNow) {
    return decryptToken(row.google_access_token);
  }
  console.log(`\u{1F504} [OAuth] Refreshing token for restaurant ${restaurantId}`);
  try {
    const refreshToken = decryptToken(row.google_refresh_token);
    const response = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: getClientId(),
        client_secret: getClientSecret(),
        refresh_token: refreshToken,
        grant_type: "refresh_token"
      })
    });
    const data = await response.json();
    if (!response.ok) {
      console.error(`\u274C [OAuth] Token refresh failed for ${restaurantId}:`, data);
      if (data.error === "invalid_grant") {
        await query(
          `UPDATE restaurants SET google_access_token = NULL, google_refresh_token = NULL, google_token_expires_at = NULL WHERE id = $1`,
          [restaurantId]
        );
        console.error(`\u{1F6A8} [OAuth] Refresh token revoked for ${restaurantId} \u2014 tokens cleared. Owner must re-authorize.`);
      }
      return null;
    }
    await storeTokens(restaurantId, data.access_token, data.refresh_token || null, data.expires_in, row.google_account_id);
    console.log(`\u2705 [OAuth] Token refreshed for restaurant ${restaurantId}`);
    return data.access_token;
  } catch (error) {
    console.error(`\u274C [OAuth] Refresh error for ${restaurantId}:`, error);
    return null;
  }
}
async function getGoogleAccountId(restaurantId) {
  const result = await query(
    `SELECT google_account_id FROM restaurants WHERE id = $1`,
    [restaurantId]
  );
  return result.rows[0]?.google_account_id || null;
}

// frontend/src/services/googleBusinessProfile.ts
var GBP_BASE = "https://mybusiness.googleapis.com/v4";
var STAR_MAP = {
  ONE: 1,
  TWO: 2,
  THREE: 3,
  FOUR: 4,
  FIVE: 5
};
async function fetchLocations(restaurantId) {
  const accessToken = await getValidAccessToken(restaurantId);
  if (!accessToken) throw new Error("No valid Google access token");
  const accountId = await getGoogleAccountId(restaurantId);
  if (!accountId) throw new Error("No Google account ID stored");
  const response = await fetch(
    `https://mybusinessbusinessinformation.googleapis.com/v1/${accountId}/locations?readMask=name,title,storefrontAddress`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!response.ok) {
    const err = await response.text();
    console.error(`\u274C [GBP] Failed to fetch locations: ${response.status} ${err}`);
    throw new Error(`Failed to fetch locations: ${response.status}`);
  }
  const data = await response.json();
  return data.locations || [];
}
async function fetchReviews(restaurantId, locationName, pageSize = 50) {
  const accessToken = await getValidAccessToken(restaurantId);
  if (!accessToken) throw new Error("No valid Google access token");
  const accountId = await getGoogleAccountId(restaurantId);
  if (!accountId) throw new Error("No Google account ID stored");
  let fetched = 0;
  let newReviews = 0;
  let nextPageToken;
  do {
    const url = new URL(`${GBP_BASE}/${accountId}/${locationName}/reviews`);
    url.searchParams.set("pageSize", String(pageSize));
    if (nextPageToken) url.searchParams.set("pageToken", nextPageToken);
    const response = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!response.ok) {
      const err = await response.text();
      console.error(`\u274C [GBP] Fetch reviews failed: ${response.status} ${err}`);
      throw new Error(`Failed to fetch reviews: ${response.status}`);
    }
    const data = await response.json();
    const reviews = data.reviews || [];
    nextPageToken = data.nextPageToken;
    for (const review of reviews) {
      fetched++;
      const stored = await storeReview(restaurantId, review);
      if (stored) newReviews++;
    }
    console.log(`\u{1F4E5} [GBP] Fetched ${reviews.length} reviews (page), ${newReviews} new so far`);
  } while (nextPageToken);
  console.log(`\u2705 [GBP] Total: ${fetched} fetched, ${newReviews} new for restaurant ${restaurantId}`);
  return { fetched, newReviews };
}
async function storeReview(restaurantId, review) {
  const reviewId = review.name;
  const existing = await query(
    `SELECT id FROM reviews WHERE platform = 'google' AND review_id = $1`,
    [reviewId]
  );
  if (existing.rows.length > 0) return false;
  await query(
    `INSERT INTO reviews (restaurant_id, platform, review_id, author, rating, text, review_date, metadata)
     VALUES ($1, 'google', $2, $3, $4, $5, $6, $7)`,
    [
      restaurantId,
      reviewId,
      review.reviewer?.displayName || "Anonymous",
      STAR_MAP[review.starRating] || 0,
      review.comment || "",
      review.createTime,
      JSON.stringify({
        googleReviewName: review.name,
        profilePhoto: review.reviewer?.profilePhotoUrl,
        updateTime: review.updateTime,
        hasReply: !!review.reviewReply,
        existingReply: review.reviewReply?.comment
      })
    ]
  );
  return true;
}
async function postReply(restaurantId, reviewResourceName, replyText) {
  const accessToken = await getValidAccessToken(restaurantId);
  if (!accessToken) {
    return { success: false, error: "No valid Google access token. Owner must re-authorize." };
  }
  const url = `${GBP_BASE}/${reviewResourceName}/reply`;
  console.log(`\u{1F4E4} [GBP] Posting reply to ${reviewResourceName}`);
  const response = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ comment: replyText })
  });
  if (!response.ok) {
    const errText = await response.text();
    console.error(`\u274C [GBP] Reply failed ${response.status}: ${errText}`);
    if (response.status === 401) {
      return { success: false, error: "Authentication failed. Token may be expired or revoked." };
    }
    if (response.status === 403) {
      return { success: false, error: "Permission denied. Account may not have management access to this location." };
    }
    return { success: false, error: `Google API error ${response.status}: ${errText}` };
  }
  const data = await response.json();
  console.log(`\u2705 [GBP] Reply posted successfully to ${reviewResourceName}`);
  return { success: true };
}

// frontend/src/services/responsePoster.ts
var ResponsePoster = class {
  /**
   * Post an approved reply to the originating platform.
   */
  async postResponse(draft, review) {
    console.log(`\u{1F4E4} Posting response for review ${review.id} on ${review.platform}`);
    let responseText = draft.draft_text;
    const opt1Match = responseText.match(/Option 1[:\s]*(.+?)(?=Option 2|$)/is);
    if (opt1Match) responseText = opt1Match[1].trim();
    let result;
    switch (review.platform) {
      case "google":
        result = await this.postToGoogle(review, responseText);
        break;
      case "yelp":
        result = await this.postToYelp(review, responseText);
        break;
      default:
        result = { success: false, platform: review.platform, error: `Unsupported platform: ${review.platform}` };
    }
    await query(
      `UPDATE reply_drafts 
       SET status = $1, 
           metadata = jsonb_set(
             COALESCE(metadata, '{}'), 
             '{post_result}', 
             $2::jsonb
           )
       WHERE id = $3`,
      [
        result.success ? "sent" : "approved",
        // keep 'approved' if posting failed
        JSON.stringify(result),
        draft.id
      ]
    );
    if (result.success) {
      await query(
        `INSERT INTO posted_responses (
          reply_draft_id, review_id, platform, response_text, 
          external_response_id, posted_at
        ) VALUES ($1, $2, $3, $4, $5, NOW())`,
        [draft.id, review.id, review.platform, responseText, result.externalResponseId || null]
      );
    }
    return result;
  }
  /**
   * Post response to Google via Business Profile API (OAuth-authenticated).
   */
  async postToGoogle(review, text) {
    const reviewName = review.metadata?.googleReviewName;
    if (!reviewName) {
      return { success: false, platform: "google", error: "Missing Google review resource name in metadata" };
    }
    try {
      const result = await postReply(review.restaurant_id, reviewName, text);
      if (result.success) {
        console.log("\u2705 Posted to Google successfully");
        return { success: true, platform: "google", externalResponseId: reviewName };
      } else {
        return { success: false, platform: "google", error: result.error };
      }
    } catch (error) {
      console.error("\u274C Google post error:", error);
      return { success: false, platform: "google", error: error.message };
    }
  }
  /**
   * Post response to Yelp.
   * Yelp does NOT have a public API for posting review responses.
   * This is a placeholder for future browser automation or partner API integration.
   */
  async postToYelp(review, text) {
    console.warn("\u26A0\uFE0F  Yelp response posting not yet implemented (no public API)");
    return {
      success: false,
      platform: "yelp",
      error: "Yelp does not provide a public API for posting responses. Browser automation integration pending."
    };
  }
  /**
   * Process all approved drafts that haven't been posted yet.
   * Run this on a schedule (e.g., every minute).
   */
  async processApprovedDrafts() {
    const result = await query(
      `SELECT rd.*, r.platform as review_platform
       FROM reply_drafts rd
       JOIN reviews r ON r.id = rd.review_id
       WHERE rd.status = 'approved'
         AND NOT EXISTS (
           SELECT 1 FROM posted_responses pr WHERE pr.reply_draft_id = rd.id
         )
       ORDER BY rd.approved_at ASC
       LIMIT 10`
    );
    if (result.rows.length === 0) return;
    console.log(`\u{1F4E4} Processing ${result.rows.length} approved drafts...`);
    for (const draft of result.rows) {
      const reviewResult = await query(
        `SELECT * FROM reviews WHERE id = $1`,
        [draft.review_id]
      );
      if (reviewResult.rows.length === 0) continue;
      const review = reviewResult.rows[0];
      await this.postResponse(draft, review);
    }
  }
};
var responsePoster = new ResponsePoster();

// frontend/src/sms/webhookHandler.ts
import crypto3 from "crypto";
function parseFormBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", () => {
      const params = {};
      for (const pair of body.split("&")) {
        const [key, val] = pair.split("=");
        if (key) params[decodeURIComponent(key)] = decodeURIComponent(val || "");
      }
      resolve(params);
    });
    req.on("error", reject);
  });
}
function twimlResponse(res, message) {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>${escapeXml(message)}</Message>
</Response>`;
  res.writeHead(200, { "Content-Type": "text/xml" });
  res.end(xml);
}
function escapeXml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function validateTwilioSignature(req, params) {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) {
    if (process.env.NODE_ENV === "production") {
      console.error("\u274C TWILIO_AUTH_TOKEN not set in production \u2014 rejecting request");
      return false;
    }
    return true;
  }
  const signature = req.headers["x-twilio-signature"];
  if (!signature) return false;
  const protocol = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers.host || "";
  const url = `${protocol}://${host}${req.url}`;
  const sortedKeys = Object.keys(params).sort();
  let dataString = url;
  for (const key of sortedKeys) {
    dataString += key + params[key];
  }
  const expectedSignature = crypto3.createHmac("sha1", authToken).update(dataString).digest("base64");
  return crypto3.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}
async function handleSmsWebhook(req, res) {
  try {
    const params = await parseFormBody(req);
    if (process.env.NODE_ENV === "production" && !validateTwilioSignature(req, params)) {
      console.error("\u274C Invalid Twilio signature \u2014 rejecting webhook request");
      res.writeHead(403, { "Content-Type": "text/plain" });
      res.end("Forbidden: invalid signature");
      return;
    }
    const from = params.From || "";
    const body = params.Body || "";
    const messageSid = params.MessageSid || "";
    console.log(`\u{1F4E8} Incoming SMS from ${from}: "${body.slice(0, 80)}${body.length > 80 ? "..." : ""}"`);
    if (!from || !body) {
      twimlResponse(res, "Invalid message received.");
      return;
    }
    if (messageSid) {
      const existing = await query(
        `SELECT id FROM sms_logs WHERE twilio_sid = $1 AND direction = 'inbound' LIMIT 1`,
        [messageSid]
      );
      if (existing.rows.length > 0) {
        console.log(`\u26A0\uFE0F Duplicate MessageSid ${messageSid} \u2014 skipping`);
        res.writeHead(200, { "Content-Type": "text/xml" });
        res.end("<Response></Response>");
        return;
      }
    }
    const reply = await smsService.handleIncoming(from, body, messageSid);
    twimlResponse(res, reply);
  } catch (error) {
    console.error("\u274C SMS webhook error:", error);
    twimlResponse(res, "Something went wrong. Please try again.");
  }
}
async function handleStatusCallback(req, res) {
  try {
    const params = await parseFormBody(req);
    const messageSid = params.MessageSid || "";
    const messageStatus = params.MessageStatus || "";
    if (messageSid && messageStatus) {
      await query(
        `UPDATE sms_logs SET status = $1 WHERE twilio_sid = $2`,
        [messageStatus, messageSid]
      ).catch((err) => console.error("Failed to update SMS status:", err));
      console.log(`\u{1F4F1} SMS ${messageSid} status: ${messageStatus}`);
    }
    res.writeHead(200, { "Content-Type": "text/xml" });
    res.end("<Response></Response>");
  } catch (error) {
    console.error("\u274C Status callback error:", error);
    res.writeHead(200, { "Content-Type": "text/xml" });
    res.end("<Response></Response>");
  }
}

// frontend/src/routes/webhooks.ts
var WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "";
function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}
async function handleStripeWebhook(req, res) {
  const rawBody = await getRawBody(req);
  let event;
  if (WEBHOOK_SECRET) {
    const sig = req.headers["stripe-signature"];
    try {
      event = stripe.webhooks.constructEvent(rawBody, sig, WEBHOOK_SECRET);
    } catch (err) {
      console.error("\u26A0\uFE0F Stripe webhook signature verification failed:", err.message);
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid signature" }));
      return;
    }
  } else {
    event = JSON.parse(rawBody.toString());
    console.warn("\u26A0\uFE0F STRIPE_WEBHOOK_SECRET not set \u2014 skipping signature verification");
  }
  console.log(`\u{1F514} Stripe event: ${event.type} (${event.id})`);
  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(event.data.object);
        break;
      case "customer.subscription.created":
        await handleSubscriptionCreated(event.data.object);
        break;
      case "customer.subscription.updated":
        await handleSubscriptionUpdated(event.data.object);
        break;
      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(event.data.object);
        break;
      case "invoice.payment_succeeded":
        await handlePaymentSucceeded(event.data.object);
        break;
      case "invoice.payment_failed":
        await handlePaymentFailed(event.data.object);
        break;
      default:
        console.log(`  \u21B3 Unhandled event type: ${event.type}`);
    }
  } catch (err) {
    console.error(`\u274C Error processing ${event.type}:`, err);
  }
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ received: true }));
}
async function handleCheckoutCompleted(session) {
  const restaurantId = session.metadata?.restaurant_id;
  if (!restaurantId) {
    console.warn("\u26A0\uFE0F checkout.session.completed missing restaurant_id");
    return;
  }
  const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
  const subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
  if (customerId) {
    await query(
      `UPDATE restaurants SET stripe_customer_id = $1 WHERE id = $2`,
      [customerId, restaurantId]
    );
  }
  if (subscriptionId) {
    const sub = await stripe.subscriptions.retrieve(subscriptionId);
    if (!sub.metadata?.restaurant_id) {
      await stripe.subscriptions.update(subscriptionId, {
        metadata: { restaurant_id: restaurantId }
      });
      sub.metadata.restaurant_id = restaurantId;
    }
    await syncSubscriptionState(sub);
  }
  console.log(`\u{1F389} Checkout completed: restaurant=${restaurantId} customer=${customerId}`);
}
async function handleSubscriptionCreated(sub) {
  await syncSubscriptionState(sub);
}
async function handleSubscriptionUpdated(sub) {
  await syncSubscriptionState(sub);
}
async function handleSubscriptionDeleted(sub) {
  const restaurantId = sub.metadata?.restaurant_id;
  if (!restaurantId) return;
  await query(
    `UPDATE restaurants SET
       subscription_state = 'canceled',
       monitoring_paused = true,
       updated_at = NOW()
     WHERE id = $1`,
    [restaurantId]
  );
  console.log(`\u{1F6AB} Subscription canceled for restaurant ${restaurantId}`);
}
async function handlePaymentSucceeded(invoice) {
  const sub = invoice.subscription;
  const subscriptionId = typeof sub === "string" ? sub : sub?.id;
  if (!subscriptionId) return;
  const restaurant = await findRestaurantBySubscriptionId(subscriptionId);
  if (!restaurant) return;
  if (restaurant.subscription_state === "past_due") {
    await query(
      `UPDATE restaurants SET
         subscription_state = 'active',
         monitoring_paused = false,
         updated_at = NOW()
       WHERE id = $1`,
      [restaurant.id]
    );
    console.log(`\u2705 Payment succeeded \u2014 restaurant ${restaurant.id} resumed`);
  }
}
async function handlePaymentFailed(invoice) {
  const sub = invoice.subscription;
  const subscriptionId = typeof sub === "string" ? sub : sub?.id;
  if (!subscriptionId) return;
  const restaurant = await findRestaurantBySubscriptionId(subscriptionId);
  if (!restaurant) return;
  await query(
    `UPDATE restaurants SET
       subscription_state = 'past_due',
       monitoring_paused = true,
       updated_at = NOW()
     WHERE id = $1`,
    [restaurant.id]
  );
  console.log(`\u26A0\uFE0F Payment failed \u2014 restaurant ${restaurant.id} set to past_due`);
  if (restaurant.owner_phone) {
    try {
      await smsService.sendSms(
        restaurant.owner_phone,
        `\u26A0\uFE0F Your Maitreo payment failed. Review monitoring is paused. Please update your payment method: text BILLING to get a link.
Reply HELP anytime.`
      );
    } catch (err) {
      console.error("Failed to send payment failure SMS:", err);
    }
  }
}

// frontend/src/services/onboarding.ts
import { Resend as Resend2 } from "resend";
import dotenv9 from "dotenv";
dotenv9.config();
var _resend2 = null;
function getResend2() {
  if (!_resend2) {
    const key = process.env.RESEND_API_KEY;
    if (!key) throw new Error("RESEND_API_KEY not set \u2014 cannot send emails");
    _resend2 = new Resend2(key);
  }
  return _resend2;
}
var FROM_EMAIL2 = process.env.FROM_EMAIL || "noreply@maitreo.com";
function isValidPhone(phone) {
  const digits = phone.replace(/\D/g, "");
  return digits.length === 10 || digits.length === 11 && digits[0] === "1";
}
function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}
function normalizePhone(phone) {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) {
    return `+1${digits}`;
  } else if (digits.length === 11 && digits[0] === "1") {
    return `+${digits}`;
  }
  return phone;
}
async function processOnboarding(data) {
  try {
    if (!data.name || data.name.trim().length === 0) {
      return {
        success: false,
        message: "Restaurant name is required",
        error: "VALIDATION_ERROR"
      };
    }
    if (!data.address || data.address.trim().length === 0) {
      return {
        success: false,
        message: "Address is required",
        error: "VALIDATION_ERROR"
      };
    }
    if (!isValidPhone(data.phone)) {
      return {
        success: false,
        message: "Please enter a valid phone number",
        error: "VALIDATION_ERROR"
      };
    }
    if (!isValidEmail(data.email)) {
      return {
        success: false,
        message: "Please enter a valid email address",
        error: "VALIDATION_ERROR"
      };
    }
    const existingCheck = await client_default.query(
      "SELECT id FROM restaurants WHERE owner_email = $1",
      [data.email.toLowerCase().trim()]
    );
    if (existingCheck.rows.length > 0) {
      return {
        success: false,
        message: "An account with this email already exists",
        error: "DUPLICATE_EMAIL"
      };
    }
    const normalizedPhone = normalizePhone(data.phone);
    const result = await client_default.query(
      `INSERT INTO restaurants (name, location, owner_phone, owner_email, tier, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       RETURNING id, name, owner_email`,
      [
        data.name.trim(),
        data.address.trim(),
        normalizedPhone,
        data.email.toLowerCase().trim(),
        "review_drafts"
        // Default tier (free trial)
      ]
    );
    const restaurant = result.rows[0];
    try {
      await getResend2().emails.send({
        from: FROM_EMAIL2,
        to: restaurant.owner_email,
        subject: "Welcome to Maitreo! \u{1F389}",
        html: generateWelcomeEmail(restaurant.name)
      });
    } catch (emailError) {
      console.error("Failed to send welcome email:", emailError);
    }
    return {
      success: true,
      message: "Welcome to Maitreo! Check your email for next steps.",
      restaurantId: restaurant.id
    };
  } catch (error) {
    console.error("Onboarding error:", error);
    return {
      success: false,
      message: "An error occurred during sign-up. Please try again.",
      error: error.message
    };
  }
}
function generateWelcomeEmail(restaurantName) {
  const baseUrl = process.env.BASE_URL || "https://maitreo.com";
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to Maitreo</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f8f9fa;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8f9fa; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="padding: 40px 40px 20px; text-align: center; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 8px 8px 0 0;">
              <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 600;">
                Welcome to Maitreo! \u{1F389}
              </h1>
            </td>
          </tr>
          
          <!-- Body -->
          <tr>
            <td style="padding: 40px;">
              <p style="color: #333; font-size: 16px; line-height: 1.6; margin: 0 0 20px;">
                Hi ${restaurantName} team,
              </p>
              
              <p style="color: #333; font-size: 16px; line-height: 1.6; margin: 0 0 20px;">
                Thanks for signing up! We're excited to help you manage your online reputation and never miss another review.
              </p>
              
              <p style="color: #333; font-size: 16px; line-height: 1.6; margin: 0 0 30px;">
                <strong>Next Steps:</strong>
              </p>
              
              <ol style="color: #333; font-size: 16px; line-height: 1.8; margin: 0 0 30px; padding-left: 20px;">
                <li>We'll reach out within 24 hours to connect your Google Business Profile</li>
                <li>Once connected, you'll start receiving review drafts via SMS and email</li>
                <li>Simply approve or edit drafts\u2014we'll post them for you</li>
              </ol>
              
              <div style="background-color: #f8f9fa; border-left: 4px solid #667eea; padding: 20px; margin: 0 0 30px;">
                <p style="color: #333; font-size: 14px; line-height: 1.6; margin: 0;">
                  <strong>\u{1F4A1} Quick Tip:</strong> Your 7-day free trial starts now. No credit card required until you're ready to continue.
                </p>
              </div>
              
              <p style="color: #333; font-size: 16px; line-height: 1.6; margin: 0 0 20px;">
                Questions? Just reply to this email\u2014we're here to help!
              </p>
              
              <p style="color: #333; font-size: 16px; line-height: 1.6; margin: 0;">
                \u2014 The Maitreo Team
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 30px 40px; background-color: #f8f9fa; border-radius: 0 0 8px 8px; text-align: center; border-top: 1px solid #e9ecef;">
              <p style="color: #6c757d; font-size: 14px; margin: 0 0 10px;">
                <a href="${baseUrl}" style="color: #667eea; text-decoration: none;">maitreo.com</a>
              </p>
              <p style="color: #6c757d; font-size: 12px; margin: 0;">
                You're receiving this because you signed up for Maitreo.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

// frontend/src/services/otpService.ts
var otpStore = /* @__PURE__ */ new Map();
var OTP_EXPIRY_MS = 10 * 60 * 1e3;
var MAX_ATTEMPTS = 5;
function generateCode() {
  return Math.floor(1e5 + Math.random() * 9e5).toString();
}
async function sendOtp(restaurantId, phone) {
  const code = generateCode();
  const key = `${restaurantId}:${phone}`;
  otpStore.set(key, {
    code,
    expires: Date.now() + OTP_EXPIRY_MS,
    attempts: 0
  });
  try {
    await twilioClient.sendSms(phone, `Your Maitreo verification code is: ${code}`);
    return { success: true, message: "Verification code sent" };
  } catch (err) {
    console.error("OTP send failed:", err);
    return { success: false, message: "Failed to send verification code. Please try again." };
  }
}
async function verifyOtp(restaurantId, code) {
  let matchKey = null;
  for (const [key, val] of otpStore.entries()) {
    if (key.startsWith(`${restaurantId}:`)) {
      matchKey = key;
      break;
    }
  }
  if (!matchKey) {
    return { success: false, message: "No verification code found. Please request a new one." };
  }
  const entry = otpStore.get(matchKey);
  if (Date.now() > entry.expires) {
    otpStore.delete(matchKey);
    return { success: false, message: "Code expired. Please request a new one." };
  }
  if (entry.attempts >= MAX_ATTEMPTS) {
    otpStore.delete(matchKey);
    return { success: false, message: "Too many attempts. Please request a new code." };
  }
  entry.attempts++;
  if (entry.code !== code) {
    return { success: false, message: "Invalid code. Please try again." };
  }
  otpStore.delete(matchKey);
  const phone = matchKey.split(":")[1];
  try {
    await client_default.query(
      "UPDATE restaurants SET phone_verified = true WHERE id = $1",
      [restaurantId]
    );
  } catch (err) {
    console.error("Failed to update phone_verified:", err);
  }
  return { success: true, message: "Phone verified!" };
}

// frontend/src/index.ts
var __filename = fileURLToPath(import.meta.url);
var __dirname = path.dirname(__filename);
var PUBLIC_DIR = path.join(__dirname, "..", "public");
var MIME_TYPES = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2"
};
dotenv10.config();
var PORT = process.env.PORT || 3e3;
var rateLimitMap = /* @__PURE__ */ new Map();
var RATE_LIMIT = 10;
var RATE_WINDOW_MS = 6e4;
function isRateLimited(ip) {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now >= entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }
  entry.count++;
  return entry.count > RATE_LIMIT;
}
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitMap) {
    if (now >= entry.resetAt) rateLimitMap.delete(ip);
  }
}, 5 * 6e4);
function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") return forwarded.split(",")[0].trim();
  return req.socket.remoteAddress || "unknown";
}
var server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host}`);
  if (url.pathname === "/ping") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, ts: (/* @__PURE__ */ new Date()).toISOString() }));
    return;
  }
  if (url.pathname === "/health") {
    try {
      await client_default.query("SELECT 1");
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        status: "healthy",
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        database: "connected"
      }));
    } catch (error) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        status: "unhealthy",
        error: "Database connection failed"
      }));
    }
    return;
  }
  const rateLimitedPaths = ["/onboarding", "/onboarding/register", "/onboarding/otp/send", "/onboarding/otp/verify", "/api/checkout"];
  if (rateLimitedPaths.includes(url.pathname) && req.method === "POST") {
    const clientIp = getClientIp(req);
    if (isRateLimited(clientIp)) {
      res.writeHead(429, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Too many requests. Please try again later." }));
      return;
    }
  }
  if (url.pathname.startsWith("/jobs/") && req.method === "POST") {
    const apiSecret = process.env.API_SECRET;
    if (apiSecret) {
      const authHeader = req.headers["authorization"] || "";
      if (authHeader !== `Bearer ${apiSecret}`) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Unauthorized" }));
        return;
      }
    }
  }
  if (url.pathname === "/onboarding" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", async () => {
      try {
        let data;
        const contentType = req.headers["content-type"] || "";
        if (contentType.includes("application/json")) {
          data = JSON.parse(body);
        } else if (contentType.includes("application/x-www-form-urlencoded")) {
          const params = new URLSearchParams(body);
          data = {
            name: params.get("name"),
            address: params.get("address"),
            phone: params.get("phone"),
            email: params.get("email")
          };
        } else {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({
            success: false,
            message: "Invalid content type"
          }));
          return;
        }
        const result = await processOnboarding(data);
        res.writeHead(result.success ? 200 : 400, {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        });
        res.end(JSON.stringify(result));
      } catch (error) {
        console.error("Onboarding endpoint error:", error);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          success: false,
          message: "Server error",
          error: error.message
        }));
      }
    });
    return;
  }
  if (url.pathname.startsWith("/onboarding") && req.method === "OPTIONS") {
    res.writeHead(200, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    });
    res.end();
    return;
  }
  const CORS_HEADERS = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*"
  };
  function readBody(req2) {
    return new Promise((resolve, reject) => {
      let body = "";
      req2.on("data", (chunk) => {
        body += chunk.toString();
      });
      req2.on("end", () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          reject(e);
        }
      });
      req2.on("error", reject);
    });
  }
  if (url.pathname === "/onboarding/register" && req.method === "POST") {
    try {
      const data = await readBody(req);
      const result = await processOnboarding(data);
      res.writeHead(result.success ? 200 : 400, CORS_HEADERS);
      res.end(JSON.stringify(result));
    } catch (error) {
      res.writeHead(500, CORS_HEADERS);
      res.end(JSON.stringify({ success: false, message: "Server error" }));
    }
    return;
  }
  if (url.pathname === "/onboarding/otp/send" && req.method === "POST") {
    try {
      const { restaurantId, phone } = await readBody(req);
      const digits = phone.replace(/\D/g, "");
      const e164 = digits.length === 10 ? `+1${digits}` : digits.length === 11 && digits[0] === "1" ? `+${digits}` : phone;
      const result = await sendOtp(restaurantId, e164);
      res.writeHead(result.success ? 200 : 400, CORS_HEADERS);
      res.end(JSON.stringify(result));
    } catch (error) {
      res.writeHead(500, CORS_HEADERS);
      res.end(JSON.stringify({ success: false, message: "Failed to send code" }));
    }
    return;
  }
  if (url.pathname === "/onboarding/otp/verify" && req.method === "POST") {
    try {
      const { restaurantId, code } = await readBody(req);
      const result = await verifyOtp(restaurantId, code);
      res.writeHead(result.success ? 200 : 400, CORS_HEADERS);
      res.end(JSON.stringify(result));
    } catch (error) {
      res.writeHead(500, CORS_HEADERS);
      res.end(JSON.stringify({ success: false, message: "Verification failed" }));
    }
    return;
  }
  if (url.pathname === "/onboarding/stripe/create-session" && req.method === "POST") {
    try {
      const { restaurantId } = await readBody(req);
      const restaurant = await client_default.query("SELECT owner_email FROM restaurants WHERE id = $1", [restaurantId]);
      const email = restaurant.rows[0]?.owner_email;
      const baseUrl = process.env.LANDING_URL || "https://maitreo.com";
      try {
        const session = await createCheckoutSession({
          restaurantId,
          customerEmail: email,
          successUrl: `${baseUrl}/onboarding.html?step=4&rid=${restaurantId}`,
          cancelUrl: `${baseUrl}/onboarding.html?step=3&rid=${restaurantId}`
        });
        res.writeHead(200, CORS_HEADERS);
        res.end(JSON.stringify({ url: session.url }));
      } catch (stripeErr) {
        console.warn("Stripe not available, stubbing checkout:", stripeErr.message);
        res.writeHead(200, CORS_HEADERS);
        res.end(JSON.stringify({ stub: true, message: "Stripe not configured yet \u2014 skipping to next step" }));
      }
    } catch (error) {
      res.writeHead(500, CORS_HEADERS);
      res.end(JSON.stringify({ success: false, message: "Could not create checkout session" }));
    }
    return;
  }
  if (url.pathname === "/onboarding/complete" && req.method === "POST") {
    try {
      const { restaurantId } = await readBody(req);
      const result = await client_default.query("SELECT owner_phone, name FROM restaurants WHERE id = $1", [restaurantId]);
      const restaurant = result.rows[0];
      if (restaurant?.owner_phone) {
        try {
          await twilioClient.sendSms(
            restaurant.owner_phone,
            `Welcome to Maitreo! Your reviews are now being monitored 24/7. Reply HELP for commands.`
          );
        } catch (smsErr) {
          console.error("Welcome SMS failed:", smsErr);
        }
      }
      try {
        await client_default.query("UPDATE restaurants SET onboarding_complete = true WHERE id = $1", [restaurantId]);
      } catch (dbErr) {
        console.error("Failed to mark onboarding complete:", dbErr);
      }
      reviewMonitor.runOnce().catch(console.error);
      res.writeHead(200, CORS_HEADERS);
      res.end(JSON.stringify({ success: true, message: "Onboarding complete!" }));
    } catch (error) {
      res.writeHead(500, CORS_HEADERS);
      res.end(JSON.stringify({ success: false, message: "Error completing onboarding" }));
    }
    return;
  }
  if ((url.pathname === "/webhooks/twilio/inbound" || url.pathname === "/sms/webhook") && req.method === "POST") {
    await handleSmsWebhook(req, res);
    return;
  }
  if (url.pathname === "/webhooks/twilio/status" && req.method === "POST") {
    await handleStatusCallback(req, res);
    return;
  }
  if (url.pathname === "/webhooks/stripe" && req.method === "POST") {
    await handleStripeWebhook(req, res);
    return;
  }
  if (url.pathname === "/api/checkout" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", async () => {
      try {
        const { restaurantId, email } = JSON.parse(body);
        if (!restaurantId) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Missing restaurantId" }));
          return;
        }
        const session = await createCheckoutSession({
          restaurantId,
          customerEmail: email
        });
        res.writeHead(200, {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        });
        res.end(JSON.stringify({ url: session.url, sessionId: session.id }));
      } catch (err) {
        console.error("Checkout session error:", err);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }
  if (url.pathname === "/api/checkout" && req.method === "OPTIONS") {
    res.writeHead(200, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    });
    res.end();
    return;
  }
  if (url.pathname === "/sms/test/mock-alert" && req.method === "POST") {
    if (process.env.NODE_ENV === "production") {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Not found" }));
      return;
    }
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", async () => {
      try {
        const { phone, restaurantId } = JSON.parse(body);
        if (!phone) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Missing phone" }));
          return;
        }
        await smsService.sendMockReviewAlert(phone, restaurantId);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true, message: "Mock review alert sent" }));
      } catch (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }
  if (url.pathname === "/jobs/reviews/poll" && req.method === "POST") {
    res.writeHead(202, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "accepted", message: "Review poll started" }));
    reviewMonitor.runOnce().catch(console.error);
    return;
  }
  if (url.pathname === "/jobs/responses/post" && req.method === "POST") {
    res.writeHead(202, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "accepted", message: "Response posting started" }));
    responsePoster.processApprovedDrafts().catch(console.error);
    return;
  }
  if (url.pathname === "/jobs/ingestion/run" && req.method === "POST") {
    try {
      res.writeHead(202, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        status: "accepted",
        message: "Ingestion job started"
      }));
      ingestionJob.run().catch(console.error);
    } catch (error) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: error.message }));
    }
    return;
  }
  if (url.pathname === "/jobs/newsletter/run" && req.method === "POST") {
    try {
      res.writeHead(202, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        status: "accepted",
        message: "Newsletter job started"
      }));
      newsletterJob.run().catch(console.error);
    } catch (error) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: error.message }));
    }
    return;
  }
  if (url.pathname === "/auth/google/start" && req.method === "GET") {
    const restaurantId = url.searchParams.get("restaurant_id");
    const returnUrl = url.searchParams.get("return_url");
    if (!restaurantId) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Missing restaurant_id parameter" }));
      return;
    }
    if (returnUrl) {
      await client_default.query(
        `INSERT INTO oauth_states (restaurant_id, return_url, expires_at)
         VALUES ($1, $2, NOW() + INTERVAL '10 minutes')
         ON CONFLICT (restaurant_id) DO UPDATE SET return_url = $2, expires_at = NOW() + INTERVAL '10 minutes'`,
        [restaurantId, returnUrl]
      ).catch((err) => console.warn("Failed to store OAuth return URL:", err));
    }
    try {
      const authUrl = generateAuthUrl(restaurantId);
      res.writeHead(302, { Location: authUrl });
      res.end();
    } catch (error) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: error.message }));
    }
    return;
  }
  if (url.pathname === "/auth/google/callback" && req.method === "GET") {
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const error = url.searchParams.get("error");
    if (error) {
      res.writeHead(400, { "Content-Type": "text/html" });
      res.end(`<h1>Authorization Denied</h1><p>${error}</p><p>You can close this window.</p>`);
      return;
    }
    if (!code || !state) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Missing code or state parameter" }));
      return;
    }
    try {
      const result = await handleCallback(code, state);
      if (result.success) {
        const rid = result.restaurantId;
        let returnUrl = null;
        if (rid) {
          const oauthResult = await client_default.query(
            `DELETE FROM oauth_states WHERE restaurant_id = $1 AND expires_at > NOW() RETURNING return_url`,
            [rid]
          ).catch(() => ({ rows: [] }));
          returnUrl = oauthResult.rows[0]?.return_url || null;
        }
        if (returnUrl) {
          res.writeHead(302, { Location: returnUrl });
          res.end();
          return;
        }
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(`<h1>\u2705 Google Connected!</h1><p>Your Google Business Profile is now linked to Maitreo.</p><p>You can close this window.</p>`);
      } else {
        res.writeHead(400, { "Content-Type": "text/html" });
        res.end(`<h1>\u274C Connection Failed</h1><p>${result.error}</p><p>Please try again.</p>`);
      }
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }
  if (url.pathname === "/api/reviews/fetch" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", async () => {
      try {
        const { restaurantId, locationName } = JSON.parse(body);
        if (!restaurantId || !locationName) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Missing restaurantId or locationName" }));
          return;
        }
        const result = await fetchReviews(restaurantId, locationName);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }
  if (url.pathname === "/api/locations" && req.method === "GET") {
    const restaurantId = url.searchParams.get("restaurant_id");
    if (!restaurantId) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Missing restaurant_id" }));
      return;
    }
    try {
      const locations = await fetchLocations(restaurantId);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ locations }));
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }
  const safePath = path.normalize(url.pathname).replace(/^(\.\.[\/\\])+/, "");
  const filePath = path.join(PUBLIC_DIR, safePath === "/" ? "index.html" : safePath);
  if (filePath.startsWith(PUBLIC_DIR)) {
    try {
      const content = fs.readFileSync(filePath);
      const ext = path.extname(filePath);
      res.writeHead(200, { "Content-Type": MIME_TYPES[ext] || "application/octet-stream" });
      res.end(content);
      return;
    } catch {
    }
  }
  if (req.method === "GET") {
    try {
      const landing = fs.readFileSync(path.join(PUBLIC_DIR, "index.html"));
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(landing);
      return;
    } catch {
    }
  }
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
});
server.listen(PORT, () => {
  console.log("\u{1F680} Restaurant SaaS Backend Started");
  console.log(`   Port: ${PORT}`);
  console.log(`   Environment: ${process.env.NODE_ENV || "development"}`);
  console.log(`
\u{1F4CB} Available endpoints:`);
  console.log(`   GET  /health                  - Health check`);
  console.log(`   POST /onboarding              - New restaurant sign-up`);
  console.log(`   POST /webhooks/twilio/inbound  - Twilio incoming SMS webhook`);
  console.log(`   POST /webhooks/twilio/status   - Twilio delivery status callback`);
  console.log(`   POST /sms/test/mock-alert      - Send mock review alert (testing)`);
  console.log(`   POST /jobs/reviews/poll       - Trigger review poll`);
  console.log(`   POST /jobs/responses/post     - Post approved responses`);
  console.log(`   POST /jobs/ingestion/run      - Trigger ingestion job`);
  console.log(`   POST /jobs/newsletter/run     - Trigger newsletter job`);
  console.log(`   GET  /auth/google/start       - Start Google OAuth flow`);
  console.log(`   GET  /auth/google/callback    - Google OAuth callback`);
  console.log(`   GET  /api/locations           - List Google Business locations`);
  console.log(`   POST /api/reviews/fetch       - Fetch reviews from GBP API`);
  console.log(`
\u{1F4A1} Scheduled jobs should run via cron (see README.md)`);
  if (process.env.ENABLE_REVIEW_MONITOR !== "false") {
    reviewMonitor.start().catch(console.error);
  }
  if (process.env.ENABLE_RESPONSE_POSTER !== "false") {
    setInterval(() => {
      responsePoster.processApprovedDrafts().catch(console.error);
    }, 6e4);
  }
});
process.on("SIGTERM", async () => {
  console.log("SIGTERM received, shutting down gracefully...");
  server.close(async () => {
    await client_default.end();
    process.exit(0);
  });
});
