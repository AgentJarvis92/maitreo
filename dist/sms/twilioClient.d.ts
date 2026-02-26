/**
 * Twilio SMS Client
 * Handles sending and receiving SMS for review approval flow.
 */
interface TwilioMessageResponse {
    sid: string;
    status: string;
    to: string;
    body: string;
}
export declare class TwilioClient {
    private accountSid;
    private authToken;
    private fromNumber;
    private baseUrl;
    constructor();
    get isConfigured(): boolean;
    /**
     * Send an SMS message via Twilio REST API (no SDK needed).
     */
    sendSms(to: string, body: string): Promise<TwilioMessageResponse>;
}
export declare const twilioClient: TwilioClient;
export {};
//# sourceMappingURL=twilioClient.d.ts.map