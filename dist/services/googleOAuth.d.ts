/**
 * Google OAuth 2.0 Service for Business Profile API
 * Handles authorization flow, token exchange, storage, and refresh.
 */
/**
 * Generate the Google OAuth consent URL.
 * Returns the URL to redirect the user to.
 */
export declare function generateAuthUrl(restaurantId: string): string;
/**
 * Handle the OAuth callback - exchange code for tokens and store them.
 */
export declare function handleCallback(code: string, state: string): Promise<{
    restaurantId: string;
    success: boolean;
    error?: string;
}>;
/**
 * Get a valid access token for a restaurant, auto-refreshing if needed.
 * Returns null if no tokens stored or refresh fails.
 */
export declare function getValidAccessToken(restaurantId: string): Promise<string | null>;
/**
 * Get the Google account ID for a restaurant.
 */
export declare function getGoogleAccountId(restaurantId: string): Promise<string | null>;
//# sourceMappingURL=googleOAuth.d.ts.map