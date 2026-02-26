/**
 * Onboarding Service
 * Handles new restaurant sign-ups
 */
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
 * Process new restaurant onboarding
 */
export declare function processOnboarding(data: OnboardingData): Promise<OnboardingResult>;
//# sourceMappingURL=onboarding.d.ts.map