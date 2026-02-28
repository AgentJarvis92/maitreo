/**
 * OTP Service — Phone verification via Twilio SMS
 * Codes stored in DB (otp_codes table) — survives server restarts.
 */

import { twilioClient } from '../sms/twilioClient.js';
import { query } from '../db/client.js';

const OTP_EXPIRY_MINUTES = 10;
const MAX_ATTEMPTS = 5;

function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function sendOtp(restaurantId: string, phone: string): Promise<{ success: boolean; message: string }> {
  const code = generateCode();

  // Upsert into DB — replaces any existing code for this restaurant
  await query(
    `INSERT INTO otp_codes (restaurant_id, phone, code, expires_at, attempts)
     VALUES ($1, $2, $3, NOW() + INTERVAL '${OTP_EXPIRY_MINUTES} minutes', 0)
     ON CONFLICT (restaurant_id) DO UPDATE
       SET phone = EXCLUDED.phone,
           code = EXCLUDED.code,
           expires_at = EXCLUDED.expires_at,
           attempts = 0,
           created_at = NOW()`,
    [restaurantId, phone, code]
  );

  try {
    await twilioClient.sendSms(phone, `Your Maitreo verification code is: ${code}`);
    return { success: true, message: 'Verification code sent' };
  } catch (err: any) {
    console.error('OTP send failed:', err);
    return { success: false, message: 'Failed to send verification code. Please try again.' };
  }
}

export async function verifyOtp(restaurantId: string, code: string): Promise<{ success: boolean; message: string }> {
  // Fetch from DB
  const result = await query<{ phone: string; code: string; expires_at: Date; attempts: number }>(
    `SELECT phone, code, expires_at, attempts FROM otp_codes WHERE restaurant_id = $1`,
    [restaurantId]
  );

  if (result.rows.length === 0) {
    return { success: false, message: 'No verification code found. Please request a new one.' };
  }

  const entry = result.rows[0];

  // Expired?
  if (new Date() > new Date(entry.expires_at)) {
    await query(`DELETE FROM otp_codes WHERE restaurant_id = $1`, [restaurantId]);
    return { success: false, message: 'Code expired. Please request a new one.' };
  }

  // Too many attempts?
  if (entry.attempts >= MAX_ATTEMPTS) {
    await query(`DELETE FROM otp_codes WHERE restaurant_id = $1`, [restaurantId]);
    return { success: false, message: 'Too many attempts. Please request a new code.' };
  }

  // Increment attempts
  await query(`UPDATE otp_codes SET attempts = attempts + 1 WHERE restaurant_id = $1`, [restaurantId]);

  if (entry.code !== code) {
    return { success: false, message: 'Invalid code. Please try again.' };
  }

  // Success — mark phone as verified and clean up
  await query(`DELETE FROM otp_codes WHERE restaurant_id = $1`, [restaurantId]);

  try {
    await query(
      `UPDATE restaurants SET phone_verified = true WHERE id = $1`,
      [restaurantId]
    );
  } catch (err) {
    console.error('Failed to update phone_verified:', err);
  }

  return { success: true, message: 'Phone verified!' };
}
