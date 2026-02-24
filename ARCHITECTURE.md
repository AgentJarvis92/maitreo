# System Architecture

Visual overview of the Restaurant SaaS backend system.

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         EXTERNAL SERVICES                            │
├─────────────────────────────────────────────────────────────────────┤
│  Google Reviews  │  Yelp API  │  OpenAI GPT-4  │  Resend Email     │
└─────────────────────────────────────────────────────────────────────┘
           │              │              │                  │
           ▼              ▼              ▼                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      BACKEND SERVICES LAYER                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐  │
│  │ Ingestion Service│  │ Reply Generator  │  │ Email Service    │  │
│  │ (Coming Soon)    │  │ (GPT-4 + Tone)   │  │ (Resend + Track) │  │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘  │
│                                                                       │
│  ┌──────────────────┐                                                │
│  │ Newsletter Gen   │                                                │
│  │ (Competitor AI)  │                                                │
│  └──────────────────┘                                                │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      SCHEDULED JOBS (CRON)                           │
├─────────────────────────────────────────────────────────────────────┤
│  Ingestion Job (every 4h)  │  Newsletter Job (Monday 9am)           │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      DATABASE (PostgreSQL)                           │
├─────────────────────────────────────────────────────────────────────┤
│  restaurants  │  reviews  │  reply_drafts  │  newsletters  │  logs  │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      END USERS (Email)                               │
├─────────────────────────────────────────────────────────────────────┤
│              Restaurant Owners & Managers                            │
└─────────────────────────────────────────────────────────────────────┘
```

## Data Flow

### 1. Review Ingestion Flow

```
┌──────────────┐
│ Google/Yelp  │
│   Reviews    │
└──────┬───────┘
       │ (API Poll - Every 4 hours)
       ▼
┌──────────────┐
│  Ingestion   │──── Check if review exists (dedup)
│     Job      │
└──────┬───────┘
       │ New Review Found
       ▼
┌──────────────┐
│  INSERT      │
│   reviews    │
│   table      │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│    Reply     │──── Fetch restaurant tone profile
│  Generator   │──── Call GPT-4 with context
│  (GPT-4)     │──── Detect escalations
└──────┬───────┘
       │
       ▼
┌──────────────┐
│   INSERT     │
│reply_drafts  │
│   table      │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│    Email     │──── Build HTML email
│   Service    │──── Send via Resend
│              │──── Log to email_logs
└──────┬───────┘
       │
       ▼
┌──────────────┐
│ Restaurant   │
│    Owner     │──── Receives reply draft
│   Inbox      │──── Reviews & posts manually
└──────────────┘
```

### 2. Newsletter Generation Flow

```
┌──────────────┐
│ Monday 9am   │
│   Trigger    │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│ Newsletter   │──── Get all restaurants
│     Job      │
└──────┬───────┘
       │ For each restaurant:
       ▼
┌──────────────┐
│   Query      │──── Get competitor reviews (last 7 days)
│  Database    │──── Join with competitors_json
└──────┬───────┘
       │
       ▼
┌──────────────┐
│ Newsletter   │──── Analyze reviews with GPT-4
│  Generator   │──── Generate insights
│   (GPT-4)    │──── Build HTML email
└──────┬───────┘
       │
       ▼
┌──────────────┐
│   INSERT     │
│ newsletters  │
│    table     │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│    Email     │──── Send newsletter
│   Service    │──── Track delivery
└──────┬───────┘
       │
       ▼
┌──────────────┐
│ Restaurant   │
│    Owner     │──── Reads weekly insights
│   Inbox      │──── Takes action
└──────────────┘
```

## Database Schema

```
┌───────────────────────────────────────────────────────────────────┐
│                        RESTAURANTS                                 │
├───────────────────────────────────────────────────────────────────┤
│ id (PK)                                                            │
│ name                                                               │
│ location                                                           │
│ owner_email                                                        │
│ tone_profile_json ◄── {tone, personality, avoid, emphasis}       │
│ competitors_json  ◄── [{name, platform, id}]                     │
│ created_at, updated_at                                            │
└───────────────┬───────────────────────────────────────────────────┘
                │
                │ 1:N
                ▼
┌───────────────────────────────────────────────────────────────────┐
│                          REVIEWS                                   │
├───────────────────────────────────────────────────────────────────┤
│ id (PK)                                                            │
│ restaurant_id (FK) ──────────────────────┐                        │
│ platform (google, yelp, etc.)            │                        │
│ review_id                                │                        │
│ author                                   │                        │
│ rating (1-5)                             │                        │
│ text                                     │                        │
│ review_date                              │                        │
│ ingested_at                              │                        │
│ metadata (JSONB)                         │                        │
│ UNIQUE(platform, review_id) ◄── Dedup   │                        │
└───────────────┬──────────────────────────┘                        │
                │                                                    │
                │ 1:N                                                │
                ▼                                                    │
┌───────────────────────────────────────────────────────────────────┤
│                       REPLY_DRAFTS                                 │
├───────────────────────────────────────────────────────────────────┤
│ id (PK)                                                            │
│ review_id (FK) ──────────────────────────┐                        │
│ draft_text                               │                        │
│ escalation_flag (boolean)                │                        │
│ escalation_reasons (JSONB array)         │                        │
│ status (pending/approved/rejected/sent)  │                        │
│ created_at, updated_at, approved_at      │                        │
└──────────────────────────────────────────┘                        │
                                                                     │
                ┌────────────────────────────────────────────────────┘
                │ 1:N
                ▼
┌───────────────────────────────────────────────────────────────────┐
│                       NEWSLETTERS                                  │
├───────────────────────────────────────────────────────────────────┤
│ id (PK)                                                            │
│ restaurant_id (FK)                                                 │
│ week_start_date                                                    │
│ content_html (email body)                                          │
│ content_json (structured data)                                     │
│ sent_at                                                            │
│ created_at                                                         │
│ UNIQUE(restaurant_id, week_start_date) ◄── One per week          │
└───────────────────────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────────────────┐
│                        EMAIL_LOGS                                  │
├───────────────────────────────────────────────────────────────────┤
│ id (PK)                                                            │
│ type (reply_draft / newsletter / notification)                    │
│ to_email                                                           │
│ subject                                                            │
│ status (pending / sent / failed / bounced)                        │
│ sent_at                                                            │
│ error_message                                                      │
│ review_id (FK, nullable)                                           │
│ reply_draft_id (FK, nullable)                                      │
│ newsletter_id (FK, nullable)                                       │
│ created_at                                                         │
└───────────────────────────────────────────────────────────────────┘
```

## Service Layer Architecture

### Reply Generator Service

```
Input: { review, restaurant }
   │
   ▼
┌─────────────────────┐
│ Detect Escalations  │──── Scan for keywords
│                     │──── health, legal, threats, etc.
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Build GPT Prompt    │──── System: tone profile
│                     │──── User: review details
│                     │──── Context: escalations
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Call OpenAI GPT-4   │──── Temperature: 0.7
│                     │──── Max tokens: 500
│                     │──── Request 2 options
└──────────┬──────────┘
           │
           ▼
Output: { draft_text, escalation_flag, escalation_reasons, confidence }
```

### Email Service

```
Input: { owner_email, review, reply_draft }
   │
   ▼
┌─────────────────────┐
│ Build HTML Template │──── Review context
│                     │──── Reply options
│                     │──── Escalation alerts
│                     │──── Platform links
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Log Email (pending) │──── INSERT email_logs
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Send via Resend API │──── HTTP POST
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Update Log (sent)   │──── UPDATE email_logs
│     or (failed)     │──── Store error if any
└─────────────────────┘
```

## Deployment Architecture

### Railway Option

```
┌─────────────────────────────────────────────┐
│             Railway Platform                 │
├─────────────────────────────────────────────┤
│                                              │
│  ┌──────────────────────────────────────┐  │
│  │  Web Service (HTTP Server)           │  │
│  │  - Health checks                     │  │
│  │  - Manual job triggers               │  │
│  │  PORT: 3000                          │  │
│  └──────────────────────────────────────┘  │
│                                              │
│  ┌──────────────────────────────────────┐  │
│  │  Cron: Ingestion (Every 4h)          │  │
│  │  node dist/jobs/ingestion.js         │  │
│  └──────────────────────────────────────┘  │
│                                              │
│  ┌──────────────────────────────────────┐  │
│  │  Cron: Newsletter (Mon 9am)          │  │
│  │  node dist/jobs/newsletter.js        │  │
│  └──────────────────────────────────────┘  │
│                                              │
│  ┌──────────────────────────────────────┐  │
│  │  PostgreSQL Database                 │  │
│  │  - Auto-provisioned                  │  │
│  │  - Backups enabled                   │  │
│  └──────────────────────────────────────┘  │
│                                              │
└─────────────────────────────────────────────┘
```

### GitHub Actions Option

```
┌─────────────────────────────────────────────┐
│            GitHub Repository                 │
├─────────────────────────────────────────────┤
│                                              │
│  ┌──────────────────────────────────────┐  │
│  │  .github/workflows/                  │  │
│  │  ├── ingestion-cron.yml              │  │
│  │  │   schedule: "0 */4 * * *"         │  │
│  │  │   runs: ingestion job             │  │
│  │  │                                    │  │
│  │  └── newsletter-cron.yml             │  │
│  │      schedule: "0 9 * * 1"           │  │
│  │      runs: newsletter job            │  │
│  └──────────────────────────────────────┘  │
│                                              │
│  Secrets (encrypted):                       │
│  - DATABASE_URL                             │
│  - OPENAI_API_KEY                           │
│  - RESEND_API_KEY                           │
│  - FROM_EMAIL                               │
│                                              │
└─────────────────────────────────────────────┘
           │
           │ Connects to external DB
           ▼
┌─────────────────────────────────────────────┐
│      External PostgreSQL (Supabase)         │
└─────────────────────────────────────────────┘
```

## Technology Stack

```
┌─────────────────────────────────────────────┐
│               Frontend (Future)              │
│  React / Next.js / Dashboard UI             │
└─────────────────┬───────────────────────────┘
                  │ REST API (Future)
                  ▼
┌─────────────────────────────────────────────┐
│              Backend Services                │
│  Node.js 20+ | TypeScript 5.x               │
│  ┌─────────────────────────────────────┐   │
│  │ Services Layer                      │   │
│  │ - Reply Generator (GPT-4)           │   │
│  │ - Email Service (Resend)            │   │
│  │ - Newsletter Generator              │   │
│  └─────────────────────────────────────┘   │
│  ┌─────────────────────────────────────┐   │
│  │ Jobs Layer                          │   │
│  │ - Ingestion Job (4h)                │   │
│  │ - Newsletter Job (Mon 9am)          │   │
│  └─────────────────────────────────────┘   │
└─────────────────┬───────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────┐
│            Database Layer                    │
│  PostgreSQL 16+ (node-postgres client)      │
│  - Connection pooling                       │
│  - Transaction support                      │
│  - Parameterized queries                    │
└─────────────────┬───────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────┐
│          External Integrations               │
│  ┌────────────┐ ┌────────────┐             │
│  │ OpenAI API │ │ Resend API │             │
│  │ GPT-4      │ │ Email      │             │
│  └────────────┘ └────────────┘             │
│  ┌────────────┐ ┌────────────┐             │
│  │ Google API │ │  Yelp API  │ (Future)    │
│  │ Reviews    │ │  Reviews   │             │
│  └────────────┘ └────────────┘             │
└─────────────────────────────────────────────┘
```

## Security Architecture

```
┌─────────────────────────────────────────────┐
│          Environment Variables               │
│  (Railway Secrets / GitHub Secrets)         │
├─────────────────────────────────────────────┤
│  DATABASE_URL      (PostgreSQL connection)  │
│  OPENAI_API_KEY    (GPT-4 access)           │
│  RESEND_API_KEY    (Email sending)          │
│  FROM_EMAIL        (Verified domain)        │
└─────────────────┬───────────────────────────┘
                  │ Injected at runtime
                  ▼
┌─────────────────────────────────────────────┐
│          Application Security                │
├─────────────────────────────────────────────┤
│  ✓ No credentials in code                   │
│  ✓ Parameterized SQL (injection safe)       │
│  ✓ SSL/TLS for database (production)        │
│  ✓ Email logging for audit trail            │
│  ✓ Escalation flags for sensitive content   │
│  ✓ Rate limiting on email sending           │
└─────────────────────────────────────────────┘
```

---

## Key Design Decisions

### 1. **Why TypeScript?**
- Type safety reduces runtime errors
- Better IDE support and autocomplete
- Easier refactoring and maintenance

### 2. **Why Node.js over Python?**
- Faster deployment with single runtime
- Better async I/O for API calls
- Unified language with potential frontend

### 3. **Why Separate Services?**
- Modularity: Easy to test and replace
- Single Responsibility Principle
- Can scale services independently

### 4. **Why Cron over Real-time Webhooks?**
- Simpler to implement and debug
- Batch processing more efficient
- 4-hour lag acceptable for reply drafts
- Reduces API calls to review platforms

### 5. **Why Store Emails in Logs?**
- Audit trail for compliance
- Debugging failed deliveries
- Analytics on email performance
- Resend recovery if needed

### 6. **Why JSONB for Profiles/Competitors?**
- Flexible schema (can add fields without migration)
- Easy to query with PostgreSQL JSON operators
- Keeps related data together
- Supports complex nested structures

---

**Last Updated**: February 10, 2026  
**Version**: 1.0.0
