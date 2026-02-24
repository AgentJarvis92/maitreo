# Maitreo QA Checklist

## Landing Page (maitreo.com)
- [x] Desktop version loads
- [x] Mobile version loads
- [x] "Start Free Trial" button works (all 3 on mobile, 2 on desktop)
- [x] Onboarding page loads
- [x] Terms of Service link works (maitreo.com/terms)
- [x] Privacy Policy link works (maitreo.com/privacy)
- [ ] Contact link works (support@maitreo.com)
- [ ] All sections scroll properly
- [ ] All images load
- [ ] Mobile responsive behavior

## Legal Pages
- [x] maitreo.com/terms - loads and displays correctly
- [x] maitreo.com/privacy - loads and displays correctly
- [ ] "Back to Maitreo" link works on both pages
- [ ] Mobile responsive on both pages

## Onboarding Flow
- [ ] Step 1: Form validation works
- [ ] Step 2: Business verification (if implemented)
- [ ] Step 3: Google OAuth connection
- [ ] Step 4: Stripe payment (test mode)
- [ ] Step 5: Confirmation
- [ ] Error handling for each step
- [ ] "Back" navigation works

## Phase 1: Google OAuth Integration
**Status: Built but UNTESTED**

- [ ] OAuth authorization URL generates correctly
- [ ] Google consent screen appears
- [ ] Callback handles auth code
- [ ] Access token retrieved
- [ ] Refresh token stored encrypted
- [ ] Can fetch reviews from Google Business Profile API
- [ ] Can post replies to Google Business Profile API
- [ ] Token refresh works when access token expires
- [ ] Error handling for OAuth failures

**Test Requirements:**
- Real Google Business Profile account
- Test restaurant with existing reviews
- Supabase database set up

## Phase 2: Review Polling System
**Status: Built but UNTESTED**

- [ ] Server starts without errors
- [ ] Health check endpoint works (GET /health)
- [ ] Polling service starts automatically
- [ ] Can fetch active restaurants from database
- [ ] Can decrypt OAuth refresh tokens
- [ ] Can call Google Business Profile API
- [ ] Detects new reviews correctly
- [ ] Classifies sentiment (4-5★ = positive, 1-3★ = negative)
- [ ] Stores reviews in Supabase
- [ ] Sends SMS alerts for negative reviews via Twilio
- [ ] Updates last_polled_at timestamp
- [ ] Handles OAuth refresh errors gracefully
- [ ] Handles API rate limits
- [ ] Handles SMS send failures
- [ ] Promise.allSettled prevents one failure from stopping others
- [ ] Poll cycle logs summary correctly

**Test Requirements:**
- Supabase database with `restaurants` and `reviews` tables
- At least 1 test restaurant with Google OAuth connected
- Twilio account configured
- .env file with all credentials
- Node.js dependencies installed

## Phase 3: SMS Command System
**Status: Not built yet**

## Backend Infrastructure
- [ ] Dependencies installed (npm install)
- [ ] .env file configured with all keys
- [ ] Supabase tables created (restaurants, reviews, etc.)
- [ ] Server starts without errors
- [ ] No console errors or warnings

## End-to-End Test
- [ ] User signs up on maitreo.com
- [ ] Connects Google Business Profile
- [ ] Stripe payment processes (test mode)
- [ ] Polling begins within 5 minutes
- [ ] New review detected and stored
- [ ] SMS alert sent for negative review
- [ ] User replies APPROVE
- [ ] Response posted to Google

---

## Critical Issues Found
*(None yet - need to start testing)*

## Known Limitations
- Legal pages are custom-written, not lawyer-vetted (upgrade to Termly Pro before public launch)
- Phase 1 and 2 built but not tested with real data
- No error logging/monitoring set up yet
- No admin dashboard for managing customers

---

**QA Status: 5% Complete**
- Landing page buttons: ✅ Tested
- Onboarding page loads: ✅ Tested  
- Everything else: ❌ Untested
