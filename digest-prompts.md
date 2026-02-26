# Weekly Digest AI Prompts

This document contains all AI prompts used for theme extraction and insight generation in the Weekly Digest system.

**Model:** GPT-4o-mini  
**Cost:** ~$0.001 per digest  
**Response Format:** JSON

---

## System Prompt

```
You are an AI assistant helping restaurant owners understand their customer feedback. Your job is to analyze reviews and extract actionable insights in a supportive, constructive tone.

Guidelines:
- Be concise and specific
- Focus on actionable themes (not vague statements)
- Use customer language (quote-like phrasing)
- Be encouraging but honest
- Avoid jargon or overly formal language
- Generate insights that restaurant owners can actually act on

You must respond in valid JSON format only.
```

---

## Main Theme Extraction Prompt

### Template

```
Analyze the following {{review_count}} customer reviews for {{restaurant_name}} from the past week.

Extract:
1. **Praise themes** - What customers loved (max 5 themes, prioritize most frequent)
2. **Complaint themes** - What needs improvement (max 5 themes, prioritize most impactful)
3. **Operational insight** - One specific, actionable recommendation based on the data

{{#if has_previous_week}}
Context: Last week they had {{prev_review_count}} reviews with {{prev_avg_rating}}⭐ average. This week: {{review_count}} reviews, {{avg_rating}}⭐ average.
{{/if}}

{{#if is_first_week}}
Note: This is their first week. Don't reference trends or comparisons.
{{/if}}

Reviews:
{{#each reviews}}
---
Rating: {{rating}}/5
Customer: {{customer_name}}
Review: "{{text}}"
{{/each}}

Return JSON in this exact format:
{
  "praise_themes": ["theme 1", "theme 2", "theme 3"],
  "complaint_themes": ["theme 1", "theme 2"],
  "operational_insight": "Your detailed insight here."
}

Rules:
- Praise/complaint themes should be short phrases (5-8 words max)
- Use customer language (e.g., "Authentic New York style pizza" not "Pizza quality")
- If no complaints exist, return empty array for complaint_themes
- If no praise exists, return empty array for praise_themes
- Operational insight should be 2-3 sentences, specific and actionable
- Include week-over-week comparison in insight if data is available
- Be encouraging but honest
```

---

## Edge Case Prompts

### 1. No Reviews This Week

**Not needed** - Skip AI call entirely. Send empty state digest.

---

### 2. All 5-Star Reviews

### Template Addition

```
Special instruction: All reviews this week are 5 stars. Focus your insight on celebration and maintaining consistency. Identify what's working exceptionally well.

Example good insight:
"Perfect week! All 7 reviews were 5 stars. Customers especially loved your authentic pizza and friendly service. Keep this momentum going by maintaining consistency during peak hours."

Example bad insight:
"You did great. Keep it up." (Too vague)
```

---

### 3. All 1-2 Star Reviews

### Template Addition

```
Special instruction: All reviews this week are 1-2 stars. Be empathetic but solution-focused. Identify the core issue and suggest one concrete improvement. Avoid being judgmental.

Example good insight:
"This was a tough week. Multiple customers mentioned slow service during dinner rush. Consider adding another staff member on Friday/Saturday evenings to improve wait times. We're here to help—reply if you need support."

Example bad insight:
"You need to improve everything." (Not specific or actionable)
```

---

### 4. First Week (No Historical Data)

### Template Addition

```
Special instruction: This is the restaurant's first week using Maitreo. Don't reference trends, comparisons, or week-over-week changes. Focus on absolute performance and give encouragement.

Example good insight:
"Great start! You received 5 reviews with an average of 4.4 stars. Customers loved your authentic flavors, though a few mentioned parking challenges. Consider adding parking info to your Google listing."

Example bad insight:
"Your ratings are up from last week." (No last week exists)
```

---

### 5. Very Few Reviews (1-2)

### Template Addition

```
Special instruction: Only {{review_count}} review(s) this week. Don't over-generalize. Be specific to what was mentioned, and note that it's limited data.

Example good insight:
"Limited feedback this week, but the reviews you did receive praised your friendly service. As you gather more reviews, we'll identify stronger patterns."

Example bad insight:
"Customers love your food." (Based on 1 review - too broad)
```

---

### 6. Mixed Reviews (Wide Rating Variance)

### Template Addition

```
Special instruction: Ratings this week varied significantly (from {{min_rating}} to {{max_rating}} stars). Acknowledge this in your insight and help identify consistency issues.

Example good insight:
"Mixed feedback this week—some customers raved about your food quality while others experienced slow service. This suggests inconsistency, likely during peak hours. Focus on standardizing service speed across all shifts."

Example bad insight:
"Some liked it, some didn't." (Not actionable)
```

---

## Real Example Calls

### Example 1: Normal Week (Mixed Reviews)

**Input:**
```json
{
  "restaurant_name": "Tony's Pizza",
  "review_count": 7,
  "avg_rating": 4.2,
  "prev_review_count": 5,
  "prev_avg_rating": 3.9,
  "reviews": [
    {
      "rating": 5,
      "customer_name": "Sarah M.",
      "text": "Best New York style pizza outside of NYC! The crust is perfect and the staff were so friendly."
    },
    {
      "rating": 5,
      "customer_name": "Mike D.",
      "text": "Authentic pizza, great atmosphere. My kids loved it too."
    },
    {
      "rating": 4,
      "customer_name": "Jessica L.",
      "text": "Really good pizza, but we waited 45 minutes on a Friday night. Worth it though!"
    },
    {
      "rating": 4,
      "customer_name": "Tom R.",
      "text": "Food was excellent. Parking is a nightmare though."
    },
    {
      "rating": 5,
      "customer_name": "Amanda K.",
      "text": "The margherita pizza is incredible. Friendly service too."
    },
    {
      "rating": 3,
      "customer_name": "David P.",
      "text": "Pizza was good but service was slow. Also hard to find parking."
    },
    {
      "rating": 4,
      "customer_name": "Lisa W.",
      "text": "Love the New York style! Wish they had more parking."
    }
  ]
}
```

**Expected Output:**
```json
{
  "praise_themes": [
    "Authentic New York style pizza",
    "Friendly and attentive staff",
    "Great atmosphere for families",
    "Perfect crust quality"
  ],
  "complaint_themes": [
    "Long wait times during dinner rush",
    "Limited parking availability"
  ],
  "operational_insight": "Your ratings are up 0.3 stars from last week! Customers love your pizza quality and authentic New York style. However, several mentioned slow service during peak hours and parking challenges. Consider adding another person to the line on Friday/Saturday nights to reduce wait times. For parking, add clear directions and nearby parking info to your Google listing."
}
```

---

### Example 2: All 5-Star Week

**Input:**
```json
{
  "restaurant_name": "Bella's Bistro",
  "review_count": 6,
  "avg_rating": 5.0,
  "reviews": [
    { "rating": 5, "text": "Amazing pasta! Best I've had in years." },
    { "rating": 5, "text": "Incredible service and delicious food." },
    { "rating": 5, "text": "The tiramisu is to die for!" },
    { "rating": 5, "text": "Perfect date night spot. Romantic and quiet." },
    { "rating": 5, "text": "Fresh ingredients, authentic Italian flavors." },
    { "rating": 5, "text": "Our server was wonderful. Food came out quick too." }
  ]
}
```

**Expected Output:**
```json
{
  "praise_themes": [
    "Authentic Italian flavors and fresh ingredients",
    "Amazing pasta and desserts",
    "Excellent and attentive service",
    "Perfect romantic atmosphere"
  ],
  "complaint_themes": [],
  "operational_insight": "Perfect week! All 6 reviews were 5 stars. Customers especially loved your authentic Italian cuisine and romantic atmosphere. Your service speed and quality are clearly resonating. Keep this momentum going by maintaining consistency across all shifts!"
}
```

---

### Example 3: Rough Week (Low Ratings)

**Input:**
```json
{
  "restaurant_name": "Main Street Diner",
  "review_count": 4,
  "avg_rating": 2.0,
  "reviews": [
    { "rating": 1, "text": "Waited over an hour for cold food. Server never came back to check on us." },
    { "rating": 2, "text": "Food was okay but service was terrible. No one seemed to care." },
    { "rating": 3, "text": "Burgers are decent but staff seemed overwhelmed and disorganized." },
    { "rating": 2, "text": "Long wait, cold fries, and our order was wrong. Very disappointing." }
  ]
}
```

**Expected Output:**
```json
{
  "praise_themes": [
    "Decent burger quality"
  ],
  "complaint_themes": [
    "Extremely slow service and long wait times",
    "Food arrived cold",
    "Inattentive and overwhelmed staff",
    "Order accuracy issues"
  ],
  "operational_insight": "This was a tough week, and we want to help you turn it around. Multiple customers mentioned slow service, cold food, and lack of attention from staff. This suggests a staffing or training issue. Focus on one immediate fix: ensure servers check back within 5 minutes of food delivery. Consider a brief team meeting to address service standards. We're here to support you—reply if you need guidance."
}
```

---

### Example 4: First Week

**Input:**
```json
{
  "restaurant_name": "Taco Haven",
  "review_count": 3,
  "avg_rating": 4.3,
  "is_first_week": true,
  "reviews": [
    { "rating": 5, "text": "Best tacos in town! The carne asada is incredible." },
    { "rating": 4, "text": "Really good food. Wish they had more vegetarian options though." },
    { "rating": 4, "text": "Fresh ingredients, great flavors. A bit pricey but worth it." }
  ]
}
```

**Expected Output:**
```json
{
  "praise_themes": [
    "Fresh ingredients and authentic flavors",
    "Incredible carne asada",
    "Great value despite higher prices"
  ],
  "complaint_themes": [
    "Limited vegetarian options"
  ],
  "operational_insight": "Great start! You received 3 reviews with an average of 4.3 stars. Customers especially loved your fresh ingredients and carne asada. One customer mentioned wanting more vegetarian options—consider adding a veggie taco or burrito to your menu. Keep up the great work!"
}
```

---

## Prompt Engineering Notes

### What Works:
- Specific formatting instructions ("5-8 words max")
- Real examples of good vs bad insights
- Context about the restaurant's situation (first week, all 5-stars, etc.)
- Explicit JSON schema
- "Use customer language" instruction

### What Doesn't Work:
- Asking for "3-5 themes" (too vague, often returns inconsistent counts)
- Not providing min/max constraints (gets verbose)
- Overly formal tone instructions (AI defaults to corporate speak)
- Asking for "insights" without examples (too generic)

### Optimization Tips:
1. **Use `response_format: { type: 'json_object' }`** - Forces valid JSON
2. **Temperature: 0.7** - Balanced creativity vs consistency
3. **Max tokens: 500** - Enough for thorough response, not wasteful
4. **Include review count in prompt** - Helps AI calibrate confidence
5. **Add edge case instructions conditionally** - Don't clutter base prompt

---

## Fallback Logic (If AI Fails)

```javascript
const generateFallbackThemes = (reviews) => {
  const highRated = reviews.filter(r => r.rating >= 4);
  const lowRated = reviews.filter(r => r.rating <= 2);
  
  // Simple keyword extraction
  const praiseKeywords = extractCommonPhrases(highRated);
  const complaintKeywords = extractCommonPhrases(lowRated);
  
  return {
    praise_themes: praiseKeywords.slice(0, 3),
    complaint_themes: complaintKeywords.slice(0, 3),
    operational_insight: `You received ${reviews.length} reviews this week with an average of ${calculateAvg(reviews)} stars. Keep up the great work!`
  };
};

// Basic phrase extraction (better than nothing)
const extractCommonPhrases = (reviews) => {
  const text = reviews.map(r => r.text).join(' ').toLowerCase();
  const phrases = [
    'great food', 'friendly staff', 'good service', 'delicious',
    'slow service', 'long wait', 'cold food', 'rude', 'parking'
  ];
  
  return phrases.filter(phrase => text.includes(phrase));
};
```

**When to use fallback:**
- OpenAI API is down
- Rate limit exceeded
- Invalid JSON response after 2 retries
- Response time > 10 seconds

---

## Testing Prompts

### Unit Test Cases

1. **7 reviews, mixed ratings** → Should extract 3-5 praise themes, 2-3 complaints, meaningful insight
2. **All 5 stars** → Should celebrate, no complaints, encouraging insight
3. **All 1-2 stars** → Should be empathetic, identify core issue, actionable fix
4. **1 review only** → Should note limited data, avoid over-generalizing
5. **First week, no history** → Should not reference trends or comparisons
6. **Prev week: 3.5⭐, This week: 4.2⭐** → Should mention improvement in insight

### Validation Checks

```javascript
const validateAIResponse = (response) => {
  // Check structure
  if (!response.praise_themes || !response.complaint_themes || !response.operational_insight) {
    throw new Error('Missing required fields');
  }
  
  // Check types
  if (!Array.isArray(response.praise_themes) || !Array.isArray(response.complaint_themes)) {
    throw new Error('Themes must be arrays');
  }
  
  // Check lengths
  if (response.praise_themes.length > 5 || response.complaint_themes.length > 5) {
    throw new Error('Too many themes');
  }
  
  // Check insight length (should be 2-3 sentences, ~100-300 chars)
  if (response.operational_insight.length < 50 || response.operational_insight.length > 500) {
    throw new Error('Insight length out of range');
  }
  
  // Check for placeholders (AI sometimes leaves them)
  const text = JSON.stringify(response);
  if (text.includes('{{') || text.includes('TODO') || text.includes('[restaurant]')) {
    throw new Error('Response contains placeholders');
  }
  
  return true;
};
```

---

## Cost Optimization

**Current Approach:**
- Single API call per restaurant per week
- ~1500 input tokens + 200 output tokens
- Cost: ~$0.001 per digest

**Possible Optimizations (if needed at scale):**
1. **Batch processing** - Group multiple restaurants in one API call (risky, harder to parse)
2. **Caching** - Cache common phrase patterns (marginal savings)
3. **Fallback-first** - Try simple keyword extraction first, use AI only if insufficient (loses quality)

**Recommendation:** Don't optimize prematurely. At 10,000 restaurants, we're spending $10/week on AI. Not worth the engineering complexity to save $5.

---

## Monitoring

**Log these for each AI call:**
- Request token count
- Response token count
- Latency (ms)
- Cost (calculated)
- Success/failure
- Validation errors

**Alert if:**
- Success rate < 95%
- Average latency > 5 seconds
- Weekly cost > expected (indicates token inflation)

---

**Status:** Prompts ready for implementation. Test with real review data before production deployment.
