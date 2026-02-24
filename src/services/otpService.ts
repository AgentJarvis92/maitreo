/**
 * OTP Service — Phone verification via Twilio SMS
 */

import { twilioClient } from '../sms/twilioClient.js';
import pool from '../db/client.js';

// In-memory OTP store (for simplicity; use Redis in production)
const otpStore = new Map<string, { code: string; expires: number; attempts: number }>();

const OTP_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes
const MAX_ATTEMPTS = 5;

function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function sendOtp(restaurantId: string, phone: string): Promise<{ success: boolean; message: string }> {
  const code = generateCode();
  const key = `${restaurantId}:${phone}`;

  otpStore.set(key, {
    code,
    expires: Date.now() + OTP_EXPIRY_MS,
    attempts: 0
  });

  try {
    await twilioClient.sendSms(phone, `Your Maitreo verification code is: ${code}`);
    return { success: true, message: 'Verification code sent' };
  } catch (err: any) {
    console.error('OTP send failed:', err);
    return { success: false, message: 'Failed to send verification code. Please try again.' };
  }
}

export async function verifyOtp(restaurantId: string, code: string): Promise<{ success: boolean; message: string }> {
  // Find the OTP for this restaurant
  let matchKey: string | null = null;
  for (const [key, val] of otpStore.entries()) {
    if (key.startsWith(`${restaurantId}:`)) {
      matchKey = key;
      break;
    }
  }

  if (!matchKey) {
    return { success: false, message: 'No verification code found. Please request a new one.' };
  }

  const entry = otpStore.get(matchKey)!;

  if (Date.now() > entry.expires) {
    otpStore.delete(matchKey);
    return { success: false, message: 'Code expired. Please request a new one.' };
  }

  if (entry.attempts >= MAX_ATTEMPTS) {
    otpStore.delete(matchKey);
    return { success: false, message: 'Too many attempts. Please request a new code.' };
  }

  entry.attempts++;

  if (entry.code !== code) {
    return { success: false, message: 'Invalid code. Please try again.' };
  }

  // Success — mark phone as verified
  otpStore.delete(matchKey);
  const phone = matchKey.split(':')[1];

  try {
    await pool.query(
      'UPDATE restaurants SET phone_verified = true WHERE id = $1',
      [restaurantId]
    );
  } catch (err) {
    console.error('Failed to update phone_verified:', err);
    // Non-fatal
  }

  return { success: true, message: 'Phone verified!' };
}
