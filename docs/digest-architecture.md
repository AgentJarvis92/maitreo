# Weekly Digest System - Architecture Design

## Overview

The Weekly Digest system sends restaurants a comprehensive review summary every Sunday morning at 8:00 AM local time. It's their only analytics view in V1 (no dashboard), so it must be reliable, insightful, and actionable.

---

## System Components

### 1. Data Layer

**Database Queries:**
```sql
-- Get all reviews for restaurant in past 7 days
SELECT * FROM reviews 
WHERE restaurant_id = ? 
  AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
  AND created_at < NOW()
ORDER BY created_at DESC;

-- Get previous week's stats for comparison
SELECT 
  COUNT(*) as prev_count,
  AVG(rating) as prev_avg_rating
FROM reviews
WHERE restaurant_id = ?
  AND created_at >= DATE_SUB(NOW(), INTERVAL 14 DAY)
  AND created_at < DATE_SUB(NOW(), INTERVAL 7 DAY);

-- Get pending review count
SELECT COUNT(*) FROM reviews
WHERE restaurant_id = ?
  AND replied_at IS NULL;
```

**Data Structure:**
```javascript
{
  restaurant_id: string,
  restaurant_name: string,
  owner_first_name: string,
  owner_email: string,
  owner_phone: string,
  timezone: string, // e.g., "America/New_York"
  
  current_week: {
    review_count: number,
    avg_rating: number,
    reviews: [
      {
        id: string,
        rating: number,
        text: string,
        customer_name: string,
        created_at: timestamp
      }
    ]
  },
  
  previous_week: {
    review_count: number,
    avg_rating: number
  },
  
  pending_reviews_count: number
}
```

---

### 2. AI Theme Extraction Engine

**Model:** GPT-4o-mini (cost-effective, sufficient for this task)

**Processing Pipeline:**
1. Aggregate all review texts from the week
2. Single API call with structured prompts (see `digest-prompts.md`)
3. Parse JSON response with themes + insight
4. Fallback handling if AI fails

**API Call Structure:**
```javascript
const extractThemes = async (reviews) => {
  const prompt = buildThemeExtractionPrompt(reviews);
  
  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: prompt }
    ],
    response_format: { type: 'json_object' },
    temperature: 0.7,
    max_tokens: 500
  });
  
  return JSON.parse(response.choices[0].message.content);
};
```

**Expected Response Format:**
```json
{
  "praise_themes": [
    "Authentic New York style pizza",
    "Friendly and attentive staff",
    "Great atmosphere for families"
  ],
  "complaint_themes": [
    "Long wait times during dinner rush",
    "Limited parking availability"
  ],
  "operational_insight": "Your ratings are up 0.3 stars from last week! Customers love your pizza quality, but several mentioned slow service during peak hours. Consider adding another person to the line on Fri/Sat nights."
}
```

**Cost Estimation:**
- Average input: ~1500 tokens (7 reviews × ~200 tokens + prompt)
- Average output: ~200 tokens
- Cost per digest: ~$0.001 (GPT-4o-mini pricing)
- Cost for 100 restaurants/week: ~$0.10

---

### 3. Digest Generation Pipeline

**Cron Job:** Every Sunday at 8:00 AM (runs per restaurant's timezone)

**Flow:**
```
1. Query all active restaurants
2. For each restaurant (parallel processing):
   a. Fetch review data (current + previous week)
   b. If no reviews this week → send empty state digest
   c. Extract themes with AI
   d. Calculate stats
   e. Render email template
   f. Render SMS template
   g. Send email (Resend)
   h. Send SMS (Twilio)
   i. Log delivery status
3. Handle failures gracefully (retry + alert)
```

**Pseudocode:**
```javascript
// Main cron handler
const sendWeeklyDigests = async () => {
  const restaurants = await getActiveRestaurants();
  
  // Group by timezone for scheduled sending
  const byTimezone = groupBy(restaurants, 'timezone');
  
  for (const [timezone, restaurants] of Object.entries(byTimezone)) {
    const sendTime = getSundayAt8AM(timezone);
    
    // Schedule for each timezone
    schedule(sendTime, async () => {
      await Promise.allSettled(
        restaurants.map(r => generateAndSendDigest(r))
      );
    });
  }
};

// Generate and send for single restaurant
const generateAndSendDigest = async (restaurant) => {
  try {
    // 1. Fetch data
    const data = await fetchDigestData(restaurant.id);
    
    // 2. Handle edge cases
    if (data.current_week.review_count === 0) {
      return await sendEmptyStateDigest(restaurant, data);
    }
    
    // 3. Extract themes with AI
    const aiAnalysis = await extractThemes(data.current_week.reviews);
    
    // 4. Prepare template variables
    const templateVars = {
      restaurant_name: restaurant.name,
      owner_first_name: restaurant.owner_first_name,
      date_range: formatDateRange(getLastWeek()),
      review_count: data.current_week.review_count,
      avg_rating: data.current_week.avg_rating.toFixed(1),
      pending_count: data.pending_reviews_count,
      has_reviews: true,
      has_praise: aiAnalysis.praise_themes.length > 0,
      has_complaints: aiAnalysis.complaint_themes.length > 0,
      has_insight: !!aiAnalysis.operational_insight,
      praise_themes: aiAnalysis.praise_themes,
      complaint_themes: aiAnalysis.complaint_themes,
      operational_insight: aiAnalysis.operational_insight,
      has_pending_reviews: data.pending_reviews_count > 0,
      reply_link: `${process.env.BASE_URL}/reply-next/${restaurant.id}`,
      billing_link: `${process.env.BASE_URL}/billing`,
      support_link: `${process.env.BASE_URL}/support`,
      unsubscribe_link: `${process.env.BASE_URL}/unsubscribe/${restaurant.id}`,
      current_year: new Date().getFullYear()
    };
    
    // 5. Render email
    const emailHtml = renderTemplate(EMAIL_TEMPLATE, templateVars);
    
    // 6. Send email
    await sendEmail({
      to: restaurant.owner_email,
      from: 'digest@maitreo.com',
      subject: `Weekly Digest - ${restaurant.name} (${formatDateRange(getLastWeek())})`,
      html: emailHtml
    });
    
    // 7. Send SMS
    const smsText = renderSMSTemplate(templateVars);
    await sendSMS({
      to: restaurant.owner_phone,
      body: smsText
    });
    
    // 8. Log success
    await logDigestDelivery({
      restaurant_id: restaurant.id,
      sent_at: new Date(),
      review_count: data.current_week.review_count,
      email_sent: true,
      sms_sent: true
    });
    
  } catch (error) {
    // Log error and retry logic
    await logDigestError({
      restaurant_id: restaurant.id,
      error: error.message,
      stack: error.stack
    });
    
    // Retry once after 5 minutes
    setTimeout(() => generateAndSendDigest(restaurant), 5 * 60 * 1000);
  }
};
```

---

### 4. Email Delivery (Resend)

**Service:** Resend (simple, reliable, good deliverability)

**Configuration:**
```javascript
const resend = new Resend(process.env.RESEND_API_KEY);

const sendEmail = async ({ to, from, subject, html }) => {
  const { data, error } = await resend.emails.send({
    from: from,
    to: to,
    subject: subject,
    html: html,
    tags: [
      { name: 'type', value: 'weekly-digest' }
    ]
  });
  
  if (error) {
    throw new Error(`Email failed: ${error.message}`);
  }
  
  return data;
};
```

**Domain Setup:**
- Sending domain: `digest@maitreo.com`
- SPF, DKIM, DMARC configured in Resend dashboard

---

### 5. SMS Delivery (Twilio)

**Service:** Twilio

**SMS Template:**
```javascript
const renderSMSTemplate = (vars) => {
  if (vars.review_count === 0) {
    return `No reviews this week. Keep up the great work! Check your email for details. Reply HELP anytime.`;
  }
  
  return `${vars.review_count} review${vars.review_count > 1 ? 's' : ''} this week, ${vars.avg_rating}⭐ avg. Check your email for details. Reply HELP anytime.`;
};
```

**Character Count:** ~120-140 characters (under 160 limit)

**Implementation:**
```javascript
const twilio = require('twilio')(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

const sendSMS = async ({ to, body }) => {
  const message = await twilio.messages.create({
    body: body,
    from: process.env.TWILIO_PHONE_NUMBER,
    to: to
  });
  
  return message;
};
```

---

## Edge Cases & Handling

### 1. No Reviews This Week

**Strategy:** Send encouraging message, maintain engagement

**Email Content:**
- Show stats as "0 new reviews" (not hidden)
- Empty state icon + message: "No reviews this week. Don't worry—customers are still discovering you! Keep up the great work."
- No themes section
- No insight section
- No CTA button

**SMS Content:**
```
No reviews this week. Keep up the great work! Check your email for details. Reply HELP anytime.
```

---

### 2. First Week (No Previous Data)

**Strategy:** Show current week stats without comparisons

**Email Changes:**
- Insight doesn't reference "up/down from last week"
- Focus on absolute performance: "Great start! You received 5 reviews with an average of 4.4 stars."
- Give actionable feedback based on current data only

**AI Prompt Adjustment:**
```javascript
if (isFirstWeek) {
  prompt += "\nNote: This is the restaurant's first week. Don't reference trends or comparisons.";
}
```

---

### 3. All 5-Star Reviews

**Strategy:** Celebrate success, encourage consistency

**Insight Examples:**
- "Perfect week! All 7 reviews were 5 stars. Customers especially loved your [top praise theme]. Keep this momentum going!"
- "Outstanding! 100% 5-star ratings this week. Your [praise theme] is clearly resonating with customers."

**AI Prompt Guidance:**
```
When all reviews are 5 stars, focus on celebration and identifying what's working well. Encourage maintaining consistency rather than improvement.
```

---

### 4. All 1-Star Reviews

**Strategy:** Supportive, solution-focused tone

**Insight Examples:**
- "This was a tough week. Multiple customers mentioned [complaint theme]. Consider [specific action] to address this. We're here to help—reply if you need support."
- "Several issues came up this week around [theme]. Let's turn this around. Focus on [actionable fix]. Reach out if you need guidance."

**AI Prompt Guidance:**
```
When all reviews are 1-2 stars, be empathetic but actionable. Identify the core issue and suggest one concrete improvement. Tone should be supportive, not judgmental.
```

---

### 5. AI Extraction Fails

**Fallback Strategy:**
```javascript
const extractThemes = async (reviews) => {
  try {
    const result = await callOpenAI(reviews);
    return result;
  } catch (error) {
    // Fallback: Simple keyword extraction
    return {
      praise_themes: extractKeywordsFromHighRatings(reviews),
      complaint_themes: extractKeywordsFromLowRatings(reviews),
      operational_insight: generateBasicInsight(reviews)
    };
  }
};

const extractKeywordsFromHighRatings = (reviews) => {
  const highRated = reviews.filter(r => r.rating >= 4);
  // Simple word frequency analysis
  const keywords = analyzeFrequentPhrases(highRated);
  return keywords.slice(0, 3);
};
```

---

### 6. Invalid Email/Phone

**Handling:**
- Log failure
- Skip that channel (don't block the other)
- Add to admin alert queue for manual follow-up
- Continue with next restaurant

---

## Scheduling & Timezone Handling

**Challenge:** Restaurants in different timezones need digests at 8:00 AM local time.

**Solution:**
```javascript
// Run cron every hour on Sunday
cron.schedule('0 * * * 0', async () => {
  const currentHour = new Date().getUTCHours();
  
  // Find restaurants where local time is 8:00 AM
  const restaurants = await getRestaurantsForDigest(currentHour);
  
  await Promise.allSettled(
    restaurants.map(r => generateAndSendDigest(r))
  );
});

const getRestaurantsForDigest = async (utcHour) => {
  return await db.query(`
    SELECT * FROM restaurants
    WHERE is_active = true
      AND EXTRACT(HOUR FROM CONVERT_TZ(NOW(), 'UTC', timezone)) = 8
  `);
};
```

**Alternative (simpler for V1):**
- Run digest generation Saturday night (11:59 PM UTC)
- Send all at once Sunday morning (acceptable for V1)
- Add proper timezone scheduling in V2

---

## Database Schema

**New Table: `digest_logs`**
```sql
CREATE TABLE digest_logs (
  id SERIAL PRIMARY KEY,
  restaurant_id INT NOT NULL,
  sent_at TIMESTAMP NOT NULL,
  week_start DATE NOT NULL,
  week_end DATE NOT NULL,
  review_count INT NOT NULL,
  avg_rating DECIMAL(2,1),
  email_sent BOOLEAN DEFAULT false,
  sms_sent BOOLEAN DEFAULT false,
  email_error TEXT,
  sms_error TEXT,
  ai_themes_json JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  FOREIGN KEY (restaurant_id) REFERENCES restaurants(id)
);

CREATE INDEX idx_digest_logs_restaurant ON digest_logs(restaurant_id);
CREATE INDEX idx_digest_logs_sent_at ON digest_logs(sent_at);
```

**Purpose:**
- Track delivery status
- Debugging failed sends
- Historical analytics (future feature)
- Prevent duplicate sends

---

## Monitoring & Alerts

**Key Metrics:**
- Digests sent successfully (per week)
- Email delivery rate
- SMS delivery rate
- AI extraction failures
- Average generation time

**Alerts:**
- Email delivery rate < 95%
- SMS delivery rate < 90%
- AI failures > 5%
- Any digest generation > 30 seconds

**Implementation:**
```javascript
// Simple logging for V1
const logDigestMetrics = async (stats) => {
  console.log('[DIGEST_METRICS]', {
    timestamp: new Date(),
    total_restaurants: stats.total,
    successful: stats.successful,
    failed: stats.failed,
    avg_generation_time_ms: stats.avgTime
  });
  
  // Send to admin if failure rate > 5%
  if (stats.failed / stats.total > 0.05) {
    await sendAdminAlert('High digest failure rate', stats);
  }
};
```

---

## Security & Privacy

**Unsubscribe:**
- Required by email regulations
- Updates `restaurants.digest_enabled = false`
- Still receives SMS (separate opt-out)

**Data Privacy:**
- Review text sent to OpenAI (acceptable - no PII)
- Email/phone encrypted at rest
- Digest logs retained for 90 days only

**Rate Limiting:**
- Max 1 digest per restaurant per week
- Duplicate send prevention via `digest_logs` table

---

## Testing Strategy

**Unit Tests:**
- Theme extraction with various review sets
- SMS character limit validation
- Template rendering with edge cases
- Timezone calculation accuracy

**Integration Tests:**
- End-to-end digest generation
- Email/SMS delivery (test mode)
- Error handling and retries

**Manual Testing Checklist:**
- [ ] No reviews (empty state)
- [ ] First week (no comparison data)
- [ ] All 5-star reviews
- [ ] All 1-star reviews
- [ ] Mixed reviews (normal case)
- [ ] Email renders correctly on mobile
- [ ] SMS under 160 characters
- [ ] Unsubscribe link works
- [ ] Reply CTA links to correct review

---

## Future Enhancements (Post-V1)

1. **Frequency Preferences:** Daily/weekly options
2. **Custom Insights:** Restaurant-specific AI training
3. **Trend Charts:** Week-over-week graphs in email
4. **Competitor Benchmarks:** "You're rated 0.5 stars above similar restaurants"
5. **Web Dashboard:** View digest history online
6. **Actionable CTAs:** "Respond to reviews" deep links to specific review

---

## Cost Analysis

**Per Restaurant Per Week:**
- OpenAI API: $0.001
- Resend (email): $0.001
- Twilio (SMS): $0.0075
- **Total: ~$0.01 per restaurant per week**

**For 100 Restaurants:**
- Weekly: $1.00
- Monthly: ~$4.00
- Yearly: ~$48.00

**Scaling Costs:**
- 1,000 restaurants: ~$480/year
- 10,000 restaurants: ~$4,800/year

Extremely cost-effective. Main costs will be infrastructure/hosting, not digest delivery.

---

## Implementation Checklist

- [ ] Create `digest-email-template.html`
- [ ] Create AI prompt templates
- [ ] Build theme extraction function
- [ ] Build digest generation pipeline
- [ ] Set up Resend account + domain
- [ ] Set up Twilio account
- [ ] Create `digest_logs` table
- [ ] Implement cron job
- [ ] Add unsubscribe handler
- [ ] Write unit tests
- [ ] Manual testing (all edge cases)
- [ ] Deploy to production
- [ ] Monitor first Sunday send

---

**Status:** Design complete. Ready for implementation after Phase 1 infrastructure is built.
