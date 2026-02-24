# ReviewReply Database Schema

## Overview

PostgreSQL database hosted on Supabase. 11 tables total covering review management, AI reply generation, competitor intelligence, and weekly reporting.

## ERD Diagram

```mermaid
erDiagram
    restaurants ||--o{ reviews : has
    restaurants ||--o{ competitors : tracks
    restaurants ||--o{ patterns : detected_in
    restaurants ||--o{ staff_mentions : extracted_from
    restaurants ||--o{ photo_reviews : has
    restaurants ||--o{ ranking_history : tracked
    restaurants ||--o{ weekly_digests : receives
    restaurants ||--o{ newsletters : receives
    reviews ||--o| reply_drafts : generates
    reviews ||--o{ photo_reviews : contains
    reviews ||--o{ email_logs : triggers
    reply_drafts ||--o{ email_logs : sends
    newsletters ||--o{ email_logs : sends

    restaurants {
        uuid id PK
        varchar name
        varchar location
        varchar owner_email
        jsonb tone_profile_json
        jsonb competitors_json
        varchar google_place_id
        varchar yelp_business_id
        varchar tier
        timestamptz created_at
        timestamptz updated_at
    }

    reviews {
        uuid id PK
        uuid restaurant_id FK
        varchar platform
        varchar review_id
        varchar author
        int rating
        text text
        timestamptz review_date
        jsonb metadata
        timestamptz ingested_at
    }

    reply_drafts {
        uuid id PK
        uuid review_id FK
        text draft_text
        boolean escalation_flag
        jsonb escalation_reasons
        varchar status
        jsonb alternative_drafts
        decimal ai_confidence
        varchar ai_model_version
        timestamptz created_at
        timestamptz updated_at
    }

    competitors {
        uuid id PK
        uuid restaurant_id FK
        text competitor_place_id
        text competitor_name
        decimal distance_miles
        int review_count
        decimal rating
        timestamptz last_checked_at
        timestamptz created_at
    }

    patterns {
        uuid id PK
        uuid restaurant_id FK
        text pattern_type
        text pattern_text
        int mention_count
        timestamptz first_seen_at
        timestamptz last_seen_at
        text status
    }

    staff_mentions {
        uuid id PK
        uuid restaurant_id FK
        text staff_name
        int mention_count
        int positive_count
        int negative_count
        timestamptz last_mentioned_at
        timestamptz created_at
    }

    photo_reviews {
        uuid id PK
        uuid review_id FK
        uuid restaurant_id FK
        text_array photo_urls
        timestamptz uploaded_at
    }

    ranking_history {
        uuid id PK
        uuid restaurant_id FK
        text keyword
        int position
        timestamptz checked_at
    }

    weekly_digests {
        uuid id PK
        uuid restaurant_id FK
        date week_start
        jsonb digest_data
        boolean sms_sent
        boolean email_sent
        text magic_link_token
        timestamptz created_at
    }

    newsletters {
        uuid id PK
        uuid restaurant_id FK
        date week_start_date
        text content_html
        jsonb content_json
        timestamptz sent_at
        timestamptz created_at
    }

    email_logs {
        uuid id PK
        varchar type
        varchar to_email
        varchar subject
        varchar status
        text error_message
        varchar external_id
        uuid review_id FK
        uuid reply_draft_id FK
        uuid newsletter_id FK
        timestamptz sent_at
        timestamptz created_at
    }
```

## Table Descriptions

### Core Tables (Phase 1)
| Table | Purpose |
|-------|---------|
| `restaurants` | Restaurant accounts, brand voice config, platform credentials |
| `reviews` | Ingested reviews from Google, Yelp, etc. |
| `reply_drafts` | AI-generated reply drafts with escalation detection |
| `newsletters` | Weekly competitor intelligence newsletters |
| `email_logs` | Audit log for all outbound emails |

### Intelligence Tables (Phase 2)
| Table | Purpose |
|-------|---------|
| `competitors` | Tracked competitor restaurants with ratings/review counts |
| `patterns` | Recurring themes detected in reviews (complaints, praise, dish mentions) |
| `staff_mentions` | Staff member mentions with sentiment tracking |
| `photo_reviews` | Photos associated with reviews |
| `ranking_history` | Keyword ranking position history for SEO tracking |
| `weekly_digests` | Weekly intelligence digest reports with magic link access |

## Relationships

- All Phase 2 tables reference `restaurants(id)` with `ON DELETE CASCADE`
- `photo_reviews` also references `reviews(id)` with `ON DELETE CASCADE`
- `weekly_digests.magic_link_token` is `UNIQUE` for secure public access

## Index Strategy

| Index | Table | Columns | Purpose |
|-------|-------|---------|---------|
| `idx_competitors_restaurant` | competitors | restaurant_id | Filter by restaurant |
| `idx_patterns_restaurant` | patterns | restaurant_id, status | Active patterns lookup |
| `idx_staff_mentions_restaurant` | staff_mentions | restaurant_id | Staff by restaurant |
| `idx_photo_reviews_restaurant` | photo_reviews | restaurant_id | Photos by restaurant |
| `idx_ranking_history_restaurant` | ranking_history | restaurant_id, checked_at DESC | Recent rankings |
| `idx_weekly_digests_restaurant` | weekly_digests | restaurant_id, week_start DESC | Recent digests |

## Migrations

| File | Description | Date |
|------|-------------|------|
| `schema.sql` | Initial schema (5 tables) | 2026-02-10 |
| `migrations/002_add_intelligence_features.sql` | Phase 2 intelligence tables (6 tables) | 2026-02-11 |

## Service Layer

`src/services/database.js` provides:
- CRUD operations for all tables
- `competitors`, `patterns`, `staffMentions`, `photoReviews`, `rankingHistory`, `weeklyDigests`
- Complex queries via `queries.getDashboard()` and `queries.getReviewsWithPhotos()`
- Transaction helper via `withTransaction()`
