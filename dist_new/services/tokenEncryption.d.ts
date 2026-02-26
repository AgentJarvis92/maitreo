/**
 * Token Encryption Service
 * AES-256-GCM encryption for OAuth tokens stored in database.
 */
export declare function encryptToken(plaintext: string): string;
export declare function decryptToken(encrypted: string): string;
