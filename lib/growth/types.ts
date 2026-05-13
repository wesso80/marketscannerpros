// Growth Command Centre — shared types

export type Platform = 'x' | 'instagram';

export type PostType =
  | 'x_post'
  | 'ig_caption'
  | 'reel_script'
  | 'carousel'
  | 'launch_announcement'
  | 'feature_explainer'
  | 'trader_education'
  | 'platform_update'
  | 'founder_post'
  | 'conversion'
  | 'referral';

export type PostStatus = 'draft' | 'review' | 'approved' | 'posted' | 'rejected';

export type Tone =
  | 'founder_led'
  | 'institutional_analyst'
  | 'educational'
  | 'sharp_practical'
  | 'community_builder';

export interface ComplianceNote {
  category: string;       // 'advisory' | 'profitability' | 'guarantee' | 'urgency' | 'execution' | 'missing_disclaimer' | ...
  phrase: string;         // the offending substring
  severity: 'low' | 'medium' | 'high' | 'block';
  suggestion: string;     // recommended replacement
}

export interface GenerationBrief {
  campaignId?: number;
  goal: string;                 // "get beta/trial users"
  audience: string;             // "active traders who want better structure, scanner tools..."
  platform: Platform;
  postType: PostType;
  tone: Tone;
  feature?: string;             // "scanner", "volatility-compression", etc.
  offer?: string;               // "full pro access trial"
  count?: number;               // how many variants to draft (1-5)
  extraContext?: string;        // free-form, will be appended to system prompt
}

export interface GeneratedPost {
  platform: Platform;
  hook: string;
  caption: string;
  hashtags: string[];
  visual_suggestion: string;
  disclaimer: string;
  compliance_score: number;
  compliance_notes: ComplianceNote[];
  cta: string;
  risk_flags: string[];
  // Carousel-only
  carousel_slides?: Array<{ title: string; body: string; visual?: string }>;
}

export interface ComplianceResult {
  score: number;                // 0..100
  passed: boolean;              // score >= MIN_PUBLISH_SCORE
  notes: ComplianceNote[];
  riskFlags: string[];
}

export interface SocialPostRow {
  id: number;
  workspace_id: string;
  campaign_id: number | null;
  platform: Platform;
  post_type: PostType;
  hook: string | null;
  caption: string;
  hashtags: string[];
  visual_suggestion: string | null;
  cta: string | null;
  disclaimer: string;
  media_url: string | null;
  carousel_slides: GeneratedPost['carousel_slides'] | null;
  status: PostStatus;
  scheduled_for: string | null;
  posted_at: string | null;
  compliance_score: number;
  compliance_notes: ComplianceNote[];
  risk_flags: string[];
  source: string;
  model_version: string;
  prompt_version: string;
  generation_brief: GenerationBrief | null;
  created_by: string;
  approved_by: string | null;
  approved_at: string | null;
  rejected_reason: string | null;
  created_at: string;
  updated_at: string;
  external_id: string | null;
  external_url: string | null;
}

export interface CampaignRow {
  id: number;
  workspace_id: string;
  name: string;
  goal: string;
  offer: string | null;
  audience: string;
  tone: Tone;
  platforms: Platform[];
  status: 'active' | 'paused' | 'archived';
  created_by: string;
  created_at: string;
  updated_at: string;
}

export const MIN_PUBLISH_SCORE = 85;
export const PROMPT_VERSION = 'v1';
