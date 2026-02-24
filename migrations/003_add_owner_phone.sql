-- Migration: 003_add_owner_phone
-- Date: 2026-02-11
-- Description: Add owner_phone to restaurants for SMS approval flow

ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS owner_phone VARCHAR(20);
CREATE INDEX IF NOT EXISTS idx_restaurants_owner_phone ON restaurants(owner_phone);
