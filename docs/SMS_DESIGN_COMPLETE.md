# SMS Command System Design - COMPLETE ✅

**Completed:** 2026-02-13  
**Subagent:** maitreo-sms-design  
**Status:** Ready for Phase 3 Implementation

---

## Deliverables

### 1. Architecture Document ✅
**File:** `~/restaurant-saas/docs/sms-architecture.md`

**Contains:**
- Command parser design (fuzzy matching, typo handling)
- Context tracking system
- Error handling strategy
- Security & validation approach
- Performance considerations
- Testing strategy
- Metrics & monitoring plan

**Key Features:**
- Case-insensitive matching
- Levenshtein distance ≤ 2 for typo correction
- Multi-word command support ("EDIT make it friendlier")
- Context resolution for multi-review scenarios
- 24-hour review expiry
- Redis caching for performance

### 2. Message Templates ✅
**File:** `~/restaurant-saas/sms-templates.json`

**Contains 20+ templates:**
- New review notifications (single & multiple)
- Command confirmations (APPROVE, EDIT, IGNORE, PAUSE, RESUME)
- Account management (STATUS, BILLING, CANCEL)
- Error messages (expired, no context, already handled)
- Help messages
- Onboarding & test messages

**Formatting rules included:**
- Max 1600 chars (concatenated SMS limit)
- Emoji usage guide
- Tone guidelines (friendly, casual, not corporate)
- Every message ends with "Reply HELP anytime."

### 3. State Machine Design ✅
**File:** `~/restaurant-saas/docs/sms-state-machine.md`

**Contains:**
- Session state schema (PostgreSQL + Redis)
- State lifecycle (creation, review addition, handling, expiry)
- Context resolution algorithm
- Multi-review queueing strategy (prevent spam)
- 8 edge cases with error handling
- Database schema (sms_sessions, sms_logs)
- Background job specifications

**Key Design Decisions:**
- One session per phone number
- Progressive disclosure (one review notification at a time)
- Auto-escalation after 5 min if user doesn't respond
- 24h review expiry, 7-day session cleanup
- Write-through caching (Redis + PostgreSQL)

---

## Command Reference

| Command | Context Required? | Subscription Required? | Fuzzy Match Examples |
|---------|-------------------|------------------------|---------------------|
| APPROVE | Yes | Yes | APROVE, APPROV, APP |
| EDIT | Yes | Yes | EDUT, EDT |
| IGNORE | Yes | Yes | IGNOR, IGN |
| PAUSE | No | Yes | PAUS |
| RESUME | No | Yes | RESUNE, RESUM |
| STATUS | No | No | STATIS, STAT |
| BILLING | No | No | BILLIG, BILL |
| CANCEL | No | No | CANCLE, CAN |
| HELP | No | No | HLP |

---

## Implementation Roadmap (Phase 3)

### Files to Create

1. **Parser:**
   - `~/restaurant-saas/services/sms/parser.js` - Command parsing logic

2. **Session Manager:**
   - `~/restaurant-saas/services/sms/session.js` - State management

3. **Command Handlers:**
   - `~/restaurant-saas/services/sms/commands/approve.js`
   - `~/restaurant-saas/services/sms/commands/edit.js`
   - `~/restaurant-saas/services/sms/commands/ignore.js`
   - `~/restaurant-saas/services/sms/commands/pause.js`
   - `~/restaurant-saas/services/sms/commands/resume.js`
   - `~/restaurant-saas/services/sms/commands/status.js`
   - `~/restaurant-saas/services/sms/commands/billing.js`
   - `~/restaurant-saas/services/sms/commands/cancel.js`
   - `~/restaurant-saas/services/sms/commands/help.js`

4. **Webhook Endpoint:**
   - `~/restaurant-saas/pages/api/sms/webhook.js` - Twilio incoming SMS

5. **Background Jobs:**
   - `~/restaurant-saas/jobs/sms-cleanup.js` - Expire reviews & sessions
   - `~/restaurant-saas/jobs/sms-retry.js` - Retry failed sends

6. **Database Migrations:**
   - Create `sms_sessions` table
   - Create `sms_logs` table
   - Add indexes (phone_number, restaurant_id, last_interaction)

7. **Utilities:**
   - `~/restaurant-saas/lib/fuzzy-match.js` - Levenshtein distance
   - `~/restaurant-saas/lib/sms-format.js` - Template rendering

---

## Testing Requirements

### Unit Tests
- [ ] Command parser (exact, fuzzy, unknown)
- [ ] Context resolution (single, multiple, none)
- [ ] Fuzzy matching (typos)
- [ ] Template rendering

### Integration Tests
- [ ] Full flow: review → SMS → approve → reply posted
- [ ] Multi-review queue management
- [ ] PAUSE → review arrives → no SMS → RESUME → SMS sent
- [ ] Session expiry (24h reviews, 7d sessions)

### Manual QA
- [ ] Real phone number + Twilio
- [ ] Test all 9 commands
- [ ] Test typos (APROVE, EDUT, etc.)
- [ ] Test edge cases (expired, no context, multiple reviews)

---

## Dependencies

**Phase 1 must be complete before implementing:**
- ✅ Database schema (restaurants, reviews, responses)
- ✅ OpenAI integration (for EDIT regeneration)
- ⏳ Twilio account setup (for sending SMS)

**Redis required:**
- Install locally or use hosted (Upstash, Redis Cloud)
- Configure connection in .env

**Libraries needed:**
```bash
npm install twilio redis
npm install --save-dev jest
```

---

## Design Principles Applied

✅ **Self-contained messages** - Every SMS includes context  
✅ **Forgiving parser** - Handles typos and case variations  
✅ **Clear next steps** - Every message shows what to do  
✅ **Friendly tone** - Casual, helpful, not corporate  
✅ **Mobile-first** - Short, scannable messages  
✅ **Always helpful** - Every message ends with "Reply HELP anytime."

---

## Metrics to Track (Post-Launch)

- Command usage distribution (which commands most popular?)
- Time to action (review received → user response)
- Edit rate (% of drafts that need editing)
- Expiry rate (% of reviews that expire unhandled)
- PAUSE usage (% of users who pause notifications)
- Error rate (Twilio failures, context errors)

---

## Next Steps

1. **Review designs with Kevin** ✅ (awaiting feedback)
2. **Complete Phase 1** (Twilio setup, database ready)
3. **Implement Phase 3** (use these design docs as spec)
4. **Test with real phone numbers**
5. **Launch pilot with 3-5 restaurants**

---

**Design Status:** COMPLETE ✅  
**Ready for Implementation:** YES  
**Estimated Implementation Time:** 2-3 days (Phase 3 timeline)
