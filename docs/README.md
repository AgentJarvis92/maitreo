# Maitreo Documentation

This directory contains design documents and specifications for the Maitreo restaurant review management system.

## SMS Command System (Phase 3 Design)

**Status:** ✅ Design Complete | ⏳ Implementation Pending

### Core Documents

1. **[sms-architecture.md](./sms-architecture.md)** - Complete system architecture
   - Command parser design (fuzzy matching, typo handling)
   - Context tracking system
   - Error handling strategy
   - Security & validation
   - Performance considerations
   - Testing strategy

2. **[sms-templates.json](../sms-templates.json)** - All SMS message templates
   - 20+ pre-written templates
   - Formatting rules
   - Variable specifications
   - Tone guidelines

3. **[sms-state-machine.md](./sms-state-machine.md)** - Context & session management
   - Session state schema
   - State lifecycle & transitions
   - Context resolution algorithm
   - Multi-review queueing
   - Database schemas
   - Background job specs

4. **[SMS_DESIGN_COMPLETE.md](./SMS_DESIGN_COMPLETE.md)** - Implementation roadmap
   - Summary of deliverables
   - Command reference table
   - Files to create
   - Testing requirements
   - Next steps

### Quick Reference

**Commands:**
- APPROVE - Post the AI-generated reply
- EDIT - Request changes to draft
- IGNORE - Skip this review (no reply)
- PAUSE - Pause notifications
- RESUME - Resume notifications
- STATUS - Check account status
- BILLING - Get billing info + Stripe link
- CANCEL - Cancel subscription
- HELP - Show all commands

**Design Principles:**
- Every message is self-contained
- Friendly, casual tone (not corporate)
- Mobile-friendly (short, scannable)
- Every message ends with "Reply HELP anytime."
- Handles typos via fuzzy matching
- Progressive disclosure (one review at a time)

**Implementation Order:**
1. Complete Phase 1 (Twilio setup, database)
2. Review designs with stakeholders
3. Implement Phase 3 (use these docs as spec)
4. Test with real phone numbers
5. Launch pilot

---

**Last Updated:** 2026-02-13  
**Design Author:** Subagent (maitreo-sms-design)
