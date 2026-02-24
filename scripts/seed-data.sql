-- Seed Data for Testing
-- Run with: psql $DATABASE_URL -f scripts/seed-data.sql

-- Sample Restaurant 1: Pizza Paradise
INSERT INTO restaurants (name, location, owner_email, tone_profile_json, competitors_json)
VALUES (
  'Pizza Paradise',
  'Brooklyn, NY',
  'owner@pizzaparadise.com',
  '{
    "tone": "friendly",
    "personality": ["warm", "family-oriented", "authentic"],
    "avoid": ["corporate speak", "excessive formality"],
    "emphasis": ["quality ingredients", "family recipes", "community"],
    "signature": "Hope to see you soon! - The Pizza Paradise Family"
  }',
  '[
    {"name": "Joe''s Pizza", "platform": "google", "id": "ChIJN1t_tDeuEmsRUsoyG83frY4"},
    {"name": "Artichoke Basille''s", "platform": "yelp", "id": "artichoke-basilles-pizza-new-york"},
    {"name": "Prince Street Pizza", "platform": "google", "id": "ChIJrwdtDT1ZwokRqKKKvfS3Zyk"}
  ]'
) RETURNING id;

-- Sample Restaurant 2: Sushi Spot
INSERT INTO restaurants (name, location, owner_email, tone_profile_json, competitors_json)
VALUES (
  'Sushi Spot',
  'San Francisco, CA',
  'manager@sushistpot.com',
  '{
    "tone": "professional",
    "personality": ["refined", "attentive", "detail-oriented"],
    "avoid": ["slang", "overly casual"],
    "emphasis": ["fresh fish", "traditional technique", "seasonal ingredients"],
    "signature": "Thank you for dining with us."
  }',
  '[
    {"name": "Kusakabe", "platform": "google", "id": "ChIJpZwdtDeuEmsRUsoyG83frY4"},
    {"name": "Omakase", "platform": "yelp", "id": "omakase-san-francisco"}
  ]'
);

-- Sample Reviews for Pizza Paradise
-- Get the restaurant_id first, then insert reviews
DO $$
DECLARE
  pizza_paradise_id UUID;
BEGIN
  SELECT id INTO pizza_paradise_id FROM restaurants WHERE name = 'Pizza Paradise' LIMIT 1;

  -- Positive review
  INSERT INTO reviews (restaurant_id, platform, review_id, author, rating, text, review_date)
  VALUES (
    pizza_paradise_id,
    'google',
    'review-001',
    'Sarah Johnson',
    5,
    'Absolutely amazing! The margherita pizza was perfection. Crispy crust, fresh basil, and the best mozzarella I''ve had in years. The staff was super friendly too. Will definitely be back!',
    NOW() - INTERVAL '2 days'
  );

  -- Moderate negative review
  INSERT INTO reviews (restaurant_id, platform, review_id, author, rating, text, review_date)
  VALUES (
    pizza_paradise_id,
    'yelp',
    'review-002',
    'Mike Chen',
    3,
    'Pizza was good but service was slow. We waited 45 minutes for our order. The taste was great though, just wish they were more efficient during busy hours.',
    NOW() - INTERVAL '1 day'
  );

  -- Review with escalation (refund request)
  INSERT INTO reviews (restaurant_id, platform, review_id, author, rating, text, review_date)
  VALUES (
    pizza_paradise_id,
    'google',
    'review-003',
    'Karen Smith',
    1,
    'Worst experience ever! Pizza was cold, wrong toppings, and the manager was rude when I complained. I want a full refund and will never come back. Warning others to avoid this place!',
    NOW() - INTERVAL '6 hours'
  );

  -- Review with health concern (escalation)
  INSERT INTO reviews (restaurant_id, platform, review_id, author, rating, text, review_date)
  VALUES (
    pizza_paradise_id,
    'yelp',
    'review-004',
    'Anonymous',
    1,
    'Got food poisoning from the pepperoni pizza. Was sick all night. Very concerned about their hygiene standards. Contacted the health department.',
    NOW() - INTERVAL '3 hours'
  );

  -- Another positive
  INSERT INTO reviews (restaurant_id, platform, review_id, author, rating, text, review_date)
  VALUES (
    pizza_paradise_id,
    'google',
    'review-005',
    'Tom Rodriguez',
    5,
    'Best pizza in Brooklyn! Been coming here for years and they never disappoint. Love the atmosphere and the quality is always consistent.',
    NOW() - INTERVAL '5 days'
  );

END $$;

-- Note: Reply drafts will be generated automatically by the ingestion job
-- This seed data is just for reviews to test the system

SELECT 
  r.name as restaurant,
  COUNT(rev.*) as review_count,
  ROUND(AVG(rev.rating), 2) as avg_rating
FROM restaurants r
LEFT JOIN reviews rev ON r.id = rev.restaurant_id
GROUP BY r.id, r.name;

SELECT 'Seed data inserted successfully!' as status;
