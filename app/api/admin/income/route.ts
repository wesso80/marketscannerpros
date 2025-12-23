import { NextRequest, NextResponse } from 'next/server';
import { q } from '@/lib/db';

// Verify admin secret
function verifyAdmin(req: NextRequest): boolean {
  const auth = req.headers.get('authorization');
  if (!auth?.startsWith('Bearer ')) return false;
  const secret = auth.slice(7);
  return secret === process.env.ADMIN_SECRET;
}

// Subscription pricing
const SUBSCRIPTION_PRICES = {
  pro: 9.99,
  pro_trader: 19.99,
  free: 0,
};

// Monthly fixed costs (estimate)
const FIXED_COSTS = {
  render: 25.00,        // Render hosting
  github: 4.00,         // GitHub Pro (will be overwritten by API if available)
  vercel_db: 0,         // Neon free tier
  domain: 1.50,         // ~$18/year = $1.50/month
  alpha_vantage: 49.99, // Alpha Vantage Premium
  stripe_base: 0,       // No monthly fee
};

// Fetch GitHub billing if token available
async function getGitHubBilling(): Promise<number | null> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) return null;
  
  try {
    // Get authenticated user's billing for actions
    const res = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json',
      },
    });
    
    if (!res.ok) return null;
    
    const user = await res.json();
    
    // For personal accounts, try to get billing info
    // Note: GitHub API doesn't expose subscription costs directly
    // This would need to be set manually or use GitHub's billing API for orgs
    
    // Check if user has pro plan
    if (user.plan?.name === 'pro') {
      return 4.00; // GitHub Pro is $4/month
    } else if (user.plan?.name === 'team') {
      return 4.00; // Per user for team
    }
    
    return 0; // Free tier
  } catch {
    return null;
  }
}

// Stripe fee per transaction: 2.9% + $0.30
const STRIPE_PERCENTAGE = 0.029;
const STRIPE_FIXED = 0.30;

export async function GET(req: NextRequest) {
  if (!verifyAdmin(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Get active subscriptions by tier
    const subscriptionRows = await q(`
      SELECT tier, COUNT(*) as count 
      FROM user_subscriptions 
      WHERE status = 'active' AND tier != 'free'
      GROUP BY tier
    `);

    // Get total active subscribers
    const totalActiveRows = await q(`
      SELECT COUNT(*) as total FROM user_subscriptions WHERE status = 'active'
    `);

    // Get new subscriptions this month
    const newThisMonthRows = await q(`
      SELECT tier, COUNT(*) as count 
      FROM user_subscriptions 
      WHERE created_at >= date_trunc('month', CURRENT_DATE)
        AND status = 'active'
        AND tier != 'free'
      GROUP BY tier
    `);

    // Get churn (cancelled) this month
    const churnThisMonthRows = await q(`
      SELECT COUNT(*) as count 
      FROM user_subscriptions 
      WHERE updated_at >= date_trunc('month', CURRENT_DATE)
        AND status = 'cancelled'
    `);

    // Get AI costs for this month (from ai_usage table)
    const aiCostsRows = await q(`
      SELECT 
        COALESCE(SUM(prompt_tokens), 0) as prompt_tokens,
        COALESCE(SUM(completion_tokens), 0) as completion_tokens,
        COUNT(*) as requests
      FROM ai_usage
      WHERE created_at >= date_trunc('month', CURRENT_DATE)
    `);

    // Calculate revenue
    const subscriptionsByTier: Record<string, number> = {};
    for (const row of subscriptionRows) {
      subscriptionsByTier[row.tier] = parseInt(row.count);
    }

    const proCount = subscriptionsByTier['pro'] || 0;
    const proTraderCount = subscriptionsByTier['pro_trader'] || 0;

    const grossRevenue = 
      (proCount * SUBSCRIPTION_PRICES.pro) + 
      (proTraderCount * SUBSCRIPTION_PRICES.pro_trader);

    // Calculate Stripe fees
    const paidSubscriptions = proCount + proTraderCount;
    const stripeFees = paidSubscriptions > 0 
      ? (grossRevenue * STRIPE_PERCENTAGE) + (paidSubscriptions * STRIPE_FIXED)
      : 0;

    const netRevenue = grossRevenue - stripeFees;

    // Calculate AI costs (GPT-4o pricing: $2.50/1M input, $10/1M output)
    const aiUsage = aiCostsRows[0] || { prompt_tokens: 0, completion_tokens: 0, requests: 0 };
    const aiCost = 
      (parseInt(aiUsage.prompt_tokens) / 1_000_000) * 2.50 +
      (parseInt(aiUsage.completion_tokens) / 1_000_000) * 10.00;

    // Try to get GitHub billing from API
    const githubBilling = await getGitHubBilling();
    const fixedCostsWithGitHub = {
      ...FIXED_COSTS,
      github: githubBilling ?? FIXED_COSTS.github,
    };

    // Calculate total fixed costs
    const totalFixedCosts = Object.values(fixedCostsWithGitHub).reduce((a, b) => a + b, 0);

    // Total costs
    const totalCosts = totalFixedCosts + aiCost + stripeFees;

    // Profit
    const profit = grossRevenue - totalCosts;

    // Get historical data (last 6 months)
    const historicalRows = await q(`
      SELECT 
        date_trunc('month', created_at) as month,
        tier,
        COUNT(*) as count
      FROM user_subscriptions
      WHERE created_at >= date_trunc('month', CURRENT_DATE) - INTERVAL '5 months'
        AND tier != 'free'
      GROUP BY date_trunc('month', created_at), tier
      ORDER BY month
    `);

    // Format historical data
    const monthlyData: Record<string, { pro: number; pro_trader: number; revenue: number }> = {};
    for (const row of historicalRows) {
      const monthKey = new Date(row.month).toISOString().slice(0, 7);
      if (!monthlyData[monthKey]) {
        monthlyData[monthKey] = { pro: 0, pro_trader: 0, revenue: 0 };
      }
      if (row.tier === 'pro') {
        monthlyData[monthKey].pro += parseInt(row.count);
      } else if (row.tier === 'pro_trader') {
        monthlyData[monthKey].pro_trader += parseInt(row.count);
      }
    }

    // Calculate revenue for each month
    for (const month in monthlyData) {
      monthlyData[month].revenue = 
        (monthlyData[month].pro * SUBSCRIPTION_PRICES.pro) +
        (monthlyData[month].pro_trader * SUBSCRIPTION_PRICES.pro_trader);
    }

    return NextResponse.json({
      summary: {
        grossRevenue,
        stripeFees,
        netRevenue,
        totalCosts,
        profit,
        profitMargin: grossRevenue > 0 ? (profit / grossRevenue) * 100 : 0,
      },
      subscriptions: {
        pro: proCount,
        proTrader: proTraderCount,
        total: parseInt(totalActiveRows[0]?.total || '0'),
        newThisMonth: newThisMonthRows.reduce((sum, r) => sum + parseInt(r.count), 0),
        churnThisMonth: parseInt(churnThisMonthRows[0]?.count || '0'),
      },
      costs: {
        fixed: fixedCostsWithGitHub,
        totalFixed: totalFixedCosts,
        ai: aiCost,
        stripe: stripeFees,
        total: totalCosts,
      },
      aiUsage: {
        promptTokens: parseInt(aiUsage.prompt_tokens),
        completionTokens: parseInt(aiUsage.completion_tokens),
        requests: parseInt(aiUsage.requests),
        cost: aiCost,
      },
      pricing: SUBSCRIPTION_PRICES,
      history: Object.entries(monthlyData).map(([month, data]) => ({
        month,
        ...data,
      })).sort((a, b) => a.month.localeCompare(b.month)),
    });
  } catch (error) {
    console.error('Income stats error:', error);
    return NextResponse.json({ error: 'Failed to fetch income stats' }, { status: 500 });
  }
}
