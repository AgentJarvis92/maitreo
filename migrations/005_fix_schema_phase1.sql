-- Fix schema issues blocking Phase 1

-- 1. Add google_location_name to customers (if missing)
ALTER TABLE customers ADD COLUMN IF NOT EXISTS google_location_name VARCHAR(255);

-- 2. Add customer_id to reviews table (if missing)
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS customer_id UUID;

-- 3. Add status column to restaurants for review-poller queries
-- Note: restaurants table may have been renamed to restaurant_config
-- Check which exists and add status to it
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'restaurants') THEN
    ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'active';
  ELSIF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'restaurant_config') THEN
    ALTER TABLE restaurant_config ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'active';
  END IF;
END $$;
