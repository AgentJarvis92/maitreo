import { createClient, SupabaseClient } from '@supabase/supabase-js';
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

export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseKey);

// ========================================
// Generic CRUD Helpers
// ========================================

async function getById(table: string, id: string) {
  const { data, error } = await supabase.from(table).select('*').eq('id', id).single();
  if (error) throw error;
  return data;
}

async function getByRestaurant(table: string, restaurantId: string, options: Record<string, unknown> = {}) {
  let query: any = supabase.from(table).select('*').eq('restaurant_id', restaurantId);
  if ((options as any).orderBy) query = query.order((options as any).orderBy, { ascending: (options as any).ascending ?? false });
  if ((options as any).limit) query = query.limit((options as any).limit);
  if ((options as any).offset) query = query.range((options as any).offset, (options as any).offset + ((options as any).limit || 10) - 1);
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

async function create(table: string, record: Record<string, unknown>) {
  const { data, error } = await supabase.from(table).insert([record]).select().single();
  if (error) throw error;
  return data;
}

async function update(table: string, id: string, updates: Record<string, unknown>) {
  const { data, error } = await supabase.from(table).update(updates).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

async function remove(table: string, id: string) {
  const { error } = await supabase.from(table).delete().eq('id', id);
  if (error) throw error;
}

// ========================================
// Business Table Accessors
// ========================================

export const Restaurants = {
  getById: (id: string) => getById('restaurants', id),
  getByRestaurant: (restaurantId: string, opts: Record<string, unknown> = {}) => getByRestaurant('restaurants', restaurantId, opts),
  create: (record: Record<string, unknown>) => create('restaurants', record),
  update: (id: string, updates: Record<string, unknown>) => update('restaurants', id, updates),
  delete: (id: string) => remove('restaurants', id),
  
  updateRating: (id: string, rating: number, reviewCount: number) => 
    update('restaurants', id, { avg_rating: rating, total_reviews: reviewCount }),
};

export const Reviews = {
  getById: (id: string) => getById('reviews', id),
  getByRestaurant: (restaurantId: string, opts: Record<string, unknown> = {}) => getByRestaurant('reviews', restaurantId, opts),
  create: (record: Record<string, unknown>) => create('reviews', record),
  update: (id: string, updates: Record<string, unknown>) => update('reviews', id, updates),
  delete: (id: string) => remove('reviews', id),
  
  updateSentiment: (restaurantId: string, staffName: string, isPositive: boolean) =>
    supabase.from('reviews').update({ staff_sentiment: { [staffName]: isPositive } }).eq('restaurant_id', restaurantId),
};

export const ReplyDrafts = {
  getById: (id: string) => getById('reply_drafts', id),
  getByRestaurant: (restaurantId: string, opts: Record<string, unknown> = {}) => getByRestaurant('reply_drafts', restaurantId, opts),
  create: (record: Record<string, unknown>) => create('reply_drafts', record),
  update: (id: string, updates: Record<string, unknown>) => update('reply_drafts', id, updates),
  delete: (id: string) => remove('reply_drafts', id),
};

export const Newsletters = {
  getById: (id: string) => getById('newsletters', id),
  getByRestaurant: (restaurantId: string, opts: Record<string, unknown> = {}) => getByRestaurant('newsletters', restaurantId, opts),
  create: (record: Record<string, unknown>) => create('newsletters', record),
  delete: (id: string) => remove('newsletters', id),
  
  getWeekly: (restaurantId: string, keyword: string) =>
    supabase.from('newsletters').select('*').eq('restaurant_id', restaurantId).like('title', `%${keyword}%`),
  
  searchByKeyword: (restaurantId: string, keyword: string) =>
    supabase.from('newsletters').select('*').eq('restaurant_id', restaurantId).like('content', `%${keyword}%`),
};

export const Customers = {
  getById: (id: string) => getById('customers', id),
  getByRestaurant: (restaurantId: string, opts: Record<string, unknown> = {}) => getByRestaurant('customers', restaurantId, opts),
  create: (record: Record<string, unknown>) => create('customers', record),
  update: (id: string, updates: Record<string, unknown>) => update('customers', id, updates),
  delete: (id: string) => remove('customers', id),

  track: (restaurantId: string, weekStart: string) =>
    supabase.from('customers').select('*').eq('restaurant_id', restaurantId).gte('created_at', weekStart),
};

export const Subscriptions = {
  getByToken: (token: string) =>
    supabase.from('subscriptions').select('*').eq('token', token).single(),
  
  delete: (id: string) =>
    supabase.from('subscriptions').delete().eq('id', id),
};

export const Billings = {
  track: (fn: Function) => fn(),
};

export const Logs = {
  track: (restaurantId: string) =>
    supabase.from('activity_logs').select('*').eq('restaurant_id', restaurantId).order('created_at', { ascending: false }),
};
