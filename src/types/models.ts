// Database model types

export interface Restaurant {
  id: string;
  name: string;
  location?: string | null;
  owner_email?: string;
  owner_phone?: string;
  phone?: string;
  email?: string;
  tone_profile_json?: ToneProfile;
  competitors_json?: Competitor[];
  created_at?: Date;
  updated_at?: Date;
  [key: string]: any; // Allow additional fields from database
}

export interface ToneProfile {
  tone?: 'professional' | 'friendly' | 'casual' | 'formal';
  personality?: string[];
  avoid?: string[];
  emphasis?: string[];
  signature?: string;
}

export interface Competitor {
  name: string;
  platform: 'google' | 'yelp' | 'tripadvisor' | 'facebook';
  id: string;
  location?: string;
}

export interface Review {
  id: string;
  restaurant_id: string;
  platform: 'google' | 'yelp' | 'tripadvisor' | 'facebook';
  review_id: string;
  author: string | null;
  rating: number;
  text: string | null;
  review_date: Date | null;
  ingested_at: Date;
  metadata: Record<string, any>;
}

export interface ReplyDraft {
  id: string;
  review_id: string;
  draft_text: string;
  escalation_flag: boolean;
  escalation_reasons: EscalationReason[];
  status: 'pending' | 'approved' | 'rejected' | 'sent';
  created_at: Date;
  updated_at: Date;
  approved_at: Date | null;
  metadata: Record<string, any>;
}

export type EscalationReason =
  | 'health_issue'
  | 'threat'
  | 'discrimination'
  | 'refund_request'
  | 'legal_concern'
  | 'extreme_negativity';

export interface Newsletter {
  id: string;
  restaurant_id: string;
  week_start_date: Date;
  content_html: string;
  content_json: NewsletterContent;
  sent_at: Date | null;
  created_at: Date;
  metadata: Record<string, any>;
}

export interface NewsletterContent {
  competitor_moves?: CompetitorInsight[];
  review_trends?: ReviewTrend[];
  pricing_signals?: PricingSignal[];
  action_items?: ActionItem[];
}

export interface CompetitorInsight {
  competitor_name: string;
  insight_type: string;
  description: string;
  impact: 'high' | 'medium' | 'low';
}

export interface ReviewTrend {
  metric: string;
  value: number;
  change: number;
  interpretation: string;
}

export interface PricingSignal {
  competitor: string;
  signal: string;
  details: string;
}

export interface ActionItem {
  priority: 'high' | 'medium' | 'low';
  category: string;
  action: string;
  reasoning: string;
}

export interface EmailLog {
  id: string;
  type: 'reply_draft' | 'newsletter' | 'notification' | 'welcome';
  to_email: string;
  subject: string;
  status: 'pending' | 'sent' | 'failed' | 'bounced';
  sent_at: Date | null;
  error_message: string | null;
  metadata: Record<string, any>;
  created_at: Date;
  review_id?: string | null;
  reply_draft_id?: string | null;
  newsletter_id?: string | null;
}

// Service input/output types

export interface GenerateReplyInput {
  review: Review;
  restaurant: Restaurant;
}

export interface GenerateReplyOutput {
  draft_text: string;
  escalation_flag: boolean;
  escalation_reasons: EscalationReason[];
  confidence_score?: number;
}

export interface GenerateNewsletterInput {
  restaurant: Restaurant;
  week_start_date: Date;
  competitor_reviews: Review[];
}

export interface GenerateNewsletterOutput {
  content_html: string;
  content_json: NewsletterContent;
}
