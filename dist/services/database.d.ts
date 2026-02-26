import { SupabaseClient } from '@supabase/supabase-js';
export declare const supabase: SupabaseClient;
export declare const Restaurants: {
    getById: (id: string) => Promise<any>;
    getByRestaurant: (restaurantId: string, opts?: Record<string, unknown>) => Promise<any>;
    create: (record: Record<string, unknown>) => Promise<any>;
    update: (id: string, updates: Record<string, unknown>) => Promise<any>;
    delete: (id: string) => Promise<void>;
    updateRating: (id: string, rating: number, reviewCount: number) => Promise<any>;
};
export declare const Reviews: {
    getById: (id: string) => Promise<any>;
    getByRestaurant: (restaurantId: string, opts?: Record<string, unknown>) => Promise<any>;
    create: (record: Record<string, unknown>) => Promise<any>;
    update: (id: string, updates: Record<string, unknown>) => Promise<any>;
    delete: (id: string) => Promise<void>;
    updateSentiment: (restaurantId: string, staffName: string, isPositive: boolean) => import("@supabase/postgrest-js").PostgrestFilterBuilder<any, any, any, null, "reviews", unknown, "PATCH">;
};
export declare const ReplyDrafts: {
    getById: (id: string) => Promise<any>;
    getByRestaurant: (restaurantId: string, opts?: Record<string, unknown>) => Promise<any>;
    create: (record: Record<string, unknown>) => Promise<any>;
    update: (id: string, updates: Record<string, unknown>) => Promise<any>;
    delete: (id: string) => Promise<void>;
};
export declare const Newsletters: {
    getById: (id: string) => Promise<any>;
    getByRestaurant: (restaurantId: string, opts?: Record<string, unknown>) => Promise<any>;
    create: (record: Record<string, unknown>) => Promise<any>;
    delete: (id: string) => Promise<void>;
    getWeekly: (restaurantId: string, keyword: string) => import("@supabase/postgrest-js").PostgrestFilterBuilder<any, any, any, any[], "newsletters", unknown, "GET">;
    searchByKeyword: (restaurantId: string, keyword: string) => import("@supabase/postgrest-js").PostgrestFilterBuilder<any, any, any, any[], "newsletters", unknown, "GET">;
};
export declare const Customers: {
    getById: (id: string) => Promise<any>;
    getByRestaurant: (restaurantId: string, opts?: Record<string, unknown>) => Promise<any>;
    create: (record: Record<string, unknown>) => Promise<any>;
    update: (id: string, updates: Record<string, unknown>) => Promise<any>;
    delete: (id: string) => Promise<void>;
    track: (restaurantId: string, weekStart: string) => import("@supabase/postgrest-js").PostgrestFilterBuilder<any, any, any, any[], "customers", unknown, "GET">;
};
export declare const Subscriptions: {
    getByToken: (token: string) => import("@supabase/postgrest-js").PostgrestBuilder<any, any, false>;
    delete: (id: string) => import("@supabase/postgrest-js").PostgrestFilterBuilder<any, any, any, null, "subscriptions", unknown, "DELETE">;
};
export declare const Billings: {
    track: (fn: Function) => any;
};
export declare const Logs: {
    track: (restaurantId: string) => import("@supabase/postgrest-js").PostgrestFilterBuilder<any, any, any, any[], "activity_logs", unknown, "GET">;
};
//# sourceMappingURL=database.d.ts.map