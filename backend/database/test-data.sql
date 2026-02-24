-- Test data for Maitreo (development/testing only)

-- Insert test restaurant
INSERT INTO restaurants (
    business_name,
    business_address,
    owner_name,
    owner_email,
    owner_phone,
    status
) VALUES (
    'Test Pizza Place',
    '123 Main St, New York, NY 10001',
    'Kevin Reyes',
    'support@maitreo.com',
    '+18622901319',
    'pending' -- Will become 'active' after Google OAuth connection
);

-- Note: google_refresh_token and google_location_name will be added via OAuth flow
-- Do not manually insert these - let the OAuth callback handle it
