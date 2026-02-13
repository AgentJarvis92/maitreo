-- Add onboarding tracking columns to restaurants table
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN DEFAULT false;
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS onboarding_complete BOOLEAN DEFAULT false;
