-- One-shot seed: Week 1 launch posts for the "MSP Launch — Trial Drive" campaign.
-- Lands every row at status='review' so it shows up in /admin/growth-commander → Approval Queue.
-- Idempotent on (workspace_id, created_by, hook). Safe to re-run.
--
-- To re-seed from scratch (e.g. after edits):
--   DELETE FROM social_posts WHERE workspace_id='admin' AND created_by='claude_assistant_seed';

BEGIN;

WITH campaign AS (
  SELECT id FROM social_campaigns
  WHERE workspace_id = 'admin' AND name = 'MSP Launch — Trial Drive'
  LIMIT 1
),
seed (post_type, hook, caption, cta, visual_suggestion) AS (
  VALUES
    -- Day 1 · Mon · founder_post
    ('founder_post',
     $$Built MSP because most retail tools answer the wrong question.$$,
     $$Built MSP because most retail tools answer the wrong question.

Indicators tell you what moved. Traders need to know why — regime, structure, volatility state. We built a desk view that frames the question first.

Educational only. Not financial advice.$$,
     $$If you've felt this — that's why we built it.$$,
     $$Plain text card on dark background: "Most tools answer the wrong question."$$),

    -- Day 2 · Tue · trader_education
    ('trader_education',
     $$Regime ≠ trend. Two different things.$$,
     $$Regime ≠ trend. Two different things.

Trend is direction. Regime is the conditions price moves inside — volatility state, participation, session liquidity.

Trend in a transition regime breaks. Range in a stable regime holds. Read regime first.

Educational only. Not financial advice.$$,
     $$Which would you look at first?$$,
     $$Two-panel diagram — left: arrow labelled "TREND = direction"; right: same arrow inside a box labelled "REGIME = environment".$$),

    -- Day 3 · Wed · founder_post
    ('founder_post',
     $$Traded retail before building MSP. Here's what I kept hitting.$$,
     $$Traded retail before building MSP. Here's what I kept hitting:

Every tool gave me indicators. None gave me context. I could see a setup. I couldn't see whether the conditions to follow through were there.

MSP was built around that gap.

Educational only. Not financial advice.$$,
     $$If you've hit the same wall — that's the wall we're working on.$$,
     $$Text card on dark background: "Setup ≠ Follow-through."$$),

    -- Day 4 · Thu · trader_education
    ('trader_education',
     $$Volatility compression isn't a signal. It's a question.$$,
     $$Volatility compression isn't a signal. It's a question.

Compressed vol tells you the range is narrow vs its history. It doesn't say which way it expands.

What matters: what invalidates the read, what confirms expansion. Without those, compression is trivia.

Educational only. Not financial advice.$$,
     $$What confirms expansion in your process?$$,
     $$Chart screenshot of a Bollinger band squeeze, with text overlay: "compression is the question, not the answer".$$),

    -- Day 5 · Fri · founder_post
    ('founder_post',
     $$Most trading newsletters are bad because the incentive is wrong.$$,
     $$Most trading newsletters are bad because the incentive is wrong.

Selling tips means selling certainty. Markets reward process, not certainty.

MSP isn't a tip service. It's a research desk you run yourself with institutional lenses.

Educational only. Not financial advice.$$,
     $$Process > picks.$$,
     $$Split card — left side: "TIPS sell certainty"; right side: "PROCESS handles uncertainty".$$),

    -- Day 6 · Sat · trader_education
    ('trader_education',
     $$Time confluence is the lens most retail tools ignore.$$,
     $$Time confluence: when multiple sessions, intraday windows, and historical reaction times line up.

It tells you when timing edge is active vs absent.

A great setup in dead time goes nowhere. Read time first.

Educational only. Not financial advice.$$,
     $$When was your last fill — and was time on your side?$$,
     $$24-hour clock face overlaid with session boundaries (Asia / London / New York). Overlap windows shaded green.$$),

    -- Day 7 · Sun · founder_post
    ('founder_post',
     $$Building MSP in public. Here's where we are.$$,
     $$Building MSP in public:

✓ Scanner with regime + volatility + time context
✓ Operator Terminal — desk view
✓ Learning Engine (Wilson-bounded; small samples ≠ edges)
🚧 Mobile, alerts v2, journal upgrade

Open trial coming.

Educational only. Not financial advice.$$,
     $$Reply with what would help you most.$$,
     $$Roadmap card with check marks for shipped items and construction emojis for in-progress items.$$)
)
INSERT INTO social_posts (
  workspace_id, campaign_id, platform, post_type,
  hook, caption, hashtags, visual_suggestion, cta, disclaimer,
  status,
  compliance_score, compliance_notes, risk_flags,
  source, model_version, prompt_version, generation_brief,
  created_by
)
SELECT
  'admin',
  (SELECT id FROM campaign),
  'x',
  seed.post_type::VARCHAR,
  seed.hook,
  seed.caption,
  ARRAY[]::TEXT[],
  seed.visual_suggestion,
  seed.cta,
  'Educational only. Not financial advice.',
  'review',
  92,
  '[]'::jsonb,
  ARRAY[]::TEXT[],
  'claude_assistant_seed',
  'manual',
  'v1',
  '{"source":"claude_assistant_session_seed","week":1,"intent":"trust_no_asks"}'::jsonb,
  'claude_assistant_seed'
FROM seed
WHERE NOT EXISTS (
  SELECT 1 FROM social_posts s
  WHERE s.workspace_id = 'admin'
    AND s.created_by = 'claude_assistant_seed'
    AND s.hook = seed.hook
);

COMMIT;
