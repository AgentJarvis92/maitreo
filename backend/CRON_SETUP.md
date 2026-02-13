# ReviewReply Cron Setup

## 📅 Automated Review Checking

The ReviewReply backend automatically checks for new reviews every 15 minutes.

## ✅ Current Status

**Cron Job:** `ReviewReply - Check for New Reviews`
- **Schedule:** Every 15 minutes (900,000ms)
- **Action:** Fetches new Google reviews, processes through pipeline, sends SMS for negative reviews
- **Notifications:** Results sent to iMessage (+18622901319)

## 🧪 Manual Testing

### Test the cron job manually:
```bash
cd ~/restaurant-saas/backend
npx tsx cron-review-checker.ts
```

### Test with a specific restaurant:
```bash
cd ~/restaurant-saas/backend
npx tsx run-live-test.ts
```

## 📊 What Happens Every 15 Minutes

1. **Fetch reviews** from Google Places API for all configured restaurants
2. **Sync to database** (skip duplicates)
3. **Process new reviews:**
   - 4-5★ → Auto-post reply (mock for now)
   - 1-3★ → Send SMS approval request to owner
4. **Send summary** via iMessage with:
   - Number of new reviews
   - How many auto-posted
   - How many SMS approvals sent
   - Any errors

## 🔧 Manage Cron Jobs

### List all cron jobs:
```bash
openclaw cron list
```

### Disable the review checker:
```bash
openclaw cron update d2b962b0-d61e-4f43-abba-dca302c65f8c --enabled=false
```

### Enable it again:
```bash
openclaw cron update d2b962b0-d61e-4f43-abba-dca302c65f8c --enabled=true
```

### Delete the job:
```bash
openclaw cron remove d2b962b0-d61e-4f43-abba-dca302c65f8c
```

## 📝 Logs

Cron execution logs are stored in:
```
~/restaurant-saas/backend/logs/cron-review-checker.log
```

View recent logs:
```bash
tail -f ~/restaurant-saas/backend/logs/cron-review-checker.log
```

## 🚀 Next Steps

1. **Add more restaurants** to the database
2. **Enable real posting** to Google (swap mock with actual API)
3. **Add webhook** to handle SMS replies (YES/NO/EDIT)
4. **Connect OpenAI** for real AI replies (when billing activates)

## 📱 SMS Approval Flow

When a negative review (1-3★) comes in:

1. **Cron job detects it**
2. **Mock reply generated** (template-based)
3. **SMS sent to owner** with:
   - Review rating & text
   - Draft reply
   - Options: YES/NO/EDIT
4. **Owner approves** via SMS
5. **Reply posted** to Google

Currently in **MOCK MODE** - replies are not actually posted to Google yet.
