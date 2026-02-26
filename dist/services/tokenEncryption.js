"use strict";
/**
 * Token Encryption Service
 * AES-256-GCM encryption for OAuth tokens stored in database.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.encryptToken = encryptToken;
exports.decryptToken = decryptToken;
const crypto_1 = __importDefault(require("crypto"));
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;
function getEncryptionKey() {
    const key = process.env.TOKEN_ENCRYPTION_KEY;
    if (!key) {
        throw new Error('TOKEN_ENCRYPTION_KEY not set in environment');
    }
    // Key should be 32 bytes (256 bits). If hex-encoded, decode it.
    if (key.length === 64) {
        return Buffer.from(key, 'hex');
    }
    // Otherwise hash it to get consistent 32 bytes
    return crypto_1.default.createHash('sha256').update(key).digest();
}
function encryptToken(plaintext) {
    const key = getEncryptionKey();
    const iv = crypto_1.default.randomBytes(IV_LENGTH);
    const cipher = crypto_1.default.createCipheriv(ALGORITHM, key, iv);
    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const tag = cipher.getAuthTag();
    // Format: iv:tag:ciphertext (all hex)
    return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted}`;
}
function decryptToken(encrypted) {
    const key = getEncryptionKey();
    const parts = encrypted.split(':');
    if (parts.length !== 3) {
        throw new Error('Invalid encrypted token format');
    }
    const iv = Buffer.from(parts[0], 'hex');
    const tag = Buffer.from(parts[1], 'hex');
    const ciphertext = parts[2];
    const decipher = crypto_1.default.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}
