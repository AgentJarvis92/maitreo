# Database Migration Required

## Action Needed

The new crisis detection and competitor tracking features require database tables.

### How to Run Migration

1. Go to https://app.supabase.com
2. Select your project (cykzsgignbifzjavzcbo)
3. Go to **SQL Editor** (left sidebar)
4. Click **New Query**
5. Copy and paste the contents of `migrations/004_crisis_and_competitor_tables.sql`
6. Click **Run** or press Cmd/Ctrl + Enter

### What This Creates

- **crisis_alerts table** - Tracks crisis events and SMS alerts
- **competitor_snapshots table** - Stores historical competitor data for trend analysis
- Indexes for efficient querying

### After Migration

Once the migration is complete, the following features will work:
- Crisis mode detection with SMS alerts
- Competitor tracking and growth anomaly detection
- Historical competitor metrics

### Alternative: Use Supabase CLI

If you have the Supabase CLI installed:

```bash
supabase db push --file migrations/004_crisis_and_competitor_tables.sql
```
