# Maitreo V1 Launch Checklist

## 🔴 CRITICAL - Before Public Launch

### Legal Pages
- [ ] **MUST DO:** Get lawyer review OR upgrade to Termly Pro ($15/month)
- [ ] Current terms.html and privacy.html are custom-written (not lawyer-vetted)
- [ ] Safe for pilot (3-5 restaurants) but NOT for scaling
- [ ] Recommendation: Termly Pro before marketing aggressively

### Security
- [ ] Switch Stripe from test mode to live mode
- [ ] Review all API keys and ensure production-ready
- [ ] Test Google OAuth flow with real restaurant accounts
- [ ] Verify encrypted token storage

### Product Stability
- [ ] 3-5 pilot restaurants onboarded without critical bugs
- [ ] Review ingestion reliable
- [ ] SMS command parsing stable
- [ ] Reply posting works consistently
- [ ] Weekly digest sending correctly

### Marketing/Compliance
- [ ] TCPA compliance verified (SMS opt-in/opt-out)
- [ ] CAN-SPAM compliance (email unsubscribe)
- [ ] Google API compliance review
- [ ] Terms of Service finalized

---

## V1 Build Progress

### ✅ Completed
- [x] Landing page (maitreo.com) - LIVE with SSL
- [x] Google OAuth integration
- [x] Custom legal pages (ToS + Privacy)
- [x] SMS & digest system architecture designed

### 🚧 In Progress
- [ ] Review polling system (Phase 2)
- [ ] SMS command system (Phase 3)
- [ ] Weekly digest generator

### 📋 Backlog
- [ ] Internal admin panel
- [ ] Pilot testing (3-5 restaurants)
- [ ] Stripe live mode activation
