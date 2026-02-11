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
  if (error) throw error;
  return data;
}

async function getByRestaurant(table, restaurantId, options = {}) {
  let query = supabase.from(table).select('*').eq('restaurant_id', restaurantId);
  if (options.orderBy) query = query.order(options.orderBy, { ascending: options.ascending ?? false });
  if (options.limit) query = query.limit(options.limit);
  if (options.offset) query = query.range(options.offset, options.offset + (options.limit || 20) - 1);
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

async function insert(table, record) {
  const { data, error } = await supabase.from(table).insert(record).select().single();
  if (error) throw error;
  return data;
}

async function update(table, id, updates) {
  const { data, error } = await supabase.from(table).update(updates).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

async function remove(table, id) {
  const { error } = await supabase.from(table).delete().eq('id', id);
  if (error) throw error;
}

// ========================================
// Competitors
// ========================================

export const competitors = {
  getById: (id) => getById('competitors', id),
  getByRestaurant: (restaurantId, opts) => getByRestaurant('competitors', restaurantId, opts),
  create: (record) => insert('competitors', record),
  update: (id, updates) => update('competitors', id, updates),
  delete: (id) => remove('competitors', id),

  async updateRating(id, rating, reviewCount) {
    return update('competitors', id, {
      rating, review_count: reviewCount, last_checked_at: new Date().toISOString()
    });
  }
};

// ========================================
// Patterns
// ========================================

export const patterns = {
  getById: (id) => getById('patterns', id),
  getByRestaurant: (restaurantId, opts) => getByRestaurant('patterns', restaurantId, opts),
  create: (record) => insert('patterns', record),
  update: (id, updates) => update('patterns', id, updates),
  delete: (id) => remove('patterns', id),

  async getActive(restaurantId) {
    const { data, error } = await supabase.from('patterns')
      .select('*').eq('restaurant_id', restaurantId).eq('status', 'active')
      .order('mention_count', { ascending: false });
    if (error) throw error;
    return data;
  },

  async incrementMention(id) {
    const current = await getById('patterns', id);
    return update('patterns', id, {
      mention_count: current.mention_count + 1,
      last_seen_at: new Date().toISOString()
    });
  },

  async resolve(id) {
    return update('patterns', id, { status: 'resolved' });
  },

  async dismiss(id) {
    return update('patterns', id, { status: 'dismissed' });
  }
};

// ========================================
// Staff Mentions
// ========================================

export const staffMentions = {
  getById: (id) => getById('staff_mentions', id),
  getByRestaurant: (restaurantId, opts) => getByRestaurant('staff_mentions', restaurantId, opts),
  create: (record) => insert('staff_mentions', record),
  update: (id, updates) => update('staff_mentions', id, updates),
  delete: (id) => remove('staff_mentions', id),

  async upsertMention(restaurantId, staffName, isPositive) {
    const { data: existing } = await supabase.from('staff_mentions')
      .select('*').eq('restaurant_id', restaurantId).eq('staff_name', staffName).single();

    if (existing) {
      return update('staff_mentions', existing.id, {
        mention_count: existing.mention_count + 1,
        positive_count: existing.positive_count + (isPositive ? 1 : 0),
        negative_count: existing.negative_count + (isPositive ? 0 : 1),
        last_mentioned_at: new Date().toISOString()
      });
    }
    return insert('staff_mentions', {
      restaurant_id: restaurantId, staff_name: staffName,
      mention_count: 1,
      positive_count: isPositive ? 1 : 0,
      negative_count: isPositive ? 0 : 1
    });
  },

  async getTopPerformers(restaurantId, limit = 5) {
    const { data, error } = await supabase.from('staff_mentions')
      .select('*').eq('restaurant_id', restaurantId)
      .order('positive_count', { ascending: false }).limit(limit);
    if (error) throw error;
    return data;
  }
};

// ========================================
// Photo Reviews
// ========================================

export const photoReviews = {
  getById: (id) => getById('photo_reviews', id),
  getByRestaurant: (restaurantId, opts) => getByRestaurant('photo_reviews', restaurantId, opts),
  create: (record) => insert('photo_reviews', record),
  delete: (id) => remove('photo_reviews', id),

  async getByReview(reviewId) {
    const { data, error } = await supabase.from('photo_reviews')
      .select('*').eq('review_id', reviewId);
    if (error) throw error;
    return data;
  }
};

// ========================================
// Ranking History
// ========================================

export const rankingHistory = {
  getById: (id) => getById('ranking_history', id),
  getByRestaurant: (restaurantId, opts) => getByRestaurant('ranking_history', restaurantId, { orderBy: 'checked_at', ...opts }),
  create: (record) => insert('ranking_history', record),

  async getLatestByKeyword(restaurantId, keyword) {
    const { data, error } = await supabase.from('ranking_history')
      .select('*').eq('restaurant_id', restaurantId).eq('keyword', keyword)
      .order('checked_at', { ascending: false }).limit(1).single();
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  },

  async getHistory(restaurantId, keyword, days = 30) {
    const since = new Date(Date.now() - days * 86400000).toISOString();
    const { data, error } = await supabase.from('ranking_history')
      .select('*').eq('restaurant_id', restaurantId).eq('keyword', keyword)
      .gte('checked_at', since).order('checked_at', { ascending: true });
    if (error) throw error;
    return data;
  }
};

// ========================================
// Weekly Digests
// ========================================

export const weeklyDigests = {
  getById: (id) => getById('weekly_digests', id),
  getByRestaurant: (restaurantId, opts) => getByRestaurant('weekly_digests', restaurantId, { orderBy: 'week_start', ...opts }),
  create: (record) => insert('weekly_digests', record),
  update: (id, updates) => update('weekly_digests', id, updates),

  async getByWeek(restaurantId, weekStart) {
    const { data, error } = await supabase.from('weekly_digests')
      .select('*').eq('restaurant_id', restaurantId).eq('week_start', weekStart).single();
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  },

  async getByMagicLink(token) {
    const { data, error } = await supabase.from('weekly_digests')
      .select('*, restaurants(name, owner_email)').eq('magic_link_token', token).single();
    if (error) throw error;
    return data;
  },

  async markSmsSent(id) { return update('weekly_digests', id, { sms_sent: true }); },
  async markEmailSent(id) { return update('weekly_digests', id, { email_sent: true }); }
};

// ========================================
// Transaction Helper
// ========================================

export async function withTransaction(fn) {
  // Supabase JS doesn't support explicit transactions.
  // For multi-step operations, use RPC functions or handle errors with rollback logic.
  try {
    return await fn(supabase);
  } catch (error) {
    console.error('Transaction failed:', error);
    throw error;
  }
}

// ========================================
// Complex Queries
// ========================================

export const queries = {
  /** Get restaurant dashboard data (latest patterns, staff, rankings) */
  async getDashboard(restaurantId) {
    const [activePatterns, topStaff, latestDigest, competitorList] = await Promise.all([
      patterns.getActive(restaurantId),
      staffMentions.getTopPerformers(restaurantId),
      weeklyDigests.getByRestaurant(restaurantId, { limit: 1 }),
      competitors.getByRestaurant(restaurantId)
    ]);
    return { activePatterns, topStaff, latestDigest: latestDigest[0] || null, competitors: competitorList };
  },

  /** Get reviews with photos */
  async getReviewsWithPhotos(restaurantId, limit = 20) {
    const { data, error } = await supabase.from('reviews')
      .select('*, photo_reviews(*)')
      .eq('restaurant_id', restaurantId)
      .not('photo_reviews', 'is', null)
      .order('review_date', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data;
  }
};

export default {
  supabase, competitors, patterns, staffMentions, photoReviews,
  rankingHistory, weeklyDigests, withTransaction, queries
};
