-- Check if Maitreo tables exist
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN ('restaurants', 'reviews', 'sms_interactions', 'weekly_digests')
ORDER BY table_name;
