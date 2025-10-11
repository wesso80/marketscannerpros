import { sql } from '@vercel/postgres';

export type Tier = 'free' | 'pro' | 'pro_trader';
export type Status = 'active' | 'trialing' | 'past_due' | 'canceled' | 'inactive';

export async function upsertCustomer(workspaceId: string, paddleCustomerId?: string) {
  await sql`
    INSERT INTO billing_customers (workspace_id, paddle_customer_id)
    VALUES (${workspaceId}, ${paddleCustomerId || null})
    ON CONFLICT (workspace_id) 
    DO UPDATE SET 
      paddle_customer_id = COALESCE(EXCLUDED.paddle_customer_id, billing_customers.paddle_customer_id)
  `;
}

export async function setSubscription(
  workspaceId: string,
  tier: Tier,
  status: Status,
  currentPeriodEnd?: Date,
  paddleSubscriptionId?: string
) {
  await sql`
    INSERT INTO subscriptions (workspace_id, tier, status, current_period_end, paddle_subscription_id, updated_at)
    VALUES (${workspaceId}, ${tier}, ${status}, ${currentPeriodEnd || null}, ${paddleSubscriptionId || null}, NOW())
    ON CONFLICT (workspace_id)
    DO UPDATE SET
      tier = EXCLUDED.tier,
      status = EXCLUDED.status,
      current_period_end = EXCLUDED.current_period_end,
      paddle_subscription_id = COALESCE(EXCLUDED.paddle_subscription_id, subscriptions.paddle_subscription_id),
      updated_at = NOW()
  `;
}

export async function getEffectiveTier(workspaceId: string): Promise<Tier> {
  try {
    const result = await sql`
      SELECT tier, status, current_period_end
      FROM subscriptions
      WHERE workspace_id = ${workspaceId}
      LIMIT 1
    `;

    if (result.rows.length === 0) return 'free';

    const sub = result.rows[0];
    const isActive = ['active', 'trialing'].includes(sub.status);
    const notExpired = !sub.current_period_end || new Date(sub.current_period_end) > new Date();

    if (isActive && notExpired) {
      return sub.tier as Tier;
    }

    return 'free';
  } catch (error) {
    console.error('Error getting tier:', error);
    return 'free';
  }
}

export async function getSubscription(workspaceId: string) {
  const result = await sql`
    SELECT s.*, c.paddle_customer_id
    FROM subscriptions s
    LEFT JOIN billing_customers c ON s.workspace_id = c.workspace_id
    WHERE s.workspace_id = ${workspaceId}
    LIMIT 1
  `;
  return result.rows[0] || null;
}
