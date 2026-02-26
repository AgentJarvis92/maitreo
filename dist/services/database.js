import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
// ========================================
// Database Service Layer
// ========================================
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_KEY environment variables');
}
export const supabase = createClient(supabaseUrl, supabaseKey);
// ========================================
// Generic CRUD Helpers
// ========================================
async function getById(table, id) {
    const { data, error } = await supabase.from(table).select('*').eq('id', id).single();
    if (error)
        throw error;
    return data;
}
async function getByRestaurant(table, restaurantId, options = {}) {
    let query = supabase.from(table).select('*').eq('restaurant_id', restaurantId);
    if (options.orderBy)
        query = query.order(options.orderBy, { ascending: options.ascending ?? false });
    if (options.limit)
        query = query.limit(options.limit);
    if (options.offset)
        query = query.range(options.offset, options.offset + (options.limit || 10) - 1);
    const { data, error } = await query;
    if (error)
        throw error;
    return data;
}
async function create(table, record) {
    const { data, error } = await supabase.from(table).insert([record]).select().single();
    if (error)
        throw error;
    return data;
}
async function update(table, id, updates) {
    const { data, error } = await supabase.from(table).update(updates).eq('id', id).select().single();
    if (error)
        throw error;
    return data;
}
async function remove(table, id) {
    const { error } = await supabase.from(table).delete().eq('id', id);
    if (error)
        throw error;
}
// ========================================
// Business Table Accessors
// ========================================
export const Restaurants = {
    getById: (id) => getById('restaurants', id),
    getByRestaurant: (restaurantId, opts = {}) => getByRestaurant('restaurants', restaurantId, opts),
    create: (record) => create('restaurants', record),
    update: (id, updates) => update('restaurants', id, updates),
    delete: (id) => remove('restaurants', id),
    updateRating: (id, rating, reviewCount) => update('restaurants', id, { avg_rating: rating, total_reviews: reviewCount }),
};
export const Reviews = {
    getById: (id) => getById('reviews', id),
    getByRestaurant: (restaurantId, opts = {}) => getByRestaurant('reviews', restaurantId, opts),
    create: (record) => create('reviews', record),
    update: (id, updates) => update('reviews', id, updates),
    delete: (id) => remove('reviews', id),
    updateSentiment: (restaurantId, staffName, isPositive) => supabase.from('reviews').update({ staff_sentiment: { [staffName]: isPositive } }).eq('restaurant_id', restaurantId),
};
export const ReplyDrafts = {
    getById: (id) => getById('reply_drafts', id),
    getByRestaurant: (restaurantId, opts = {}) => getByRestaurant('reply_drafts', restaurantId, opts),
    create: (record) => create('reply_drafts', record),
    update: (id, updates) => update('reply_drafts', id, updates),
    delete: (id) => remove('reply_drafts', id),
};
export const Newsletters = {
    getById: (id) => getById('newsletters', id),
    getByRestaurant: (restaurantId, opts = {}) => getByRestaurant('newsletters', restaurantId, opts),
    create: (record) => create('newsletters', record),
    delete: (id) => remove('newsletters', id),
    getWeekly: (restaurantId, keyword) => supabase.from('newsletters').select('*').eq('restaurant_id', restaurantId).like('title', `%${keyword}%`),
    searchByKeyword: (restaurantId, keyword) => supabase.from('newsletters').select('*').eq('restaurant_id', restaurantId).like('content', `%${keyword}%`),
};
export const Customers = {
    getById: (id) => getById('customers', id),
    getByRestaurant: (restaurantId, opts = {}) => getByRestaurant('customers', restaurantId, opts),
    create: (record) => create('customers', record),
    update: (id, updates) => update('customers', id, updates),
    delete: (id) => remove('customers', id),
    track: (restaurantId, weekStart) => supabase.from('customers').select('*').eq('restaurant_id', restaurantId).gte('created_at', weekStart),
};
export const Subscriptions = {
    getByToken: (token) => supabase.from('subscriptions').select('*').eq('token', token).single(),
    delete: (id) => supabase.from('subscriptions').delete().eq('id', id),
};
export const Billings = {
    track: (fn) => fn(),
};
export const Logs = {
    track: (restaurantId) => supabase.from('activity_logs').select('*').eq('restaurant_id', restaurantId).order('created_at', { ascending: false }),
};
//# sourceMappingURL=database.js.map