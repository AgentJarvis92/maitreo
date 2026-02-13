# Maitreo - Complete Product Vision

**Last Updated:** 2026-02-12 11:58 AM EST  
**Status:** Finalized (with FAQ added)

---

## Target Market

**Medium to high-end restaurants**
- Independent restaurants (1-5 locations)
- Care about reputation and brand image
- Compete on experience, not just price
- Value competitive intelligence

---

## SMS-First, Zero Dashboard

Everything via text + email. No app, no logins, no passwords.

---

## Multi-Platform Monitoring

**Google Reviews + Yelp + TripAdvisor** - all monitored every 15 minutes, 24/7

---

## Core System

### 1. Positive Reviews (4-5★) → AUTO-POST (Silent)
- AI drafts reply in your voice
- **Posts automatically to all platforms** - no approval needed
- You get SMS notification: "✅ Auto-posted! 4.5★ review from Maria L. on Google"
- **Zero friction for good news**

### 2. Negative Reviews (1-3★) → INSTANT SMS ALERT
- Immediate SMS: "⚠️ New 2★ review from Sarah M. on Yelp about cold pizza and annoyed staff"
- AI drafts response
- Reply: **YES** (post) / **NO** (skip) / **[type your own]** (custom reply)
- **You stay in control when it matters**

### 3. CRISIS MODE ALERT 🚨
**If 2+ negative reviews within 24 hours (across any platform):**
```
🚨 URGENT: 2 negative reviews in 6 hours 
(1 Google, 1 Yelp). Something's wrong tonight.
```
- **Immediate SMS alert** (doesn't wait for weekly digest)
- Real-time operational problem alert
- "Your restaurant is on fire RIGHT NOW" notification

---

## Weekly Intelligence Newsletter

**Delivered: Sunday 9am (coffee time) - EMAIL ONLY**

### SMS Notification:
```
☕️ Your weekly intel is ready! 
This week: 12 reviews, Sally's Italian +200%, Maria mentioned 5x. 
Check your email → maitreo.com/digest/abc123
```

### Email + Web Page Sections:

**1. At a Glance** (10 sec)
- Total reviews this week (all platforms combined)
- Average rating across platforms
- Response rate
- Week-over-week trends

**2. Alerts** (15 sec)
- **Crisis alerts recap** - Any 2+ negative reviews in 24hrs this week
- **Pattern detection** - "3 reviews mentioned 'slow service' this week"
- **Photo opportunities** - "4 customers posted food photos - repost potential"

**3. Wins** (20 sec)
- **Staff MVP Shoutouts** - "Maria mentioned 5x, Carlos 3x"
- **Best review of the week** - AI-picked most glowing review

**4. Competitor Intelligence** (30 sec)
- **Top 3-5 fastest-growing competitors** (5-mile radius)
- AI detects growth anomalies: "Sally's Italian: +12 reviews this week (usual: 4/week = 200% growth)"
- **Actionable insights** - What they're doing right/wrong, opportunities to exploit

**5. Your Ranking** (10 sec, monthly)
- Google Maps position for key searches
- "'Italian restaurant [city]': #3 (up from #5)"

---

## Advanced Features (All Included)

- **Multi-Platform Monitoring** - Google, Yelp, TripAdvisor in one system
- **Competitor Tracking** - 5-mile radius, 10-20 similar restaurants, growth anomaly detection
- **Pattern Detection** - Flag recurring issues across reviews
- **Crisis Mode** - 2+ negative within 24hrs = urgent alert
- **Staff Shoutouts** - Track positive name mentions
- **Photo Alerts** - Reviews with photos = content opportunities
- **Ranking Tracker** - Monthly Google Maps ranking
- **Best Review Picker** - AI highlights top review weekly

---

## Signup & Onboarding Flow

### Step 1: Landing Page
- Click "Start for $99/mo"

### Step 2: Stripe Checkout
- Enter payment info
- Confirm subscription

### Step 3: Simple Onboarding Form (4 fields)
1. Restaurant name
2. Street address (or city/state)
3. Phone number (for SMS alerts)
4. Email address (for weekly digest)

**That's it. No complicated setup.**

### Step 4: We Do The Work
- Backend searches Google Places, Yelp, TripAdvisor using name + address
- We find all your listings automatically
- Email sent with connection instructions:
  - "Click to connect Google Business Profile" (OAuth link)
  - "Click to verify Yelp ownership" (claim link)
  - "Click to verify TripAdvisor" (management center link)

### Step 5: Authorize & Go Live
- Click each platform link to authorize access
- System starts monitoring immediately
- First SMS alert arrives when negative review comes in
- First weekly digest arrives Sunday 9am

**Total customer effort: 2 minutes**

---

## Communication Rules

### SMS = Real-Time Alerts Only
- ✅ Negative review alerts (need approval)
- ✅ Crisis mode alerts (urgent operational issue)
- ✅ Positive review confirmations (auto-posted notification)
- ✅ Weekly digest notification (link to email)
- ❌ Weekly digest content (email only)
- ❌ Daily summaries (too noisy)

### Email = Weekly Intelligence Only
- ✅ Weekly digest (full version, Sunday 9am)
- ✅ Platform connection instructions (onboarding)
- ❌ Individual review notifications (SMS only)
- ❌ Real-time alerts (SMS only)

---

## Pricing

**$99/month per location**
- All 3 platforms included
- Unlimited reviews
- AI-powered replies
- Weekly competitive intelligence
- SMS alerts + email digest
- 7-day free trial
- Cancel anytime

**Cost per customer:** ~$4/month (Twilio + OpenAI + API calls)  
**Margin:** 96%

---

## Tech Stack

**Monitoring:**
- Google Places API
- Yelp Fusion API
- TripAdvisor API (or scraper)
- Cron job every 15 minutes

**Backend:**
- Supabase (PostgreSQL database)
- Node.js backend
- OpenAI GPT-4o-mini for reply generation

**Communication:**
- Twilio SMS (real-time alerts + digest notification)
- Resend (weekly digest email only)

**Billing:**
- Stripe (payment + customer portal for cancellation)

**Frontend:**
- Landing page (already live at maitreo.com)
- Weekly digest web page (magic link, no login)

---

## Why This Wins

**For medium/high-end restaurant owners:**
- No learning curve (SMS for urgent, email for intelligence)
- Control when it matters (negative reviews)
- Automation for good news (positive reviews)
- Early warning system (crisis mode)
- Competitive intelligence (know what's working nearby)
- Matches their quality standards (AI replies sound professional)

**For us:**
- High margin (96%)
- Low churn (solves real pain, provides ongoing value)
- Scalable (automated monitoring)
- Moat (competitor intelligence = hard to replicate)
- Right market (can afford $99/mo without hesitation)

---

## Common Questions (FAQ)

**Q: Will replies sound robotic?**  
A: No. We learn your voice during onboarding. Every reply is customized to your brand. You approve negative responses before they post.

**Q: What if I'm closed on Sundays?**  
A: The digest arrives Sunday 9am, perfect for planning your week. If you'd prefer a different day, just let us know.

**Q: How long does setup take?**  
A: 2 minutes. Enter your restaurant name and address. We find your listings and send simple connection links. You're live within 24 hours.

**Q: Can I cancel anytime?**  
A: Yes. Month-to-month, no long-term contracts.

**Q: What platforms do you monitor?**  
A: Google Reviews, Yelp, and TripAdvisor - all in one system.

**Q: Do you post reviews without my approval?**  
A: We auto-post positive reviews (4-5 stars). Negative reviews always require your approval via SMS before posting.

---

## Positioning

**"Your Digital Maître d' for Guest Experience & Reputation"**

- SMS for action, email for intelligence
- Medium to high-end restaurants
- Compete on experience, not price
- Multi-platform, simple onboarding, Sunday morning coffee newsletter

## Cancellation Flow (Build Note)
- **SMS CANCEL:** Twilio receives inbound "CANCEL" text → backend matches phone number to customer → calls Stripe Cancel Subscription API → confirms via SMS
- **Digest link:** Stripe Customer Portal (hosted page, no custom UI needed) → unique link per customer in weekly email footer → customer manages/cancels directly through Stripe

## Voice Setup (Onboarding Step 5)

After the 4-field signup, prompt the restaurant owner with 2-3 questions to build their voice profile:

1. "Paste a reply you've written before that sounds like you" (or skip)
2. "How would you describe your restaurant's personality in a few words?"
3. "When a guest has a bad experience, what matters most to you?" (making it right / explaining what happened / inviting them back)

AI uses their answers to generate a voice profile that shapes every auto-generated reply. Also offer tone presets as a fast path fallback: "Professional & Warm", "Casual & Friendly", "Formal & Elevated", "Personal & Heartfelt".

Build note: Store voice profile in Supabase per restaurant. Pass as system prompt context to GPT-4o-mini when generating replies.
