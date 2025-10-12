const { createClient } = require("@vercel/postgres");

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set");
  }

  const client = createClient({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  // 1) Idempotency table for Stripe events
  await client.query(`
    CREATE TABLE IF NOT EXISTS stripe_events (
      id TEXT PRIMARY KEY,
      created_at TIMESTAMPTZ DEFAULT now()
    );
  `);

  // 2) Ensure user_subscriptions has fields we rely on
  await client.query(`
    ALTER TABLE user_subscriptions
      ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT,
      ADD COLUMN IF NOT EXISTS subscription_status TEXT,
      ADD COLUMN IF NOT EXISTS plan_code TEXT,
      ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
  `);

  // 3) Indexes for fast lookups
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_user_subscriptions_ws
      ON user_subscriptions(workspace_id);
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_user_subscriptions_stripe
      ON user_subscriptions(stripe_subscription_id);
  `);

  await client.end();
  console.log("✅ Migration complete");
}

main().catch((err) => {
  console.error("❌ Migration failed:", err);
  process.exit(1);
});
