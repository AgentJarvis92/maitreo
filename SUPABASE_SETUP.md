# Supabase Database Setup Guide

## Overview

This guide walks through setting up the PostgreSQL database for ReviewReply using Supabase.

**Status**: Manual setup required (Supabase CLI not installed)

---

## Step 1: Create Supabase Project

### Via Web Interface

1. **Go to**: https://supabase.com
2. **Sign in** or create an account (use work email if available)
3. **Click**: "New Project"
4. **Fill in details**:
   - **Organization**: Select existing or create new
   - **Project Name**: `reviewreply`
   - **Database Password**: Generate a strong password (save in password manager!)
   - **Region**: Choose closest to your primary users (e.g., `us-east-1` for East Coast)
   - **Pricing Plan**: Start with Free tier (can upgrade later)
5. **Click**: "Create new project"
6. **Wait**: ~2 minutes for database provisioning

---

## Step 2: Save Connection Details

Once the project is created:

1. **Go to**: Project Settings → Database
2. **Copy the following**:
   - **Host** (e.g., `db.xxxxx.supabase.co`)
   - **Database name** (usually `postgres`)
   - **Port** (default: `5432`)
   - **User** (usually `postgres`)
   - **Password** (the one you set in Step 1)

3. **Build connection string**:
   ```
   postgresql://postgres:[YOUR-PASSWORD]@db.xxxxx.supabase.co:5432/postgres
   ```

4. **Save to `.env` file**:
   ```bash
   cd ~/restaurant-saas/backend
   cp .env.example .env
   echo "DATABASE_URL=postgresql://postgres:[YOUR-PASSWORD]@db.xxxxx.supabase.co:5432/postgres" >> .env
   ```

---

## Step 3: Apply Database Schema

### Option A: Via Supabase SQL Editor (Recommended)

1. **Go to**: Supabase Dashboard → SQL Editor
2. **Click**: "New Query"
3. **Copy contents** of `schema.sql`:
   ```bash
   cat ~/restaurant-saas/backend/schema.sql
   ```
4. **Paste** into SQL Editor
5. **Click**: "Run" (bottom right)
6. **Verify**: Should see "Schema installation complete!" with `table_count = 5`

### Option B: Via Command Line (if `psql` installed)

```bash
cd ~/restaurant-saas/backend

# Test connection
psql "postgresql://postgres:[YOUR-PASSWORD]@db.xxxxx.supabase.co:5432/postgres" -c "SELECT version();"

# Apply schema
psql "postgresql://postgres:[YOUR-PASSWORD]@db.xxxxx.supabase.co:5432/postgres" -f schema.sql
```

### Option C: Via Node.js Script

```bash
cd ~/restaurant-saas/backend

# Install dependencies (if not already done)
npm install

# Run schema migration
node -e "
const { Pool } = require('pg');
const fs = require('fs');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const schema = fs.readFileSync('schema.sql', 'utf8');
pool.query(schema)
  .then(() => console.log('Schema applied successfully!'))
  .catch(err => console.error('Error:', err))
  .finally(() => pool.end());
"
```

---

## Step 4: Verify Installation

Run the following query in Supabase SQL Editor:

```sql
-- Check tables created
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_type = 'BASE TABLE'
ORDER BY table_name;

-- Should return:
-- email_logs
-- newsletters
-- reply_drafts
-- restaurants
-- reviews
```

Check sample data:

```sql
SELECT name, owner_email, tier 
FROM restaurants 
LIMIT 5;
```

Should see one row: "Sample BBQ Pit" (if sample data was included)

---

## Step 5: Configure Row Level Security (Optional - For Production)

If you plan to add user authentication later:

```sql
-- Enable RLS on all tables
ALTER TABLE restaurants ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE reply_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE newsletters ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_logs ENABLE ROW LEVEL SECURITY;

-- Example policy: Restrict restaurants to owner
CREATE POLICY restaurants_owner_policy ON restaurants
    FOR ALL
    USING (owner_email = auth.jwt() ->> 'email');

-- Add similar policies for other tables based on restaurant_id
```

**Note**: Skip this step for MVP/testing. Implement when adding frontend authentication.

---

## Step 6: Update Environment Variables

Update your `~/restaurant-saas/backend/.env` file with all required variables:

```env
# Database (from Step 2)
DATABASE_URL=postgresql://postgres:[PASSWORD]@db.xxxxx.supabase.co:5432/postgres

# OpenAI (for reply generation)
OPENAI_API_KEY=sk-...

# Email (Resend.com)
RESEND_API_KEY=re_...
FROM_EMAIL=noreply@reviewreply.com

# Optional: Platform APIs (for ingestion)
GOOGLE_PLACES_API_KEY=AIza...
YELP_API_KEY=...
```

---

## Step 7: Test Database Connection

```bash
cd ~/restaurant-saas/backend
node -e "
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query('SELECT NOW() as now, version() as version')
  .then(res => {
    console.log('✅ Database connected!');
    console.log('Server time:', res.rows[0].now);
    console.log('PostgreSQL version:', res.rows[0].version.split(',')[0]);
  })
  .catch(err => console.error('❌ Connection failed:', err.message))
  .finally(() => pool.end());
"
```

Expected output:
```
✅ Database connected!
Server time: 2026-02-10T23:15:00.000Z
PostgreSQL version: PostgreSQL 16.x
```

---

## Troubleshooting

### Connection refused
- Check if Supabase project is still provisioning (wait 2-5 min)
- Verify DATABASE_URL is correct
- Check firewall/VPN settings

### Authentication failed
- Double-check password (no special characters that need URL encoding?)
- Try regenerating database password in Supabase settings

### Tables not created
- Check SQL Editor for error messages
- Run schema.sql line by line to identify problematic query
- Ensure UUID extension is enabled: `CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`

### Sample data conflicts
- If re-running schema.sql, comment out or remove the INSERT statements
- Or use: `TRUNCATE TABLE restaurants CASCADE;` before re-inserting

---

## Database Maintenance

### Backups

Supabase automatically backs up your database daily (Free tier: 7-day retention).

To create manual backup:
1. **Go to**: Project Settings → Database → Backups
2. **Click**: "Create backup"

### Migrations

For future schema changes:
1. Create new `.sql` file in `backend/migrations/`
2. Name it with timestamp: `YYYYMMDD_HHMMSS_description.sql`
3. Apply manually or use migration tool (e.g., `node-pg-migrate`)

---

## Next Steps

1. ✅ Verify schema is applied
2. ✅ Test database connection from backend
3. ⬜ Run ingestion job to populate reviews
4. ⬜ Test reply generation service
5. ⬜ Deploy backend to Railway/Render
6. ⬜ Set up cron jobs for automated ingestion

---

## Connection Details Template

```
Project Name: reviewreply
Region: us-east-1 (or your chosen region)
Database Host: db.xxxxx.supabase.co
Database Name: postgres
Port: 5432
User: postgres
Password: [SAVED IN PASSWORD MANAGER]
Connection String: postgresql://postgres:[PASSWORD]@db.xxxxx.supabase.co:5432/postgres
```

---

**Last Updated**: February 10, 2026  
**Status**: Ready for database setup
