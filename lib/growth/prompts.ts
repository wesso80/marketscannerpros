// System & user prompt builders for the Claude marketing agent.

import type { GenerationBrief, PostType } from './types';
import { voicePromptFor } from './brand-voice';
import { approvedContextAsPromptBlock, APPROVED_DISCLAIMERS } from './approved-context';

const PLATFORM_RULES: Record<'x' | 'instagram', string> = {
  x: `
PLATFORM RULES — X / Twitter:
  • Caption must fit within 280 characters TOTAL (including disclaimer if inline).
  • If the disclaimer would push past 280, put it as a thread reply suggestion
    in "cta" instead and keep the main caption clean.
  • Hashtags: 0–2 maximum. Most successful trader posts use zero.
  • Hooks are line 1 of the caption; do not duplicate them as a separate field
    in the rendered post.
  • Threads: write a single post here. The reviewer will request more if needed.
`.trim(),
  instagram: `
PLATFORM RULES — Instagram:
  • Caption can be 800–2200 characters. Aim for 800–1400.
  • Hashtags: 8–15, mix of broad and niche, all trading/finance related.
  • Hook is the first sentence — must work without the visual.
  • Visual suggestion must describe a single still image OR a clear 3–6 slide
    carousel storyboard.
  • For reels: include a 15–45 second beat-by-beat script in the caption
    section, plus the recorded voice-over text.
`.trim(),
};

const POST_TYPE_GUIDANCE: Record<PostType, string> = {
  x_post: 'A single standalone post. One observation, one insight, no CTA shouting.',
  ig_caption: 'A static post caption. Lead with a hook, deliver one teaching point, close with an invitation.',
  reel_script: 'A 15–45s reel. Script must have: hook beat (0–3s), context beat, payoff beat, close beat. Include on-screen text suggestions.',
  carousel: 'A 3–6 slide carousel. Return slides in "carousel_slides" array with {title, body, visual} per slide. Slide 1 is the hook; final slide is the invitation (not a hard sell).',
  launch_announcement: 'Announce a product/feature/campaign milestone. State what shipped, why it matters to active traders, and what changes in their day. No hype.',
  feature_explainer: 'Explain one MSP feature clearly. Reader should understand what the feature does and what problem it solves, in under 60 seconds of reading.',
  trader_education: 'Pure education. Teach one concept — regime, volatility compression, time clustering, evidence quality, etc. Worth saving even by traders who never sign up.',
  platform_update: 'Tell users what changed this week / sprint. Bullet points OK. Honest, including limitations.',
  founder_post: 'First-person from the operator. Why MSP was built, what we\'re working on, an honest observation about the retail trader experience.',
  conversion: 'Direct response — but compliance-safe. Describe what trial includes, who it\'s for, and what changes after trial ends. No urgency manipulation.',
  referral: 'Community-led. Invite existing users to share with a trader they respect. Frame as "who in your circle would this help" — not "earn money".',
};

export const RESPONSE_SCHEMA_INSTRUCTION = `
Return ONLY a valid JSON array. Each element is one post object, in this exact shape:

{
  "platform": "x" | "instagram",
  "hook": string,                       // 1 sentence, ≤120 chars
  "caption": string,                    // full body (respect platform char limits)
  "hashtags": string[],                 // platform-appropriate count
  "visual_suggestion": string,          // describe the image/reel/carousel
  "disclaimer": string,                 // educational disclaimer text included on or with the post
  "compliance_score": number,           // your own self-rating 0–100 — DO NOT inflate, will be re-scored server-side
  "compliance_notes": [],               // any concerns you flagged yourself: [{category, phrase, severity, suggestion}]
  "cta": string,                        // call to action — invitational, never imperative trading language
  "risk_flags": string[],               // any risk categories you noticed: e.g. ["urgency_close_to_line"]
  "carousel_slides": [                  // OMIT this field unless post_type is "carousel"
    { "title": string, "body": string, "visual": string }
  ]
}

Hard rules for the output:
  • NEVER include the strings: "buy now", "sell now", "trade this", "guaranteed", "safe", "risk-free", "can't lose".
  • NEVER tell the reader to enter or exit a trade.
  • ALWAYS include an educational disclaimer (or a clear plan to surface one).
  • If you cannot generate a compliant post for this brief, return [] (empty array). Do NOT explain why outside the JSON.
  • Output must be parseable by JSON.parse() with no surrounding prose, no markdown fences, no commentary.
`.trim();

export function systemPrompt(brief: GenerationBrief): string {
  const voice = voicePromptFor(brief.tone);
  const approved = approvedContextAsPromptBlock(brief.feature);
  const platform = PLATFORM_RULES[brief.platform];
  const typeGuidance = POST_TYPE_GUIDANCE[brief.postType] ?? POST_TYPE_GUIDANCE.x_post;

  return [
    'You are the Growth Command Centre agent for MarketScanner Pros.',
    'Your job: draft compliant, on-voice, retail-trader-grade social content',
    'for human approval. You never publish. A human reviewer always reads',
    'your output before it leaves the building.',
    '',
    voice,
    '',
    approved,
    '',
    platform,
    '',
    `POST TYPE — ${brief.postType}:`,
    typeGuidance,
    '',
    RESPONSE_SCHEMA_INSTRUCTION,
    '',
    `Required disclaimer text (use verbatim or near-verbatim): "${APPROVED_DISCLAIMERS.educational_short}"`,
  ].join('\n');
}

export function userPrompt(brief: GenerationBrief): string {
  const count = Math.min(Math.max(brief.count ?? 1, 1), 5);
  return [
    `Generate ${count} ${brief.postType} draft(s) for ${brief.platform}.`,
    '',
    `Campaign goal: ${brief.goal}`,
    `Target audience: ${brief.audience}`,
    `Tone preset: ${brief.tone}`,
    brief.offer ? `Offer to weave in (compliance-safe): ${brief.offer}` : '',
    brief.feature ? `Focus feature: ${brief.feature}` : '',
    brief.extraContext ? `\nExtra context from the operator:\n${brief.extraContext}` : '',
    '',
    `Return a JSON array of ${count} post object(s). No prose. No markdown.`,
  ]
    .filter(Boolean)
    .join('\n');
}
