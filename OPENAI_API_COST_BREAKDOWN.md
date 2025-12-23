# OpenAI API Cost Breakdown & Strategy
## MarketScanner Pros - AI Infrastructure Guide

**Document Version:** 1.0  
**Last Updated:** December 23, 2025  
**Author:** MSP Technical Team

---

# Table of Contents

1. [ChatGPT Pro vs OpenAI API](#1-chatgpt-pro-vs-openai-api)
2. [Current MSP Setup](#2-current-msp-setup)
3. [Model Options & Pricing](#3-model-options--pricing)
4. [Cost Per Request](#4-cost-per-request)
5. [Monthly Cost by Volume](#5-monthly-cost-by-volume)
6. [Cost Per User](#6-cost-per-user)
7. [Tier-Based Projections](#7-tier-based-projections)
8. [Scaling Scenarios](#8-scaling-scenarios)
9. [Hybrid Model Strategy](#9-hybrid-model-strategy)
10. [Budget Planning](#10-budget-planning)
11. [Recommendations](#11-recommendations)

---

# 1. ChatGPT Pro vs OpenAI API

## Understanding the Difference

These are **completely separate products** from OpenAI.

### Comparison Table

| Aspect | ChatGPT Pro (Consumer) | OpenAI API (Developer) |
|--------|------------------------|------------------------|
| **Purpose** | Personal chat assistant | Power YOUR application |
| **Who uses it** | You personally | Your customers |
| **Pricing model** | Fixed monthly subscription | Pay-per-token (usage) |
| **Access point** | chat.openai.com | api.openai.com |
| **Billing** | Flat rate | Variable by usage |
| **Scalability** | 1 user only | Unlimited users |
| **Embedding** | Cannot embed in apps | Designed for apps |

### ChatGPT Subscription Tiers

| Plan | Monthly Price | Features |
|------|--------------|----------|
| Free | $0 | GPT-3.5, limited GPT-4o access |
| Plus | $20 | GPT-4o, DALL-E, plugins, advanced voice |
| Pro | $200 | Unlimited GPT-4o, o1 reasoning model |
| Team | $25/user | Workspace, admin controls |
| Enterprise | Custom | SSO, dedicated support |

### OpenAI API Pricing

| Model | Input (per 1M tokens) | Output (per 1M tokens) |
|-------|----------------------|------------------------|
| gpt-4o-mini | $0.15 | $0.60 |
| gpt-4o | $2.50 | $10.00 |
| gpt-4-turbo | $10.00 | $30.00 |
| o1-mini | $3.00 | $12.00 |
| o1 | $15.00 | $60.00 |

### Why API is Better for MSP

| ChatGPT Pro ($200/month) | OpenAI API |
|--------------------------|------------|
| Only YOU can use it | ALL your users can use it |
| Fixed cost regardless of use | Pay only for actual usage |
| Cannot integrate into MSP | Powers MSP Analyst chatbot |
| Serves 1 person | Serves unlimited customers |
| No programmatic access | Full programmatic control |

**Conclusion:** The API is the correct choice for MarketScanner Pros.

---

# 2. Current MSP Setup

## Configuration

**API Key Location:** `.env.local`
```
OPENAI_API_KEY="sk-proj-..."
```

**Billing Type:** Pay-per-token (usage-based)

## API Routes Using OpenAI

| Route | Purpose | Current Model |
|-------|---------|---------------|
| `/api/msp-analyst` | AI chat assistant | gpt-4o-mini |
| `/api/portfolio/analyze` | Portfolio analysis | gpt-4o-mini |
| `/api/journal/analyze` | Trade journal insights | gpt-4o-mini |
| `/api/market-focus/generate` | Daily market focus | gpt-4o-mini |
| `/api/jobs/generate-market-focus` | Scheduled market content | gpt-4o-mini |

## Current Rate Limits by Tier

| Tier | Daily AI Questions | Monthly Maximum |
|------|-------------------|-----------------|
| Free | 10 | 300 |
| Pro | 50 | 1,500 |
| Pro Trader | 200 | 6,000 |

---

# 3. Model Options & Pricing

## Available Models

### GPT-4o-mini (Current - Recommended for Cost)

| Metric | Value |
|--------|-------|
| Input cost | $0.15 per 1M tokens |
| Output cost | $0.60 per 1M tokens |
| Speed | Fast |
| Quality | Good |
| Best for | High volume, cost-sensitive |

### GPT-4o (Recommended for Quality)

| Metric | Value |
|--------|-------|
| Input cost | $2.50 per 1M tokens |
| Output cost | $10.00 per 1M tokens |
| Speed | Fast |
| Quality | Excellent |
| Best for | Premium users, complex analysis |

### GPT-4-turbo (Legacy Premium)

| Metric | Value |
|--------|-------|
| Input cost | $10.00 per 1M tokens |
| Output cost | $30.00 per 1M tokens |
| Speed | Medium |
| Quality | Excellent |
| Best for | Complex reasoning (being replaced by gpt-4o) |

### o1 Series (Advanced Reasoning)

| Model | Input | Output | Best for |
|-------|-------|--------|----------|
| o1-mini | $3.00/1M | $12.00/1M | Math, coding |
| o1 | $15.00/1M | $60.00/1M | Complex multi-step reasoning |

---

# 4. Cost Per Request

## Token Usage Estimate (MSP Analyst)

| Component | Estimated Tokens |
|-----------|-----------------|
| System prompt | ~1,200 |
| User query + context | ~500 |
| **Total Input** | **~1,700** |
| AI response | ~600 |
| **Total Output** | **~600** |
| **Total per Request** | **~2,300** |

## Cost Per Single Request

| Model | Input Cost | Output Cost | Total Cost | Cost in Cents |
|-------|------------|-------------|------------|---------------|
| gpt-4o-mini | $0.000255 | $0.00036 | **$0.000615** | ~0.06¢ |
| gpt-4o | $0.00425 | $0.006 | **$0.01025** | ~1.0¢ |
| gpt-4-turbo | $0.017 | $0.018 | **$0.035** | ~3.5¢ |
| o1-mini | $0.0051 | $0.0072 | **$0.0123** | ~1.2¢ |

## Cost Comparison (Per 1,000 Requests)

| Model | Cost per 1,000 | Relative Cost |
|-------|---------------|---------------|
| gpt-4o-mini | $0.62 | 1x (baseline) |
| gpt-4o | $10.25 | 17x |
| gpt-4-turbo | $35.00 | 57x |
| o1-mini | $12.30 | 20x |

---

# 5. Monthly Cost by Volume

## GPT-4o-mini (Current Model)

| Requests/Month | Requests/Day | Monthly Cost | Annual Cost |
|----------------|--------------|--------------|-------------|
| 1,000 | 33 | $0.62 | $7.44 |
| 5,000 | 167 | $3.08 | $36.96 |
| 10,000 | 333 | $6.15 | $73.80 |
| 25,000 | 833 | $15.38 | $184.56 |
| 50,000 | 1,667 | $30.75 | $369.00 |
| 100,000 | 3,333 | $61.50 | $738.00 |
| 250,000 | 8,333 | $153.75 | $1,845.00 |
| 500,000 | 16,667 | $307.50 | $3,690.00 |
| 1,000,000 | 33,333 | $615.00 | $7,380.00 |

## GPT-4o (Premium Model)

| Requests/Month | Requests/Day | Monthly Cost | Annual Cost |
|----------------|--------------|--------------|-------------|
| 1,000 | 33 | $10.25 | $123.00 |
| 5,000 | 167 | $51.25 | $615.00 |
| 10,000 | 333 | $102.50 | $1,230.00 |
| 25,000 | 833 | $256.25 | $3,075.00 |
| 50,000 | 1,667 | $512.50 | $6,150.00 |
| 100,000 | 3,333 | $1,025.00 | $12,300.00 |
| 250,000 | 8,333 | $2,562.50 | $30,750.00 |
| 500,000 | 16,667 | $5,125.00 | $61,500.00 |
| 1,000,000 | 33,333 | $10,250.00 | $123,000.00 |

## GPT-4-turbo (Legacy Premium)

| Requests/Month | Requests/Day | Monthly Cost | Annual Cost |
|----------------|--------------|--------------|-------------|
| 1,000 | 33 | $35.00 | $420.00 |
| 5,000 | 167 | $175.00 | $2,100.00 |
| 10,000 | 333 | $350.00 | $4,200.00 |
| 25,000 | 833 | $875.00 | $10,500.00 |
| 50,000 | 1,667 | $1,750.00 | $21,000.00 |
| 100,000 | 3,333 | $3,500.00 | $42,000.00 |

---

# 6. Cost Per User

## By Usage Pattern (Monthly)

| Usage Level | Questions/Day | gpt-4o-mini | gpt-4o | gpt-4-turbo |
|-------------|---------------|-------------|--------|-------------|
| Very Light | 2 | $0.04 | $0.62 | $2.10 |
| Light | 5 | $0.09 | $1.54 | $5.25 |
| Moderate | 15 | $0.28 | $4.61 | $15.75 |
| Heavy | 30 | $0.55 | $9.23 | $31.50 |
| Power User | 50 | $0.92 | $15.38 | $52.50 |
| Extreme | 100 | $1.85 | $30.75 | $105.00 |

## By MSP Tier (At Maximum Usage)

| Tier | Daily Limit | Monthly Max Requests | gpt-4o-mini Cost | gpt-4o Cost |
|------|-------------|---------------------|------------------|-------------|
| Free | 10 | 300 | $0.18 | $3.08 |
| Pro | 50 | 1,500 | $0.92 | $15.38 |
| Pro Trader | 200 | 6,000 | $3.69 | $61.50 |

## Realistic Usage (50% of Limit)

| Tier | Realistic Monthly | gpt-4o-mini Cost | gpt-4o Cost |
|------|-------------------|------------------|-------------|
| Free | 150 | $0.09 | $1.54 |
| Pro | 750 | $0.46 | $7.69 |
| Pro Trader | 3,000 | $1.85 | $30.75 |

---

# 7. Tier-Based Projections

## Revenue vs AI Cost Analysis

### Free Tier

| Metric | Value |
|--------|-------|
| Subscription revenue | $0 |
| Max AI requests/month | 300 |
| AI cost (mini) | $0.18 |
| AI cost (4o) | $3.08 |
| **Net impact** | **Loss leader** |

### Pro Tier ($9.99/month)

| Metric | gpt-4o-mini | gpt-4o |
|--------|-------------|--------|
| Subscription revenue | $9.99 | $9.99 |
| Max AI requests/month | 1,500 | 1,500 |
| AI cost (max usage) | $0.92 | $15.38 |
| **Margin at max usage** | **$9.07 (91%)** | **-$5.39 (loss)** |
| Realistic AI cost (50%) | $0.46 | $7.69 |
| **Realistic margin** | **$9.53 (95%)** | **$2.30 (23%)** |

### Pro Trader ($19.99/month)

| Metric | gpt-4o-mini | gpt-4o |
|--------|-------------|--------|
| Subscription revenue | $19.99 | $19.99 |
| Max AI requests/month | 6,000 | 6,000 |
| AI cost (max usage) | $3.69 | $61.50 |
| **Margin at max usage** | **$16.30 (82%)** | **-$41.51 (loss)** |
| Realistic AI cost (50%) | $1.85 | $30.75 |
| **Realistic margin** | **$18.14 (91%)** | **-$10.76 (loss)** |

## Key Insight

⚠️ **GPT-4o is NOT profitable for Pro Trader at current pricing!**

Options:
1. Keep gpt-4o-mini for all tiers
2. Increase Pro Trader price to $49.99+ for GPT-4o
3. Use hybrid approach (mini for most, 4o for specific features)

---

# 8. Scaling Scenarios

## Scenario 1: 100 Paid Users (Launch Phase)

**User Mix:** 70 Pro + 30 Pro Trader

| Model | Pro Users Cost | Pro Trader Cost | Total AI Cost | Total Revenue | Margin |
|-------|---------------|-----------------|---------------|---------------|--------|
| gpt-4o-mini | $32 | $56 | **$88** | $1,299 | **93%** |
| gpt-4o | $539 | $923 | **$1,462** | $1,299 | **-13%** |
| Hybrid | $32 | $923 | **$955** | $1,299 | **26%** |

## Scenario 2: 500 Paid Users (Growth Phase)

**User Mix:** 350 Pro + 150 Pro Trader

| Model | Pro Users Cost | Pro Trader Cost | Total AI Cost | Total Revenue | Margin |
|-------|---------------|-----------------|---------------|---------------|--------|
| gpt-4o-mini | $161 | $278 | **$439** | $6,496 | **93%** |
| gpt-4o | $2,692 | $4,613 | **$7,305** | $6,496 | **-12%** |
| Hybrid | $161 | $4,613 | **$4,774** | $6,496 | **27%** |

## Scenario 3: 1,000 Paid Users (Mature Phase)

**User Mix:** 700 Pro + 300 Pro Trader

| Model | Pro Users Cost | Pro Trader Cost | Total AI Cost | Total Revenue | Margin |
|-------|---------------|-----------------|---------------|---------------|--------|
| gpt-4o-mini | $322 | $555 | **$877** | $12,993 | **93%** |
| gpt-4o | $5,383 | $9,225 | **$14,608** | $12,993 | **-12%** |
| Hybrid | $322 | $9,225 | **$9,547** | $12,993 | **27%** |

---

# 9. Hybrid Model Strategy

## Recommended Approach

Use different models based on tier and feature:

| Tier | Model | Justification |
|------|-------|---------------|
| Free | gpt-4o-mini | Cost control |
| Pro | gpt-4o-mini | Profitable |
| Pro Trader | gpt-4o-mini (default) | Profitable |
| Pro Trader | gpt-4o (premium features) | Selective use |

## Implementation Options

### Option A: All Mini (Maximum Profit)
```
All tiers: gpt-4o-mini
Margin: 90%+
Quality: Good
```

### Option B: Tier-Based (Quality vs Cost Balance)
```
Free/Pro: gpt-4o-mini
Pro Trader: gpt-4o
Margin: ~25% (need price increase)
Quality: Premium for top tier
```

### Option C: Feature-Based (Best Balance)
```
Quick questions: gpt-4o-mini
Deep analysis: gpt-4o
Daily Market Focus: gpt-4o
Margin: 60-70%
Quality: Premium where it matters
```

## Feature-Based Model Selection

| Feature | Model | Cost/Request | Justification |
|---------|-------|--------------|---------------|
| General chat | gpt-4o-mini | $0.0006 | High volume |
| Scanner explanations | gpt-4o-mini | $0.0006 | High volume |
| Portfolio analysis | gpt-4o | $0.01 | Premium feature |
| Journal insights | gpt-4o | $0.01 | Premium feature |
| Daily Market Focus | gpt-4o | $0.01 | Quality matters |
| Strategy generation | gpt-4o | $0.01 | Complex reasoning |

---

# 10. Budget Planning

## Monthly Budget Targets

### Budget: $50/month

| Model | Max Requests | Users Supported | Quality |
|-------|-------------|-----------------|---------|
| gpt-4o-mini | 81,300 | ~135 active | Good |
| gpt-4o | 4,878 | ~8 active | Excellent |
| Hybrid | ~20,000 | ~50 active | Mixed |

### Budget: $100/month

| Model | Max Requests | Users Supported | Quality |
|-------|-------------|-----------------|---------|
| gpt-4o-mini | 162,600 | ~270 active | Good |
| gpt-4o | 9,756 | ~16 active | Excellent |
| Hybrid | ~40,000 | ~100 active | Mixed |

### Budget: $200/month

| Model | Max Requests | Users Supported | Quality |
|-------|-------------|-----------------|---------|
| gpt-4o-mini | 325,200 | ~540 active | Good |
| gpt-4o | 19,512 | ~32 active | Excellent |
| Hybrid | ~80,000 | ~200 active | Mixed |

### Budget: $500/month

| Model | Max Requests | Users Supported | Quality |
|-------|-------------|-----------------|---------|
| gpt-4o-mini | 813,000 | ~1,350 active | Good |
| gpt-4o | 48,780 | ~80 active | Excellent |
| Hybrid | ~200,000 | ~500 active | Mixed |

## Annual Budget Planning

| Monthly Budget | Annual Cost | Users at Scale | Recommended For |
|----------------|-------------|----------------|-----------------|
| $50 | $600 | 50-100 | Launch phase |
| $100 | $1,200 | 100-200 | Early growth |
| $200 | $2,400 | 200-400 | Growth phase |
| $500 | $6,000 | 500-1,000 | Scaling |
| $1,000 | $12,000 | 1,000-2,000 | Mature |

---

# 11. Recommendations

## Immediate Actions

1. **Keep gpt-4o-mini for all tiers** (current setup is optimal)
2. **Monitor usage** via OpenAI dashboard
3. **Set billing alerts** at $50, $100, $200

## Short-Term (Q1 2025)

1. **Implement usage tracking** per user
2. **Add caching** for repeated queries
3. **Optimize prompts** to reduce token usage

## Medium-Term (Q2-Q3 2025)

1. **Consider GPT-4o for Pro Trader** if price increases to $29.99+
2. **Implement feature-based model selection**
3. **Add streaming responses** for better UX

## Long-Term (2026+)

1. **Fine-tune custom model** for MSP-specific analysis
2. **Evaluate Claude/Anthropic** for specific use cases
3. **Consider self-hosted models** at extreme scale

## Pricing Adjustments Needed for GPT-4o

To maintain 70%+ margin with GPT-4o:

| Tier | Current Price | Required Price | Increase |
|------|--------------|----------------|----------|
| Pro | $9.99 | $25.99 | +160% |
| Pro Trader | $19.99 | $99.99 | +400% |

**Recommendation:** Keep gpt-4o-mini until user base justifies premium pricing.

---

# Summary

## Key Takeaways

| Topic | Recommendation |
|-------|----------------|
| ChatGPT Pro vs API | Use API (you have it correct) |
| Current model | gpt-4o-mini is optimal |
| Upgrade to GPT-4o | Only with major price increase |
| Budget for 100 users | ~$50-100/month |
| Budget for 1,000 users | ~$400-600/month |
| Margin target | Keep above 80% with mini |

## Quick Reference Card

| Metric | Value |
|--------|-------|
| Cost per AI request (mini) | ~$0.0006 |
| Cost per AI request (4o) | ~$0.01 |
| Requests per $1 (mini) | ~1,626 |
| Requests per $1 (4o) | ~98 |
| Users per $100/month (mini) | ~270 |
| Users per $100/month (4o) | ~16 |

---

*Document created: December 23, 2025*
*For MarketScanner Pros internal use*
*Review schedule: Monthly*
