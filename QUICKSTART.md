# Quick Start Guide

Get the Restaurant SaaS backend running in 5 minutes.

## Prerequisites

- Node.js 20+
- PostgreSQL database (or Supabase account)
- OpenAI API key ([get one](https://platform.openai.com/api-keys))
- Resend API key ([get one](https://resend.com/api-keys))

## 1. Run Setup Script

```bash
cd ~/restaurant-saas/backend
./scripts/setup.sh
```

This will:
- Check Node.js version
- Create `.env` from template
- Install dependencies
- Build TypeScript
- Run database migrations
- Optionally load seed data

## 2. Configure Environment

Edit `.env` with your credentials:

```bash
# Required
DATABASE_URL=postgresql://user:password@host:5432/database
OPENAI_API_KEY=sk-...
RESEND_API_KEY=re_...
FROM_EMAIL=noreply@yourdomain.com

# Optional
NODE_ENV=development
PORT=3000
```

### Using Supabase?

```bash
DATABASE_URL=postgresql://postgres:[YOUR-PASSWORD]@db.[YOUR-PROJECT].supabase.co:5432/postgres
```

## 3. Start Development Server

```bash
npm run dev
```

Server runs on `http://localhost:3000`

Test: `curl http://localhost:3000/health`

## 4. Test the System

### Load Sample Data
```bash
psql $DATABASE_URL -f scripts/seed-data.sql
```

Creates:
- 2 sample restaurants
- 5 sample reviews (including escalations)

### Run Ingestion Job
```bash
npm run ingestion
```

This will:
- Process reviews
- Generate reply drafts with GPT-4
- Send emails to restaurant owners
- Log everything to database

### Run Newsletter Job
```bash
npm run newsletter
```

Generates weekly competitive intelligence reports.

## 5. Check Results

```sql
-- View generated reply drafts
SELECT r.text as review, rd.draft_text as reply, rd.escalation_flag
FROM reply_drafts rd
JOIN reviews r ON rd.review_id = r.id
ORDER BY rd.created_at DESC;

-- View sent emails
SELECT type, to_email, subject, status, sent_at
FROM email_logs
ORDER BY created_at DESC;

-- View newsletters
SELECT restaurant_id, week_start_date, sent_at
FROM newsletters
ORDER BY created_at DESC;
```

## 6. Deploy (Optional)

### Railway
```bash
npm i -g @railway/cli
railway login
railway up
```

### Render
```bash
# Push to GitHub, connect to Render
# render.yaml is already configured
```

### GitHub Actions
```bash
# Push to GitHub
# Add secrets: DATABASE_URL, OPENAI_API_KEY, RESEND_API_KEY, FROM_EMAIL
# Jobs run automatically on schedule
```

## Common Commands

```bash
# Development
npm run dev              # Start dev server (hot reload)
npm run build            # Build TypeScript
npm start                # Run production build

# Database
npm run db:migrate       # Run migrations

# Jobs
npm run ingestion        # Process reviews
npm run newsletter       # Generate newsletters

# Testing
curl http://localhost:3000/health
curl -X POST http://localhost:3000/jobs/ingestion/run
curl -X POST http://localhost:3000/jobs/newsletter/run
```

## Troubleshooting

### Database Connection Error
```bash
# Test connection
psql $DATABASE_URL -c "SELECT 1"

# Check .env has correct DATABASE_URL
cat .env | grep DATABASE_URL
```

### TypeScript Build Errors
```bash
# Clean and rebuild
rm -rf dist/
npm run build
```

### Email Not Sending
```bash
# Check Resend API key is valid
# Verify FROM_EMAIL domain is verified in Resend dashboard
# Check email_logs table for errors:
psql $DATABASE_URL -c "SELECT * FROM email_logs WHERE status = 'failed';"
```

### OpenAI Rate Limit
```bash
# Check OpenAI dashboard for usage
# Reduce batch size or add delays
```

## Next Steps

1. **Read** `README.md` for comprehensive documentation
2. **Review** `PROJECT_STATUS.md` for implementation details
3. **Wait** for data-api-agent to provide review ingestion APIs
4. **Deploy** to production when ready

## Support

- Check logs with `npm run dev`
- Query database for debugging
- Review `email_logs` and `reply_drafts` tables
- See README.md for detailed troubleshooting

---

**You're all set!** 🎉

The backend is ready to process reviews, generate replies, and send newsletters.
