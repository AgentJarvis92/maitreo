/**
 * Twilio SMS Client
 * Handles sending and receiving SMS for review approval flow.
 */
import dotenv from 'dotenv';
dotenv.config();
export class TwilioClient {
    constructor() {
        this.accountSid = process.env.TWILIO_ACCOUNT_SID || '';
        this.authToken = process.env.TWILIO_AUTH_TOKEN || '';
        this.fromNumber = process.env.TWILIO_PHONE_NUMBER || '';
        this.baseUrl = `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}`;
    }
    get isConfigured() {
        return !!(this.accountSid && this.authToken && this.fromNumber);
    }
    /**
     * Send an SMS message via Twilio REST API (no SDK needed).
     */
    async sendSms(to, body) {
        if (!this.isConfigured) {
            throw new Error('Twilio not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER');
        }
        const url = `${this.baseUrl}/Messages.json`;
        const auth = Buffer.from(`${this.accountSid}:${this.authToken}`).toString('base64');
        const params = new URLSearchParams({
            To: to,
            From: this.fromNumber,
            Body: body,
        });
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                Authorization: `Basic ${auth}`,
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: params.toString(),
        });
        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Twilio API error ${response.status}: ${errText}`);
        }
        const data = await response.json();
        console.log(`📱 SMS sent to ${to} (SID: ${data.sid})`);
        return {
            sid: data.sid,
            status: data.status,
            to: data.to,
            body: data.body,
        };
    }
}
export const twilioClient = new TwilioClient();
//# sourceMappingURL=twilioClient.js.map