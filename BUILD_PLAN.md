# ReviewReply SMS-First Build Plan

**Start Date:** 2026-02-11
**Target MVP:** 10 days (2026-02-21)
**Approved by:** Kevin at 11:05 AM
**Last Updated:** 2026-02-11 12:22 PM

## Core Features

1. **SMS Alerts** - Instant notifications for negative reviews (1-3 stars)
2. **AI Auto-Response** - Automatic handling of positive reviews (4-5 stars) in human tone
3. **Weekly Digest** - SMS link + Email backup with intelligence report
4. **Competitor Tracking** - 5-mile radius, track fastest-growing restaurants
5. **Pattern Detection** - Flag recurring issues across reviews
6. **Crisis Mode** - Alert if 2+ negative reviews within 24 hours
7. **Staff Shoutouts** - Track when staff get mentioned by name
8. **Photo Alerts** - Flag reviews with photos (content opportunities)
9. **Ranking Tracker** - Monitor Google Maps ranking for key searches
10. **No Dashboard** - Everything via SMS + Email

## Pricing

- **$99/month** per restaurant location
- **Cost:** ~$4/month (Twilio SMS + OpenAI + monitoring)
- **Margin:** 96%
- **Break-even:** 1 customer covers all API costs

## Build Phases

### Phase 1: Foundation (Days 1-3)
- [x] Set up Supabase database
- [x] Design schema (restaurants, reviews, responses, settings)
- [ ] Set up Twilio account for SMS
- [x] Configure OpenAI API for response generation
- [x] Configure Google account for Places API

### Phase 2: Review Monitoring (Days 4-5)
- [ ] Enable Google Places API
- [ ] Build Google reviews scraper
- [ ] Build Yelp reviews scraper (get API key)
- [ ] Set up cron job to check every 5 minutes
- [ ] Sentiment analysis (1-3 stars = negative, 4-5 = positive)

### Phase 3: AI Response Engine (Days 6-7)
- [x] Build GPT-4 prompt for review responses (human tone)
- [ ] Test response quality across review types
- [ ] Build approve/edit flow via SMS
- [ ] Auto-post approved responses back to Google/Yelp

### Phase 4: SMS System (Day 8)
- [x] **SMS Command System Design** (COMPLETE - see docs/)
  - Architecture: `docs/sms-architecture.md`
  - Templates: `sms-templates.json` (20+ templates)
  - State Machine: `docs/sms-state-machine.md`
- [ ] Twilio integration (complete verification)
- [x] SMS alert template for negative reviews
- [x] Reply parsing (YES/EDIT/custom text)
- [ ] Edit flow via SMS
- [ ] Weekly digest SMS link system
- [ ] **IMPLEMENTATION:** Build command parser, session manager, handlers (see SMS_DESIGN_COMPLETE.md)

### Phase 5: Competitor Intelligence (Day 8-9)
- [ ] Identify similar restaurants (5-mile radius, same category)
- [ ] Scrape competitor reviews weekly
- [ ] Track review volume and calculate growth rates
- [ ] Rank competitors by growth percentage
- [ ] Generate insights for top 3-5 movers

### Phase 6: Advanced Features (Day 9)
- [ ] Pattern detection (recurring issues in reviews)
- [ ] Crisis mode (2+ negative within 24hrs)
- [ ] Staff name extraction and tracking
- [ ] Photo review detection
- [ ] Google Maps ranking tracker (monthly)
- [ ] Best review of the week picker

### Phase 7: Weekly Digest System (Day 9-10)
- [ ] Email template (mobile-optimized)
- [ ] Web digest page (/digest/{id}/{token}/{week})
- [ ] SMS teaser message with link
- [ ] Pull all stats: reviews, patterns, staff, competitors, ranking
- [ ] Schedule Sunday 6pm delivery
- [ ] Magic link authentication (no login)

### Phase 8: Billing & Cancellation (Day 9-10)
- [ ] Set up Stripe Customer Portal (no-code billing management)
- [ ] SMS command handler ("CANCEL", "HELP", "BILLING" → Stripe portal link)
- [ ] Add Stripe portal link to weekly email footer
- [ ] Test magic link security and expiration
- [ ] No custom cancellation page needed (Stripe handles everything)

**Cancellation Flow:**
1. Customer texts "CANCEL" or clicks "Manage Billing" in email
2. Bot sends Stripe Customer Portal magic link
3. Customer can cancel, update card, view invoices (no login)
4. Stripe handles all auth/security

**Why Stripe Portal:**
- Zero dev time (30 min setup vs 8-12 hours custom)
- Handles: cancel, update payment, invoices, pause subscription
- Secure magic links (no passwords)
- Professional, trusted by customers
- Stays true to "no dashboard" (one-time link only when needed)

### Phase 9: Testing & Launch (Day 10)
- [ ] Find 3-5 pilot restaurants
- [ ] Run free trial week
- [ ] Fix bugs
- [ ] Launch publicly
- [ ] Update landing page with $99 pricing

## Tech Stack

**Backend:**
- Supabase (PostgreSQL database + auth)
- Node.js cron job for monitoring
- OpenAI GPT-4 for responses

**Communication:**
- Twilio for SMS alerts + weekly digest links
- Email for weekly digest backup

**Frontend:**
- Existing Next.js landing page (already deployed)
- Web digest page (mobile-first)
- Add signup form

**Payment:**
- Stripe (account already exists, need $99 payment link)

## Database Schema (Expanded)

```sql
-- Restaurants table
CREATE TABLE restaurants (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  google_place_id TEXT,
  yelp_business_id TEXT,
  category TEXT, -- 'italian', 'pizza', etc.
  lat FLOAT,
  lng FLOAT,
  plan TEXT DEFAULT 'starter',
  created_at TIMESTAMP DEFAULT NOW()
);

-- Reviews table
CREATE TABLE reviews (
  id UUID PRIMARY KEY,
  restaurant_id UUID REFERENCES restaurants(id),
  platform TEXT NOT NULL, -- 'google' or 'yelp'
  review_id TEXT NOT NULL,
  author TEXT,
  rating INTEGER NOT NULL,
  text TEXT,
  photos JSONB, -- array of photo URLs
  posted_at TIMESTAMP,
  sentiment TEXT, -- 'positive' or 'negative'
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(platform, review_id)
);

-- Responses table
CREATE TABLE responses (
  id UUID PRIMARY KEY,
  review_id UUID REFERENCES reviews(id),
  ai_draft TEXT NOT NULL,
  final_text TEXT,
  status TEXT DEFAULT 'pending', -- 'pending', 'approved', 'edited', 'posted'
  posted_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Competitors table (NEW)
CREATE TABLE competitors (
  id UUID PRIMARY KEY,
  restaurant_id UUID REFERENCES restaurants(id),
  name TEXT NOT NULL,
  google_place_id TEXT,
  category TEXT,
  distance_miles FLOAT,
  is_tracked BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Competitor reviews (NEW)
CREATE TABLE competitor_reviews (
  id UUID PRIMARY KEY,
  competitor_id UUID REFERENCES competitors(id),
  review_count INTEGER NOT NULL,
  avg_rating FLOAT,
  response_rate FLOAT,
  week_start DATE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(competitor_id, week_start)
);

-- Patterns (NEW)
CREATE TABLE patterns (
  id UUID PRIMARY KEY,
  restaurant_id UUID REFERENCES restaurants(id),
  keyword TEXT NOT NULL,
  mention_count INTEGER DEFAULT 1,
  first_seen TIMESTAMP DEFAULT NOW(),
  last_seen TIMESTAMP DEFAULT NOW(),
  week_start DATE NOT NULL
);

-- Staff mentions (NEW)
CREATE TABLE staff_mentions (
  id UUID PRIMARY KEY,
  restaurant_id UUID REFERENCES restaurants(id),
  staff_name TEXT NOT NULL,
  review_id UUID REFERENCES reviews(id),
  sentiment TEXT, -- 'positive' or 'negative'
  mentioned_at TIMESTAMP DEFAULT NOW()
);

-- Weekly digests (NEW)
CREATE TABLE weekly_digests (
  id UUID PRIMARY KEY,
  restaurant_id UUID REFERENCES restaurants(id),
  week_start DATE NOT NULL,
  secure_token TEXT NOT NULL,
  content JSONB NOT NULL, -- all digest data
  sent_at TIMESTAMP,
  opened_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);
```

## Weekly Digest Structure

**SMS (Sunday 6pm):**
```
📊 This week: 12 reviews, Sally's Italian +200%, Maria mentioned 5x. 
Tap for full intel → reviewreply.com/digest/abc123
```

**Email + Web Page Content:**
1. **At a Glance** (10 sec)
   - Review count, avg rating, response rate
   
2. **Alerts** (15 sec, if any)
   - Pattern detection
   - Crisis alerts
   - Photo opportunities
   
3. **Wins** (20 sec)
   - Team MVPs (staff mentions)
   - Best review of the week
   
4. **Competitor Intel** (30 sec)
   - Top 3-5 fastest-growing competitors
   - Your ranking vs them
   - Actionable insights
   
5. **Your Ranking** (10 sec, monthly only)
   - Google Maps position for key searches

**Total read time: 90 seconds (skim) to 3 minutes (deep read)**

## Communication Rules

**SMS:**
- ✅ Negative review alerts (need approval)
- ✅ Crisis mode (urgent operational issue)
- ✅ Weekly digest link (Sunday 6pm)
- ❌ Positive reviews (auto-handled silently)
- ❌ Daily summaries (email only)

**Email:**
- ✅ Weekly digest (full version)
- ✅ Backup for SMS link
- ❌ Individual review notifications

## Next Immediate Steps

1. ✅ Google account created
2. Enable Google Places API
3. Complete Twilio verification
4. Get Yelp Fusion API key
5. Update landing page to $99 pricing
6. Build competitor tracking system
7. Build pattern detection
8. Build weekly digest generator
9. Find 3-5 pilot restaurants

---

**Status:** IN PROGRESS
**Current Phase:** Foundation complete, moving to API setup
**Next Action:** Enable Google Places API, complete Twilio
