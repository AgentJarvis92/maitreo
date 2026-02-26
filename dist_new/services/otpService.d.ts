/**
 * OTP Service — Phone verification via Twilio SMS
 */
export declare function sendOtp(restaurantId: string, phone: string): Promise<{
    success: boolean;
    message: string;
}>;
export declare function verifyOtp(restaurantId: string, code: string): Promise<{
    success: boolean;
    message: string;
}>;
