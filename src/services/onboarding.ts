/**
 * Onboarding Service
 * Handles new restaurant sign-ups.
 * NOTE: No email is sent here. The activation email fires via the
 * Stripe `customer.subscription.created` webhook in src/routes/webhooks.ts.
 */

import pool from '../db/client.js';
import dotenv from 'dotenv';

dotenv.config();

export interface OnboardingData {
  name: string;
  address: string;
  phone: string;
  email: string;
}

export interface OnboardingResult {
  success: boolean;
  message: string;
  restaurantId?: string;
  error?: string;
}

/**
 * Validate phone number format (US numbers)
 */
function isValidPhone(phone: string): boolean {
  // Remove all non-digits
  const digits = phone.replace(/\D/g, '');
  // Should be 10 digits (US) or 11 with leading 1
  return digits.length === 10 || (digits.length === 11 && digits[0] === '1');
}

/**
 * Validate email format
 */
function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Normalize phone number to E.164 format (+1XXXXXXXXXX)
 */
function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) {
    return `+1${digits}`;
  } else if (digits.length === 11 && digits[0] === '1') {
    return `+${digits}`;
  }
  return phone;
}

/**
 * Process new restaurant onboarding
 */
export async function processOnboarding(data: OnboardingData): Promise<OnboardingResult> {
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
    const existingCheck = await pool.query(
      'SELECT id FROM restaurants WHERE owner_email = $1',
      [data.email.toLowerCase().trim()]
    );

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
    const result = await pool.query(
      `INSERT INTO restaurants (name, location, owner_phone, owner_email, tier, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       RETURNING id, name, owner_email`,
      [
        data.name.trim(),
        data.address.trim(),
        normalizedPhone,
        data.email.toLowerCase().trim(),
        'review_drafts' // Default tier (free trial)
      ]
    );

    const restaurant = result.rows[0];

    return {
      success: true,
      message: 'Account created. Complete your subscription to activate monitoring.',
      restaurantId: restaurant.id
    };

  } catch (error: any) {
    console.error('Onboarding error:', error);
    return {
      success: false,
      message: 'An error occurred during sign-up. Please try again.',
      error: error.message
    };
  }
}


