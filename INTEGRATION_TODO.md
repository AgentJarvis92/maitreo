# Integration TODO - Review APIs

**Status**: Waiting for data-api-agent  
**Estimated Time**: 1-2 hours once APIs are ready  
**Current Progress**: 95% complete, just need review fetching

---

## What We're Waiting For

The data-api-agent needs to provide review fetching implementations for:

1. **Google Reviews API**
2. **Yelp Reviews API**

---

## Expected Interface

```typescript
// File: src/sources/google.ts
export interface GoogleReviewSource {
  platform: 'google';
  fetchReviews(placeId: string, since?: Date): Promise<Review[]>;
}

// File: src/sources/yelp.ts
export interface YelpReviewSource {
  platform: 'yelp';
  fetchReviews(businessId: string, since?: Date): Promise<Review[]>;
}

// Expected Review format (should match src/types/models.ts)
interface Review {
  id: string;           // Platform-specific review ID
  author: string;       // Reviewer name
  rating: number;       // 1-5
  text: string;         // Review text
  date: Date;           // When review was posted
  metadata?: {          // Optional platform-specific data
    verified?: boolean;
    responseCount?: number;
    helpful?: number;
    [key: string]: any;
  };
}
```

---

## Integration Steps (Once APIs Ready)

### Step 1: Add Source Files

Data-api-agent should provide:
```
src/sources/
├── google.ts       - Google Reviews fetching
└── yelp.ts         - Yelp Reviews fetching
```

### Step 2: Update Ingestion Job

**File**: `src/jobs/ingestion.ts`

**Find** (line ~19):
```typescript
// TODO: Register actual review sources once data-api-agent provides them
// import { googleReviewSource } from '../sources/google.js';
// import { yelpReviewSource } from '../sources/yelp.js';
// job.registerSource(googleReviewSource);
// job.registerSource(yelpReviewSource);
```

**Replace with**:
```typescript
import { googleReviewSource } from '../sources/google.js';
import { yelpReviewSource } from '../sources/yelp.js';

const job = new IngestionJob();
job.registerSource(googleReviewSource);
job.registerSource(yelpReviewSource);
```

**Find** (line ~71):
```typescript
// TODO: Replace with actual API call once data-api-agent provides spec
// const rawReviews = await source.fetchReviews(restaurant.id, since || undefined);
const rawReviews: any[] = []; // Placeholder
```

**Replace with**:
```typescript
const rawReviews = await source.fetchReviews(restaurant.id, since || undefined);
```

**Find** (line ~158):
```typescript
console.log('⚠️  No review sources registered yet.');
console.log('    Waiting for data-api-agent to provide ingestion spec.');
console.log('    This job will remain a placeholder until then.\n');

// Uncomment when sources are ready:
// job.run()
//   .then(() => process.exit(0))
//   .catch((error) => {
//     console.error(error);
//     process.exit(1);
//   });
```

**Replace with**:
```typescript
job.run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
```

### Step 3: Add Environment Variables

**File**: `.env`

Add any API keys needed by the review sources:
```bash
# Google Reviews API
GOOGLE_PLACES_API_KEY=...

# Yelp Reviews API
YELP_API_KEY=...
YELP_CLIENT_ID=...
```

### Step 4: Update `.env.example`

**File**: `.env.example`

Add the new keys:
```bash
# Review APIs
GOOGLE_PLACES_API_KEY=your-google-api-key
YELP_API_KEY=your-yelp-api-key
```

### Step 5: Test Locally

```bash
# 1. Load seed data (includes restaurant IDs)
psql $DATABASE_URL -f scripts/seed-data.sql

# 2. Run ingestion job
npm run ingestion

# 3. Check results
psql $DATABASE_URL -c "SELECT * FROM reviews ORDER BY ingested_at DESC LIMIT 10;"
psql $DATABASE_URL -c "SELECT * FROM reply_drafts ORDER BY created_at DESC LIMIT 5;"
psql $DATABASE_URL -c "SELECT * FROM email_logs ORDER BY created_at DESC LIMIT 5;"
```

### Step 6: Deploy to Production

```bash
# Railway
railway variables set GOOGLE_PLACES_API_KEY=...
railway variables set YELP_API_KEY=...
railway up

# Or for Render/GitHub Actions, add secrets via dashboard
```

---

## Testing Checklist

Once integrated, verify:

- [ ] Google reviews are being fetched
- [ ] Yelp reviews are being fetched
- [ ] Deduplication works (no duplicate reviews)
- [ ] Reviews are stored in database with correct format
- [ ] Reply drafts are generated for each review
- [ ] Emails are sent to restaurant owners
- [ ] Email logs are created
- [ ] Escalations are detected correctly
- [ ] Cron job runs successfully every 4 hours

---

## Expected Data Flow

```
1. Cron triggers ingestion job (every 4h)
   ↓
2. Job fetches all restaurants from DB
   ↓
3. For each restaurant:
   a. Get Google reviews via googleReviewSource.fetchReviews()
   b. Get Yelp reviews via yelpReviewSource.fetchReviews()
   ↓
4. For each new review:
   a. Check if already exists (dedup)
   b. Insert into reviews table
   c. Generate reply draft with GPT-4
   d. Insert into reply_drafts table
   e. Send email to owner
   f. Log email in email_logs table
   ↓
5. Job completes, logs summary
```

---

## Potential Issues & Solutions

### Issue: Review format doesn't match
**Solution**: Create adapter functions in the source files to transform platform-specific formats to our `Review` interface.

### Issue: API rate limits
**Solution**: Add delays between requests in the ingestion job:
```typescript
await new Promise(resolve => setTimeout(resolve, 1000)); // 1s delay
```

### Issue: Authentication errors
**Solution**: Verify API keys are correct and have proper scopes/permissions.

### Issue: Missing restaurant IDs
**Solution**: Ensure `restaurants.id` contains valid platform-specific place IDs (Google Place ID, Yelp Business ID).

---

## Restaurant ID Format

The `restaurants` table should store platform-specific IDs for fetching:

**Option A**: Store in separate columns
```sql
ALTER TABLE restaurants 
ADD COLUMN google_place_id VARCHAR(255),
ADD COLUMN yelp_business_id VARCHAR(255);
```

**Option B**: Use existing `competitors_json` format
```json
{
  "self": {
    "google_place_id": "ChIJN1t_tDeuEmsRUsoyG83frY4",
    "yelp_business_id": "pizza-paradise-brooklyn"
  }
}
```

**Option C**: New JSONB column
```sql
ALTER TABLE restaurants
ADD COLUMN platform_ids JSONB DEFAULT '{}';

-- Example data:
{
  "google": "ChIJN1t_tDeuEmsRUsoyG83frY4",
  "yelp": "pizza-paradise-brooklyn"
}
```

Choose based on data-api-agent's requirements.

---

## Communication with Data API Agent

**What to ask for**:

1. ✅ Review fetching interface implementation
2. ✅ Expected input format (restaurant ID format)
3. ✅ Expected output format (should match our `Review` type)
4. ✅ Required API keys and setup instructions
5. ✅ Rate limits and recommended polling frequency
6. ✅ Error handling approach
7. ✅ Pagination support (if needed)

**What we provide**:

1. ✅ TypeScript `Review` interface (`src/types/models.ts`)
2. ✅ `ReviewSource` interface (`src/jobs/ingestion.ts`)
3. ✅ Database schema for `reviews` table
4. ✅ Ingestion job scaffold ready to integrate

---

## Files to Modify Summary

| File | Changes | Difficulty |
|------|---------|------------|
| `src/jobs/ingestion.ts` | Uncomment imports & API calls | Easy |
| `.env` | Add API keys | Easy |
| `.env.example` | Document new keys | Easy |
| `src/db/schema.sql` | (Optional) Add platform ID columns | Easy |
| `scripts/seed-data.sql` | (Optional) Add platform IDs to test data | Easy |

---

## Success Criteria

✅ **Integration complete when**:

1. Ingestion job runs without errors
2. New reviews appear in database
3. Reply drafts are generated
4. Emails are sent successfully
5. No duplicate reviews created
6. Escalations are properly flagged
7. Cron job runs reliably every 4 hours

---

## Timeline

| Phase | Duration | Status |
|-------|----------|--------|
| Backend core system | 5 hours | ✅ Complete |
| Documentation | 2 hours | ✅ Complete |
| **Review API integration** | **1-2 hours** | ⏳ Waiting |
| Testing & deployment | 1 hour | ⏳ Pending |

**Total**: ~9-10 hours

---

## Contact Points

**Questions for data-api-agent**:

- ❓ What's the expected format for Google Place IDs?
- ❓ What's the expected format for Yelp Business IDs?
- ❓ Do we need to handle pagination?
- ❓ What's the rate limit for each API?
- ❓ Should we filter by rating/date on the API side?
- ❓ How do we handle API errors/retries?

---

**Once you receive the review source implementations, follow the steps above and you'll be production-ready in ~1 hour!** 🚀

---

**Last Updated**: February 10, 2026  
**Status**: Ready for integration  
**Next**: Wait for data-api-agent deliverable
