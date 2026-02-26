"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.pool = void 0;
exports.query = query;
exports.transaction = transaction;
const pg_1 = __importDefault(require("pg"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const { Pool } = pg_1.default;
exports.pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});
// Test connection
exports.pool.on('connect', () => {
    console.log('✅ Database connected');
});
exports.pool.on('error', (err) => {
    console.error('❌ Unexpected database error:', err);
    // Don't crash — attempt reconnection by running a test query
    exports.pool.query('SELECT 1').then(() => {
        console.log('✅ Database reconnected after error');
    }).catch((reconnectErr) => {
        console.error('❌ Database reconnection failed:', reconnectErr.message);
    });
});
// Query helper with error handling
async function query(text, params) {
    const start = Date.now();
    try {
        const res = await exports.pool.query(text, params);
        const duration = Date.now() - start;
        console.log('Executed query', { text: text.substring(0, 100), duration, rows: res.rowCount });
        return res;
    }
    catch (error) {
        console.error('Database query error:', error);
        throw error;
    }
}
// Transaction helper
async function transaction(callback) {
    const client = await exports.pool.connect();
    try {
        await client.query('BEGIN');
        const result = await callback(client);
        await client.query('COMMIT');
        return result;
    }
    catch (error) {
        await client.query('ROLLBACK');
        throw error;
    }
    finally {
        client.release();
    }
}
exports.default = exports.pool;
