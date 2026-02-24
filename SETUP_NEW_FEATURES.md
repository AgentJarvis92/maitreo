# Setup Guide: New Backend Features

This guide covers setting up the newly built features: Yelp integration, TripAdvisor scraper, crisis detection, competitor tracking, and pattern detection.

## 1. Database Migration (Required)

**Status:** ⚠️ **REQUIRED - Must be done first**

Run the migration to create new database tables:

1. Go to [Supabase Dashboard](https://app.supabase.com)
2. Select your project
3. Navigate to **SQL Editor**
4. Copy the contents of `migrations/004_crisis_and_competitor_tables.sql`
5. Paste and execute

**Tables Created:**
- `crisis_alerts` - Tracks crisis events and SMS notifications
- `competitor_snapshots` - Historical competitor data for trend analysis

---

## 2. Yelp Fusion API Integration

**Status:** ✅ Built | ⚠️ Needs API Key

### Get Yelp API Key

1. Go to [Yelp Fusion API](https://fusion.yelp.com/)
2. Sign up or log in
3. Create a new app
4. Copy your API key

### Add to .env

```bash
YELP_API_KEY=your_yelp_api_key_here
```

### Features

- Fetch reviews for Yelp businesses
- Search for competitors by location and radius
- Get detailed business information
- Track competitor metrics

### Usage Example

```typescript
import { yelpService } from './services/yelpService';

// Search for competitors
const results = await yelpService.searchBusinesses('pizza', 'New York, NY', 8047, 20);

// Get business details
const business = await yelpService.getBusinessDetails('business-id');

// Fetch reviews
const reviews = await yelpService.fetchReviews('business-id');
```

### Test

```bash
npx ts-node src/tests/yelpService.test.ts
```

---

## 3. TripAdvisor Scraper

**Status:** ✅ Built | ⚠️ Requires URLs

### Setup

No API key needed - uses web scraping (may break if TripAdvisor changes their HTML).

### Important Notes

- **No official API** - scraper-based, may require maintenance
- **Rate limiting** - Built-in delays between requests
- **Requires URLs** - You need the full TripAdvisor restaurant URL

### Usage Example

```typescript
import { tripadvisorScraper } from './services/tripadvisorScraper';

const url = 'https://www.tripadvisor.com/Restaurant_Review-g123-d456...';

// Scrape reviews (up to 2 pages)
const reviews = await tripadvisorScraper.scrapeReviews(url, 2);

// Get business info
const business = await tripadvisorScraper.scrapeBusinessInfo(url);
```

### Test

Update the test URL in `src/tests/tripadvisorScraper.test.ts`, then:

```bash
npx ts-node src/tests/tripadvisorScraper.test.ts
```

---

## 4. Crisis Mode Detection

**Status:** ✅ Built | ⚠️ Needs Migration

### Features

Automatically detects critical situations:

- **2+ negative reviews** (≤2 stars) in 24 hours → Critical alert
- **3+ negative reviews** in 72 hours → High alert
- **Critical keywords** detected (food poisoning, health issues, etc.)
- **Sudden rating drops** (1.5+ stars decline)

### Triggers SMS Alerts

When crisis detected, sends urgent SMS to restaurant owner.

### Usage Example

```typescript
import { crisisDetector } from './services/crisisDetector';

// Check for crisis
const result = await crisisDetector.detectCrisis(restaurantId);

if (result.shouldAlert) {
  // Send SMS alert
  await crisisDetector.sendCrisisAlert(restaurant, result);
}
```

### Integration

Add to your review monitoring cron job:

```typescript
import { crisisDetector } from './services/crisisDetector';

// After fetching new reviews...
const crisisResult = await crisisDetector.detectCrisis(restaurant.id);

if (crisisResult.shouldAlert) {
  const recentlyAlerted = await crisisDetector.wasRecentlyAlerted(restaurant.id, 6);
  
  if (!recentlyAlerted) {
    await crisisDetector.sendCrisisAlert(restaurant, crisisResult);
  }
}
```

### Test

```bash
npx ts-node src/tests/crisisDetector.test.ts
```

---

## 5. Competitor Tracking Engine

**Status:** ✅ Built | ⚠️ Needs Migration + Yelp API

### Features

- **Find competitors** within 5-mile radius
- **Track metrics** (rating, review count, velocity)
- **Detect growth anomalies** (sudden review spikes)
- **Generate insights** (emerging threats, opportunities)

### Setup

1. Complete database migration
2. Add Yelp API key
3. Configure competitors for each restaurant

### Usage Example

```typescript
import { competitorTracker } from './services/competitorTracker';

// Find nearby competitors
const competitors = await competitorTracker.findNearbyCompetitors(
  'My Restaurant',
  'New York, NY',
  'italian'
);

// Save to restaurant profile
await supabase
  .from('restaurants')
  .update({ competitors_json: competitors })
  .eq('id', restaurantId);

// Track competitor metrics
const metrics = await competitorTracker.trackCompetitors(restaurant);

// Generate insights
const insights = competitorTracker.generateInsights(metrics);
```

### Automate Tracking

Add to weekly cron job:

```typescript
// Run weekly to track competitor changes
const metrics = await competitorTracker.trackCompetitors(restaurant);
const insights = competitorTracker.generateInsights(metrics);

// Include in weekly newsletter
console.log('Competitor insights:', insights);
```

### Test

```bash
npx ts-node src/tests/competitorTracker.test.ts
```

---

## 6. Pattern Detection

**Status:** ✅ Built | ✅ Ready to Use

### Features

- **Keyword frequency analysis** across reviews
- **Topic clustering** (service, food, ambiance, value)
- **Sentiment patterns** by topic
- **Actionable insights** with suggestions

### Usage Example

```typescript
import { patternDetector } from './services/patternDetector';

// Analyze patterns (last 90 days)
const analysis = await patternDetector.analyzePatterns(restaurantId, 90);

console.log('Top Issues:', analysis.topIssues);
console.log('Top Praise:', analysis.topPraise);
console.log('Insights:', analysis.insights);

// Get specific patterns
for (const pattern of analysis.patterns) {
  if (pattern.actionable && pattern.suggestion) {
    console.log(`Issue: ${pattern.topic}`);
    console.log(`Suggestion: ${pattern.suggestion}`);
  }
}
```

### Integration

Add to weekly newsletter generation:

```typescript
const analysis = await patternDetector.analyzePatterns(restaurant.id);

// Include in newsletter
const issuesSection = analysis.topIssues.map(issue => {
  const pattern = analysis.patterns.find(p => p.topic === issue);
  return {
    issue,
    suggestion: pattern?.suggestion,
    frequency: pattern?.frequency,
  };
});
```

### Test

```bash
npx ts-node src/tests/patternDetector.test.ts
```

---

## Quick Start Checklist

- [ ] Run database migration (`migrations/004_crisis_and_competitor_tables.sql`)
- [ ] Get and add Yelp API key to `.env`
- [ ] Test Yelp integration
- [ ] Test TripAdvisor scraper (with real URL)
- [ ] Test crisis detection
- [ ] Configure competitors for restaurants
- [ ] Test competitor tracking
- [ ] Test pattern detection
- [ ] Integrate into existing cron jobs

---

## Integration Points

### Review Monitoring Job

```typescript
// After fetching new reviews
import { crisisDetector, patternDetector } from './services';

// Check for crisis
const crisis = await crisisDetector.detectCrisis(restaurant.id);
if (crisis.shouldAlert) {
  await crisisDetector.sendCrisisAlert(restaurant, crisis);
}

// Update patterns (weekly)
if (isWeekly) {
  const patterns = await patternDetector.analyzePatterns(restaurant.id);
  // Store or email patterns
}
```

### Weekly Newsletter Job

```typescript
import { competitorTracker, patternDetector } from './services';

// Track competitors
const metrics = await competitorTracker.trackCompetitors(restaurant);
const competitorInsights = competitorTracker.generateInsights(metrics);

// Analyze patterns
const patterns = await patternDetector.analyzePatterns(restaurant.id);

// Include in newsletter
const newsletterData = {
  competitorInsights,
  topIssues: patterns.topIssues,
  topPraise: patterns.topPraise,
  insights: patterns.insights,
};
```

---

## Troubleshooting

### "Table does not exist" Errors

→ Run the database migration first

### "YELP_API_KEY not configured"

→ Add Yelp API key to `.env`

### TripAdvisor scraper returns no results

→ Check if URL is valid and HTML structure hasn't changed

### Crisis detector not alerting

→ Check if `owner_phone` is set and Twilio credentials are valid

### Competitor tracking fails

→ Ensure Yelp API key is set and competitors are configured

---

## Next Steps

1. **Run migration** (required for crisis & competitor features)
2. **Get Yelp API key** (enables Yelp + competitor tracking)
3. **Test each service** individually
4. **Integrate into cron jobs** (see Integration Points above)
5. **Monitor logs** for errors during first run

## Support

All services include error handling and logging. Check console output for debugging information.
