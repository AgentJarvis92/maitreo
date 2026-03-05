-- ============================================================
-- SECURITY FIX: Enable RLS on all public tables
-- Supabase Security Advisor: 6 errors
-- Note: email_stats and pending_reply_drafts are VIEWS (skip)
-- Note: reviews and photo_reviews already have policies (skip policy creation)
-- ============================================================

-- Enable RLS on all TABLES (not views)
ALTER TABLE public.restaurants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.competitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.competitor_weekly_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.digests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.newsletters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oauth_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.otp_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.photo_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.posted_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ranking_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reply_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_consent_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_context ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_mentions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_digests ENABLE ROW LEVEL SECURITY;

-- Service role policies (backend uses service_role key which bypasses RLS,
-- but explicit policies prevent lockout if accessing via other roles)

-- Skip reviews and photo_reviews — they already have "backend_only" policies
CREATE POLICY "service_role_all" ON public.restaurants FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_all" ON public.customers FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_all" ON public.competitors FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_all" ON public.competitor_weekly_snapshots FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_all" ON public.digests FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_all" ON public.email_logs FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_all" ON public.newsletters FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_all" ON public.oauth_states FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_all" ON public.otp_codes FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_all" ON public.patterns FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_all" ON public.posted_responses FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_all" ON public.ranking_history FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_all" ON public.reply_drafts FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_all" ON public.sms_consent_audit FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_all" ON public.sms_context FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_all" ON public.sms_interactions FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_all" ON public.sms_logs FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_all" ON public.staff_mentions FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_all" ON public.weekly_digests FOR ALL USING (auth.role() = 'service_role');
