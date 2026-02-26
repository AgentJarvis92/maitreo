/**
 * Onboarding Service
 * Handles new restaurant sign-ups
 */
import pool from '../db/client.js';
import { Resend } from 'resend';
import dotenv from 'dotenv';
dotenv.config();
let _resend = null;
function getResend() {
    if (!_resend) {
        const key = process.env.RESEND_API_KEY;
        if (!key)
            throw new Error('RESEND_API_KEY not set — cannot send emails');
        _resend = new Resend(key);
    }
    return _resend;
}
const FROM_EMAIL = process.env.FROM_EMAIL || 'noreply@maitreo.com';
/**
 * Validate phone number format (US numbers)
 */
function isValidPhone(phone) {
    // Remove all non-digits
    const digits = phone.replace(/\D/g, '');
    // Should be 10 digits (US) or 11 with leading 1
    return digits.length === 10 || (digits.length === 11 && digits[0] === '1');
}
/**
 * Validate email format
 */
function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}
/**
 * Normalize phone number to E.164 format (+1XXXXXXXXXX)
 */
function normalizePhone(phone) {
    const digits = phone.replace(/\D/g, '');
    if (digits.length === 10) {
        return `+1${digits}`;
    }
    else if (digits.length === 11 && digits[0] === '1') {
        return `+${digits}`;
    }
    return phone;
}
/**
 * Process new restaurant onboarding
 */
export async function processOnboarding(data) {
    try {
        // Validation
        if (!data.name || data.name.trim().length === 0) {
            return {
                success: false,
                message: 'Restaurant name is required',
                error: 'VALIDATION_ERROR'
            };
        }
        if (!data.address || data.address.trim().length === 0) {
            return {
                success: false,
                message: 'Address is required',
                error: 'VALIDATION_ERROR'
            };
        }
        if (!isValidPhone(data.phone)) {
            return {
                success: false,
                message: 'Please enter a valid phone number',
                error: 'VALIDATION_ERROR'
            };
        }
        if (!isValidEmail(data.email)) {
            return {
                success: false,
                message: 'Please enter a valid email address',
                error: 'VALIDATION_ERROR'
            };
        }
        // Check if email already exists
        const existingCheck = await pool.query('SELECT id FROM restaurants WHERE owner_email = $1', [data.email.toLowerCase().trim()]);
        if (existingCheck.rows.length > 0) {
            return {
                success: false,
                message: 'An account with this email already exists',
                error: 'DUPLICATE_EMAIL'
            };
        }
        // Normalize phone number
        const normalizedPhone = normalizePhone(data.phone);
        // Insert new restaurant
        const result = await pool.query(`INSERT INTO restaurants (name, location, owner_phone, owner_email, tier, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       RETURNING id, name, owner_email`, [
            data.name.trim(),
            data.address.trim(),
            normalizedPhone,
            data.email.toLowerCase().trim(),
            'review_drafts' // Default tier (free trial)
        ]);
        const restaurant = result.rows[0];
        // Send welcome email
        try {
            await getResend().emails.send({
                from: FROM_EMAIL,
                to: restaurant.owner_email,
                subject: 'Welcome to Maitreo! 🎉',
                html: generateWelcomeEmail(restaurant.name)
            });
        }
        catch (emailError) {
            console.error('Failed to send welcome email:', emailError);
            // Don't fail the onboarding if email fails
        }
        return {
            success: true,
            message: 'Welcome to Maitreo! Check your email for next steps.',
            restaurantId: restaurant.id
        };
    }
    catch (error) {
        console.error('Onboarding error:', error);
        return {
            success: false,
            message: 'An error occurred during sign-up. Please try again.',
            error: error.message
        };
    }
}
/**
 * Generate welcome email HTML
 */
function generateWelcomeEmail(restaurantName) {
    const baseUrl = process.env.BASE_URL || 'https://maitreo.com';
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to Maitreo</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f8f9fa;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8f9fa; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="padding: 40px 40px 20px; text-align: center; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 8px 8px 0 0;">
              <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 600;">
                Welcome to Maitreo! 🎉
              </h1>
            </td>
          </tr>
          
          <!-- Body -->
          <tr>
            <td style="padding: 40px;">
              <p style="color: #333; font-size: 16px; line-height: 1.6; margin: 0 0 20px;">
                Hi ${restaurantName} team,
              </p>
              
              <p style="color: #333; font-size: 16px; line-height: 1.6; margin: 0 0 20px;">
                Thanks for signing up! We're excited to help you manage your online reputation and never miss another review.
              </p>
              
              <p style="color: #333; font-size: 16px; line-height: 1.6; margin: 0 0 30px;">
                <strong>Next Steps:</strong>
              </p>
              
              <ol style="color: #333; font-size: 16px; line-height: 1.8; margin: 0 0 30px; padding-left: 20px;">
                <li>We'll reach out within 24 hours to connect your Google Business Profile</li>
                <li>Once connected, you'll start receiving review drafts via SMS and email</li>
                <li>Simply approve or edit drafts—we'll post them for you</li>
              </ol>
              
              <div style="background-color: #f8f9fa; border-left: 4px solid #667eea; padding: 20px; margin: 0 0 30px;">
                <p style="color: #333; font-size: 14px; line-height: 1.6; margin: 0;">
                  <strong>💡 Quick Tip:</strong> Your 7-day free trial starts now. No credit card required until you're ready to continue.
                </p>
              </div>
              
              <p style="color: #333; font-size: 16px; line-height: 1.6; margin: 0 0 20px;">
                Questions? Just reply to this email—we're here to help!
              </p>
              
              <p style="color: #333; font-size: 16px; line-height: 1.6; margin: 0;">
                — The Maitreo Team
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 30px 40px; background-color: #f8f9fa; border-radius: 0 0 8px 8px; text-align: center; border-top: 1px solid #e9ecef;">
              <p style="color: #6c757d; font-size: 14px; margin: 0 0 10px;">
                <a href="${baseUrl}" style="color: #667eea; text-decoration: none;">maitreo.com</a>
              </p>
              <p style="color: #6c757d; font-size: 12px; margin: 0;">
                You're receiving this because you signed up for Maitreo.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}
//# sourceMappingURL=onboarding.js.map